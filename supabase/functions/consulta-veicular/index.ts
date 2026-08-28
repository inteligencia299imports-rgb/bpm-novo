import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { executarConsulta } from './service.ts';
import { placaValida } from './validators.ts';
import type { ConsultaEntrada } from './types.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // §18 seguranca: tudo aqui roda no backend; certificado/chave/senha
  // nunca saem deste modulo.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !caller) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('app_role')
    .eq('user_id', caller.id)
    .eq('projeto_id', BPM_PROJETO_ID)
    .eq('ativo', true)
    .maybeSingle();

  if (!roleData) {
    return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido (JSON esperado)' }, 400);
  }

  const { placa, uf, renavam, tipo_crv, numero_crv, avaliacao_id } = body ?? {};

  if (!placa || typeof placa !== 'string' || !placaValida(placa)) {
    return jsonResponse({ error: 'Placa inválida (informe no padrão antigo LLLNNNN ou Mercosul LLLNLNN)' }, 400);
  }

  // Se a consulta esta ligada a uma avaliacao, confere que o chamador tem
  // acesso a ela (mesmo criterio das policies do resto do sistema).
  if (avaliacao_id) {
    const { data: acesso } = await supabaseAdmin
      .from('avaliacoes')
      .select('id, atendimento_id, atendimentos_motos!inner(vendedor_id, loja_id)')
      .eq('id', avaliacao_id)
      .maybeSingle();

    if (!acesso) {
      return jsonResponse({ error: 'Avaliação não encontrada' }, 404);
    }

    const atendimento = (acesso as any).atendimentos_motos;
    const isVendedor = atendimento?.vendedor_id === caller.id;
    let temAcesso = isVendedor || roleData.app_role === 'master';
    if (!temAcesso && roleData.app_role === 'gerente' && atendimento?.loja_id) {
      const { data: gerenteOk } = await supabaseAdmin.rpc('has_master_or_gerente_empresa', {
        _user_id: caller.id,
        _loja_id: atendimento.loja_id,
      });
      temAcesso = !!gerenteOk;
    }
    if (!temAcesso) {
      return jsonResponse({ error: 'Forbidden: sem acesso a esta avaliação' }, 403);
    }
  }

  const entrada: ConsultaEntrada = {
    placa,
    uf: typeof uf === 'string' ? uf.toUpperCase() : null,
    renavam: typeof renavam === 'string' && renavam.trim() ? renavam.trim() : null,
    tipo_crv: typeof tipo_crv === 'string' ? tipo_crv : null,
    numero_crv: typeof numero_crv === 'string' ? numero_crv : null,
  };

  try {
    const { resultado, deCache } = await executarConsulta(entrada, {
      avaliacaoId: typeof avaliacao_id === 'string' ? avaliacao_id : null,
      usuarioId: caller.id,
      supabaseAdmin,
    });
    return jsonResponse({ resultado, de_cache: deCache }, 200);
  } catch (err) {
    // §21: erro tecnico nunca vira NADA_CONSTA -- aqui e so o "envelope"
    // HTTP da chamada em si (falha antes mesmo de gerar um resultado
    // normalizado); os indicadores individuais ja tratam falha por fonte.
    console.error('consulta-veicular error', err);
    return jsonResponse({ error: 'Falha ao processar a consulta veicular' }, 500);
  }
});
