import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

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

function mediaTypeFromUrl(url: string): string | null {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.pdf')) return 'application/pdf';
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface ExtracaoResultado {
  chassi: string | null;
  renavam: string | null;
  placa: string | null;
}

async function extrairViaClaude(fileBase64: string, mediaType: string, apiKey: string): Promise<ExtracaoResultado> {
  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      tools: [
        {
          name: 'registrar_dados_crlv',
          description: 'Registra os dados extraídos do documento CRLV (Certificado de Registro e Licenciamento de Veículo).',
          input_schema: {
            type: 'object',
            properties: {
              chassi: { type: 'string', description: 'Número do chassi (17 caracteres alfanuméricos). Use string vazia "" se não estiver legível/presente — nunca invente um valor.' },
              renavam: { type: 'string', description: 'Número do RENAVAM. Use string vazia "" se não estiver legível/presente — nunca invente um valor.' },
              placa: { type: 'string', description: 'Placa do veículo (padrão antigo LLLNNNN ou Mercosul LLLNLNN). Use string vazia "" se não estiver legível/presente — nunca invente um valor.' },
            },
            required: ['chassi', 'renavam', 'placa'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_dados_crlv' },
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'Este é um documento CRLV (Certificado de Registro e Licenciamento de Veículo) brasileiro. Extraia o número do chassi, o número do RENAVAM e a placa do veículo. Se algum campo não estiver legível ou não estiver presente no documento, retorne null para ele — nunca invente um valor.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API respondeu ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Resposta da IA não retornou os dados esperados');
  }
  const input = toolUse.input as ExtracaoResultado;
  return {
    chassi: input.chassi || null,
    renavam: input.renavam || null,
    placa: input.placa || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

  const { avaliacao_id, url } = body ?? {};
  if (!avaliacao_id || typeof avaliacao_id !== 'string' || !url || typeof url !== 'string') {
    return jsonResponse({ error: 'avaliacao_id e url são obrigatórios' }, 400);
  }

  // Confere que o chamador tem acesso a essa avaliacao (mesmo criterio do
  // resto do sistema).
  const { data: acesso } = await supabaseAdmin
    .from('avaliacoes')
    .select('id, atendimentos_motos!inner(vendedor_id, loja_id)')
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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Extracao e sempre best-effort -- nunca deve derrubar o fluxo de
    // upload do CRLV em si.
    return jsonResponse({ chassi: null, renavam: null, placa: null, extraido: false, motivo: 'ANTHROPIC_API_KEY não configurada' }, 200);
  }

  const mediaType = mediaTypeFromUrl(url);
  if (!mediaType) {
    return jsonResponse({ chassi: null, renavam: null, placa: null, extraido: false, motivo: 'Formato de arquivo não suportado para extração' }, 200);
  }

  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return jsonResponse({ chassi: null, renavam: null, placa: null, extraido: false, motivo: `Falha ao baixar o arquivo (HTTP ${fileRes.status})` }, 200);
    }
    const buffer = await fileRes.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    const extraido = await extrairViaClaude(base64, mediaType, apiKey);

    const updatePayload: Record<string, string> = {};
    if (extraido.chassi) updatePayload.chassi = extraido.chassi;
    if (extraido.renavam) updatePayload.renavam = extraido.renavam;
    if (extraido.placa) updatePayload.placa = extraido.placa;

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from('avaliacoes').update(updatePayload).eq('id', avaliacao_id);
    }

    return jsonResponse({ ...extraido, extraido: true }, 200);
  } catch (err) {
    console.error('extrair-dados-crlv error', err);
    return jsonResponse({
      chassi: null,
      renavam: null,
      placa: null,
      extraido: false,
      motivo: err instanceof Error ? err.message : String(err),
    }, 200);
  }
});
