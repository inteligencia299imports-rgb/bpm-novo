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
  numero_crv: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  marca_documento: string | null;
  modelo_documento: string | null;
  // A IA compara marca/modelo do documento com o que esta cadastrado na moto
  // (tolerando abreviacoes e formatos diferentes do CRLV). Fica null quando
  // nao ha marca/modelo cadastrados para comparar.
  confere_com_moto: boolean | null;
}

interface MotoEsperada {
  marca: string;
  modelo: string;
}

const soAlfaNum = (v: string | null) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
const soDigitos = (v: string | null) => (v || '').replace(/\D/g, '') || null;
// Numero do CRV tem exatamente 12 digitos.
const soNumeroCrv = (v: string | null) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length === 12 ? d : null;
};
const soAno = (v: string | null) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(0, 4) : null;
};
const limpaTexto = (v: string | null) => {
  const t = (v || '').trim();
  return t || null;
};

async function extrairViaClaude(
  fileBase64: string,
  mediaType: string,
  apiKey: string,
  moto: MotoEsperada,
): Promise<ExtracaoResultado> {
  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

  const temReferencia = !!(moto.marca && moto.modelo);
  const instrucaoConferencia = temReferencia
    ? `A moto cadastrada no sistema é: marca "${moto.marca}", modelo "${moto.modelo}". `
      + `Compare a MARCA e o MODELO que aparecem no CRLV com essa moto. `
      + `O CRLV costuma escrever de forma abreviada ou em outro formato (ex.: "HONDA/CG 160 FAN", "YAMAHA/YZF R3", "HOND/POP 110I") — `
      + `considere que é a mesma moto quando marca e modelo correspondem por similaridade, mesmo com abreviações, barras ou ordem diferente. `
      + `Defina confere_com_moto=true apenas se for claramente a mesma moto; caso contrário false.`
    : `Não há marca/modelo cadastrados para comparar: defina confere_com_moto=null.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      tools: [
        {
          name: 'registrar_dados_crlv',
          description: 'Registra os dados extraídos do documento CRLV (Certificado de Registro e Licenciamento de Veículo) e informa se ele corresponde à moto cadastrada.',
          input_schema: {
            type: 'object',
            properties: {
              marca_documento: { type: 'string', description: 'Marca do veículo exatamente como escrita no CRLV. String vazia "" se não estiver legível.' },
              modelo_documento: { type: 'string', description: 'Modelo/espécie do veículo exatamente como escrito no CRLV. String vazia "" se não estiver legível.' },
              confere_com_moto: {
                type: 'boolean',
                description: 'true se a marca/modelo do CRLV correspondem (por similaridade) à moto cadastrada informada; false se claramente é outra moto. Se não houver moto de referência, o chamador ignora este campo.',
              },
              ano_fabricacao: { type: 'string', description: 'Ano de fabricação (4 dígitos). String vazia "" se não estiver legível/presente — nunca invente.' },
              ano_modelo: { type: 'string', description: 'Ano do modelo (4 dígitos). String vazia "" se não estiver legível/presente — nunca invente.' },
              placa: { type: 'string', description: 'Placa do veículo (padrão antigo LLLNNNN, Mercosul carro LLLNLNN ou Mercosul moto LLLNNLN). String vazia "" se não estiver legível/presente — nunca invente.' },
              chassi: { type: 'string', description: 'Número do chassi (17 caracteres alfanuméricos). String vazia "" se não estiver legível/presente — nunca invente.' },
              renavam: { type: 'string', description: 'Número do RENAVAM. String vazia "" se não estiver legível/presente — nunca invente.' },
              numero_crv: { type: 'string', description: 'Número do CRV (12 dígitos), no CRLV aparece como "Nº DO CRV" ou "NÚMERO DO CRV". String vazia "" se não estiver legível/presente — nunca invente.' },
            },
            required: ['marca_documento', 'modelo_documento', 'confere_com_moto', 'ano_fabricacao', 'ano_modelo', 'placa', 'chassi', 'renavam', 'numero_crv'],
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
              text: `Este é um documento CRLV (Certificado de Registro e Licenciamento de Veículo) brasileiro de uma motocicleta. `
                + `Extraia: marca e modelo (como escritos no documento), ano de fabricação, ano do modelo, placa, chassi, RENAVAM e número do CRV. `
                + `Se algum campo não estiver legível ou não estiver presente, retorne string vazia "" — nunca invente um valor. `
                + instrucaoConferencia,
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
  const input = toolUse.input as Record<string, unknown>;

  return {
    chassi: soAlfaNum((input.chassi as string) ?? null),
    renavam: soDigitos((input.renavam as string) ?? null),
    placa: soAlfaNum((input.placa as string) ?? null),
    numero_crv: soNumeroCrv((input.numero_crv as string) ?? null),
    ano_fabricacao: soAno((input.ano_fabricacao as string) ?? null),
    ano_modelo: soAno((input.ano_modelo as string) ?? null),
    marca_documento: limpaTexto((input.marca_documento as string) ?? null),
    modelo_documento: limpaTexto((input.modelo_documento as string) ?? null),
    confere_com_moto: temReferencia ? input.confere_com_moto === true : null,
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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const mediaType = mediaTypeFromUrl(url);

  // O gargalo e a chamada de visao da IA. Enquanto rodam as checagens de
  // acesso (varios round-trips ao Postgres), ja disparamos o download do
  // arquivo em paralelo -- o objeto do bucket e publico, nao depende do auth.
  const filePromise: Promise<ArrayBuffer | null> = (apiKey && mediaType)
    ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null);

  const [roleRes, acessoRes] = await Promise.all([
    supabaseAdmin
      .from('user_roles')
      .select('app_role')
      .eq('user_id', caller.id)
      .eq('projeto_id', BPM_PROJETO_ID)
      .eq('ativo', true)
      .maybeSingle(),
    // Confere que o chamador tem acesso a essa avaliacao (mesmo criterio do
    // resto do sistema) e ja traz marca/modelo para a conferencia do CRLV.
    supabaseAdmin
      .from('avaliacoes')
      .select('id, marca, modelo, atendimentos_motos!inner(vendedor_id, loja_id)')
      .eq('id', avaliacao_id)
      .maybeSingle(),
  ]);

  const roleData = roleRes.data;
  if (!roleData) {
    return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);
  }

  const acesso = acessoRes.data as any;
  if (!acesso) {
    return jsonResponse({ error: 'Avaliação não encontrada' }, 404);
  }

  const atendimento = acesso.atendimentos_motos;
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

  const vazio = {
    chassi: null, renavam: null, placa: null, numero_crv: null, ano_fabricacao: null, ano_modelo: null,
    marca_documento: null, modelo_documento: null,
  };

  if (!apiKey) {
    // Extracao e sempre best-effort -- nunca deve derrubar o fluxo de
    // upload do CRLV em si.
    return jsonResponse({ ...vazio, extraido: false, motivo: 'ANTHROPIC_API_KEY não configurada' }, 200);
  }

  if (!mediaType) {
    return jsonResponse({ ...vazio, extraido: false, motivo: 'Formato de arquivo não suportado para extração' }, 200);
  }

  try {
    const buffer = await filePromise;
    if (!buffer) {
      return jsonResponse({ ...vazio, extraido: false, motivo: 'Falha ao baixar o arquivo do CRLV' }, 200);
    }
    const base64 = arrayBufferToBase64(buffer);

    const moto: MotoEsperada = { marca: (acesso.marca || '').trim(), modelo: (acesso.modelo || '').trim() };
    const extraido = await extrairViaClaude(base64, mediaType, apiKey, moto);

    // Só grava se o CRLV for (por similaridade) da mesma moto cadastrada.
    if (extraido.confere_com_moto === false) {
      return jsonResponse({
        ...extraido,
        extraido: false,
        match: false,
        motivo: `O documento CRLV não é da mesma moto: o cadastro é "${moto.marca} ${moto.modelo}" e o documento indica `
          + `"${extraido.marca_documento ?? '?'} ${extraido.modelo_documento ?? '?'}".`,
      }, 200);
    }

    const updatePayload: Record<string, string> = {};
    if (extraido.ano_fabricacao) updatePayload.ano_fabricacao = extraido.ano_fabricacao;
    if (extraido.ano_modelo) updatePayload.ano_modelo = extraido.ano_modelo;
    if (extraido.placa) updatePayload.placa = extraido.placa;
    if (extraido.chassi) updatePayload.chassi = extraido.chassi;
    if (extraido.renavam) updatePayload.renavam = extraido.renavam;
    if (extraido.numero_crv) updatePayload.numero_crv = extraido.numero_crv;

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from('avaliacoes').update(updatePayload).eq('id', avaliacao_id);
    }

    return jsonResponse({ ...extraido, extraido: true, match: extraido.confere_com_moto === null ? null : true }, 200);
  } catch (err) {
    console.error('extrair-dados-crlv error', err);
    return jsonResponse({
      ...vazio,
      extraido: false,
      motivo: err instanceof Error ? err.message : String(err),
    }, 200);
  }
});
