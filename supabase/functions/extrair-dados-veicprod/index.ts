import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface VeicProdExtraido {
  potencia_motor: string | null;
  peso_liquido: string | null;
  peso_bruto: string | null;
  numero_motor: string | null;
  codigo_cor_fabricante: string | null;
  codigo_cor_denatran: string | null;
  codigo_marca_modelo_denatran: string | null;
}

const CAMPOS = [
  'potencia_motor', 'peso_liquido', 'peso_bruto', 'numero_motor',
  'codigo_cor_fabricante', 'codigo_cor_denatran', 'codigo_marca_modelo_denatran',
] as const;

/**
 * Extrai o grupo <veicProd> (veículo novo) do XML da NF-e de entrada (compra
 * da montadora) — mesmas tags lidas na emissão da NF-e de venda
 * (emitir-nfe-compra/payload.ts): pot, pesoL, pesoB, nMotor, cCor,
 * cCorDENATRAN, cMod. Restringe ao bloco <veicProd> pra não casar com outra
 * tag homônima em outro lugar do XML.
 */
function extrairVeicProd(xml: string): VeicProdExtraido | null {
  const bloco = xml.match(/<veicProd>[\s\S]*?<\/veicProd>/)?.[0];
  if (!bloco) return null;
  const tag = (nome: string) => bloco.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1]?.trim() || null;
  return {
    potencia_motor: tag('pot'),
    peso_liquido: tag('pesoL'),
    peso_bruto: tag('pesoB'),
    numero_motor: tag('nMotor'),
    codigo_cor_fabricante: tag('cCor'),
    codigo_cor_denatran: tag('cCorDENATRAN'),
    codigo_marca_modelo_denatran: tag('cMod'),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido (JSON esperado)' }, 400);
  }

  const estoqueMotoNovaId = body?.estoque_moto_nova_id;
  if (!estoqueMotoNovaId || typeof estoqueMotoNovaId !== 'string') {
    return jsonResponse({ error: 'estoque_moto_nova_id é obrigatório' }, 400);
  }

  const { data: roleData } = await admin
    .from('user_roles').select('app_role').eq('user_id', caller.id).eq('projeto_id', BPM_PROJETO_ID).eq('ativo', true).maybeSingle();
  if (!roleData) return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);

  const { data: emn } = await admin
    .from('estoque_motos_novas')
    .select(
      'id, loja_id, atendimento_venda_id, potencia_motor, peso_liquido, peso_bruto, numero_motor, ' +
        'codigo_cor_fabricante, codigo_cor_denatran, codigo_marca_modelo_denatran, ' +
        'atendimento_venda:atendimento_venda_id(vendedor_id)',
    )
    .eq('id', estoqueMotoNovaId)
    .maybeSingle();
  if (!emn) return jsonResponse({ error: 'Moto 0km não encontrada' }, 404);

  const isVendedor = (emn as any).atendimento_venda?.vendedor_id === caller.id;
  let temAcesso = isVendedor || roleData.app_role === 'master';
  if (!temAcesso && (emn as any).loja_id) {
    const { data: ok } = await admin.rpc('has_master_or_gerente_empresa', {
      _user_id: caller.id,
      _loja_id: (emn as any).loja_id,
    });
    temAcesso = !!ok;
  }
  if (!temAcesso) return jsonResponse({ error: 'Forbidden: sem acesso a esta moto' }, 403);

  const { data: nfCompra } = await admin
    .from('nfe_entradas')
    .select('id, xml_raw')
    .eq('estoque_moto_nova_id', estoqueMotoNovaId)
    .eq('operacao', 'compra')
    .not('xml_raw', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!nfCompra?.xml_raw) {
    return jsonResponse({ error: 'Esta moto não tem NF-e de entrada (compra) com XML vinculado no sistema.' }, 409);
  }

  const extraido = extrairVeicProd(String(nfCompra.xml_raw));
  if (!extraido) {
    return jsonResponse({ error: 'O XML da NF-e de entrada não tem o grupo veicProd (veículo novo).' }, 422);
  }

  // Só preenche o que está faltando — não sobrescreve valor já cadastrado
  // (pode ter sido corrigido manualmente por algum motivo).
  const updatePayload: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const atual = (emn as any)[campo];
    const novo = extraido[campo];
    if (!String(atual ?? '').trim() && novo) updatePayload[campo] = novo;
  }

  if (Object.keys(updatePayload).length === 0) {
    return jsonResponse({ atualizado: false, motivo: 'Nada encontrado no XML para preencher (campos já preenchidos ou ausentes na nota).' }, 200);
  }

  const { error: updErr } = await admin.from('estoque_motos_novas').update(updatePayload).eq('id', estoqueMotoNovaId);
  if (updErr) return jsonResponse({ error: `Falha ao gravar: ${updErr.message}` }, 500);

  return jsonResponse({ atualizado: true, campos: updatePayload }, 200);
});
