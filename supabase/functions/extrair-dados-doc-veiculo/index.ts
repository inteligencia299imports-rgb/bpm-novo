import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Confere se um ATPV-e ou uma Procuração anexados pertencem à moto da avaliação.
// Não grava campos — só valida (OCR + comparação de placa/chassi/RENAVAM).
const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL_EXTRACAO') || 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}

const soAlfaNum = (v: string | null | undefined) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
const soDigitos = (v: string | null | undefined) => (v || '').replace(/\D/g, '') || null;
const limpaTexto = (v: string | null | undefined) => ((v || '').trim() || null);

type Tipo = 'atpv' | 'procuracao';
const NOME_DOC: Record<Tipo, string> = {
  atpv: 'ATPV-e (Autorização de Transferência de Propriedade de Veículo / recibo de compra e venda)',
  procuracao: 'procuração (instrumento de mandato) referente ao veículo',
};

interface Extracao {
  eh_documento_esperado: boolean;
  tipo_documento: string | null;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  menciona_veiculo: boolean;
  confere_com_moto: boolean | null;
  leitura: string | null;
}

async function extrairViaClaude(fileBase64: string, mediaType: string, apiKey: string, tipo: Tipo, moto: {
  placa: string | null; chassi: string | null; renavam: string | null; marca: string; modelo: string;
}): Promise<Extracao> {
  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

  const ids = [
    moto.placa ? `placa "${moto.placa}"` : null,
    moto.chassi ? `chassi "${moto.chassi}"` : null,
    moto.renavam ? `RENAVAM "${moto.renavam}"` : null,
  ].filter(Boolean).join(', ');
  const refMoto = [moto.marca, moto.modelo].filter(Boolean).join(' ').trim();
  const temReferencia = !!ids;
  const instrucaoConferencia = temReferencia
    ? `A moto cadastrada é ${refMoto ? `"${refMoto}"` : 'uma motocicleta'}, identificada por: ${ids}. `
      + `Compare os identificadores do veículo que aparecem no documento com esses. `
      + `confere_com_moto=true só se pelo menos um identificador forte (chassi, RENAVAM ou placa) do documento corresponder ao cadastrado; `
      + `false se o documento claramente se refere a outro veículo; null se o documento não traz identificadores do veículo para comparar.`
    : `Não há identificadores da moto cadastrados para comparar: confere_com_moto=null.`;

  const workspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      tools: [{
        name: 'registrar_conferencia',
        description: `Registra a leitura do documento e informa se ele é ${NOME_DOC[tipo]} e se pertence à moto cadastrada.`,
        input_schema: {
          type: 'object',
          properties: {
            leitura: { type: 'string', description: 'Transcreva rótulo por rótulo o que consegue ler do documento (placa, chassi, RENAVAM, nomes das partes, tipo do documento no cabeçalho). "ilegível" no que não der.' },
            eh_documento_esperado: { type: 'boolean', description: `true se o documento é ${NOME_DOC[tipo]}. false se é outro documento (CRLV, CNH, RG, nota fiscal, comprovante, contrato de outro tipo, etc.).` },
            tipo_documento: { type: 'string', description: 'Quando eh_documento_esperado=false, diga em 1-2 palavras que documento é. String vazia "" quando true.' },
            placa: { type: 'string', description: 'Placa do veículo no documento (7 caracteres). "" se não houver/ilegível — nunca invente.' },
            chassi: { type: 'string', description: 'Chassi do veículo no documento (17 caracteres alfanuméricos). "" se não houver/ilegível.' },
            renavam: { type: 'string', description: 'RENAVAM do veículo no documento. "" se não houver/ilegível.' },
            menciona_veiculo: { type: 'boolean', description: 'true se o documento menciona um veículo específico (com placa/chassi/renavam/marca/modelo); false se é genérico.' },
            confere_com_moto: { type: 'boolean', description: 'true/false/null conforme a regra passada no texto.' },
          },
          required: ['leitura', 'eh_documento_esperado', 'tipo_documento', 'placa', 'chassi', 'renavam', 'menciona_veiculo', 'confere_com_moto'],
        },
      }],
      tool_choice: { type: 'tool', name: 'registrar_conferencia' },
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Você recebeu a imagem/PDF de um documento que DEVERIA ser ${NOME_DOC[tipo]}, de uma motocicleta. A foto pode estar girada ou com reflexo — leia com atenção.\n\n`
              + `1) Decida eh_documento_esperado. Se for outro documento, preencha tipo_documento e deixe os demais campos vazios/null.\n`
              + `2) Se for o documento esperado, extraia placa, chassi (17 caracteres; não contém I, O, Q) e RENAVAM pelos rótulos do documento. Retorne "" quando não estiver claramente legível — nunca chute.\n`
              + `3) Preencha primeiro "leitura" e depois os demais.\n\n`
              + instrucaoConferencia,
          },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API respondeu ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Resposta da IA não retornou os dados esperados');
  const input = toolUse.input as Record<string, unknown>;
  console.log(`extrair-dados-doc-veiculo(${tipo}) leitura:`, input.leitura, '=> esperado:', input.eh_documento_esperado, 'placa:', input.placa, 'chassi:', input.chassi, 'renavam:', input.renavam, 'confere:', input.confere_com_moto);
  return {
    eh_documento_esperado: input.eh_documento_esperado !== false,
    tipo_documento: limpaTexto(input.tipo_documento as string),
    placa: soAlfaNum(input.placa as string),
    chassi: soAlfaNum(input.chassi as string),
    renavam: soDigitos(input.renavam as string),
    menciona_veiculo: input.menciona_veiculo === true,
    confere_com_moto: temReferencia ? (input.confere_com_moto === true ? true : input.confere_com_moto === false ? false : null) : null,
    leitura: limpaTexto(input.leitura as string),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }
  const { avaliacao_id, url } = body ?? {};
  const tipo: Tipo = body?.tipo === 'procuracao' ? 'procuracao' : 'atpv';
  if (!avaliacao_id || typeof avaliacao_id !== 'string' || !url || typeof url !== 'string') {
    return jsonResponse({ error: 'avaliacao_id e url são obrigatórios' }, 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const mediaType = mediaTypeFromUrl(url);
  const filePromise: Promise<ArrayBuffer | null> = (apiKey && mediaType)
    ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null);

  const [roleRes, acessoRes] = await Promise.all([
    supabaseAdmin.from('user_roles').select('app_role').eq('user_id', caller.id).eq('projeto_id', BPM_PROJETO_ID).eq('ativo', true).maybeSingle(),
    supabaseAdmin.from('avaliacoes')
      .select('id, marca:marca_id(nome), modelo:modelo_id(nome), placa, chassi, renavam, atendimentos_motos!inner(vendedor_id, loja_id)')
      .eq('id', avaliacao_id).maybeSingle(),
  ]);

  if (!roleRes.data) return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);
  const acesso = acessoRes.data as any;
  if (!acesso) return jsonResponse({ error: 'Avaliação não encontrada' }, 404);
  const _nome = (v: any) => (v && typeof v === 'object' ? (v.nome ?? '') : (v ?? ''));

  const atendimento = acesso.atendimentos_motos;
  let temAcesso = atendimento?.vendedor_id === caller.id || roleRes.data.app_role === 'master';
  if (!temAcesso && roleRes.data.app_role === 'gerente' && atendimento?.loja_id) {
    const { data: gerenteOk } = await supabaseAdmin.rpc('has_master_or_gerente_empresa', { _user_id: caller.id, _loja_id: atendimento.loja_id });
    temAcesso = !!gerenteOk;
  }
  if (!temAcesso) return jsonResponse({ error: 'Forbidden: sem acesso a esta avaliação' }, 403);

  // Extração é best-effort — nunca derruba o upload em si.
  if (!apiKey) return jsonResponse({ extraido: false, match: null, motivo: 'ANTHROPIC_API_KEY não configurada' }, 200);
  if (!mediaType) return jsonResponse({ extraido: false, match: null, motivo: 'Formato de arquivo não suportado para conferência' }, 200);

  try {
    const buffer = await filePromise;
    if (!buffer) return jsonResponse({ extraido: false, match: null, motivo: 'Falha ao baixar o arquivo' }, 200);

    const moto = {
      placa: soAlfaNum(acesso.placa), chassi: soAlfaNum(acesso.chassi), renavam: soDigitos(acesso.renavam),
      marca: (_nome(acesso.marca) || '').trim(), modelo: (_nome(acesso.modelo) || '').trim(),
    };
    const ex = await extrairViaClaude(arrayBufferToBase64(buffer), mediaType, apiKey, tipo, moto);

    const nomeCurto = tipo === 'atpv' ? 'ATPV-e' : 'procuração';
    if (!ex.eh_documento_esperado) {
      const t = ex.tipo_documento ? ` (parece ser: ${ex.tipo_documento})` : '';
      return jsonResponse({
        extraido: false, match: false,
        motivo: `O arquivo anexado não é ${tipo === 'atpv' ? 'um' : 'uma'} ${nomeCurto}${t}. Anexe ${tipo === 'atpv' ? 'o ATPV-e' : 'a procuração'} da moto.`,
        lido: ex,
      }, 200);
    }

    // Comparação determinística dos identificadores fortes (chassi > renavam > placa).
    const par = (a: string | null, b: string | null) => (a && b ? (a === b ? 'igual' : 'difere') : 'sem_dado');
    const cChassi = par(ex.chassi, moto.chassi);
    const cRenavam = par(ex.renavam, moto.renavam);
    const cPlaca = par(ex.placa, moto.placa);
    const algumIgual = [cChassi, cRenavam, cPlaca].includes('igual');
    const algumDifere = [cChassi, cRenavam, cPlaca].includes('difere');

    let match: boolean | null;
    let motivo: string | undefined;
    if (algumIgual && !algumDifere) {
      match = true;
    } else if (algumDifere && !algumIgual) {
      match = false;
      motivo = `${nomeCurto} não é da mesma moto: identificadores do documento (chassi ${ex.chassi ?? '?'}, RENAVAM ${ex.renavam ?? '?'}, placa ${ex.placa ?? '?'}) não conferem com o cadastro (chassi ${moto.chassi ?? '?'}, RENAVAM ${moto.renavam ?? '?'}, placa ${moto.placa ?? '?'}).`;
    } else if (algumIgual && algumDifere) {
      // Um bate e outro não — trata como não confere (documento possivelmente adulterado/errado).
      match = false;
      motivo = `${nomeCurto} com identificadores inconsistentes: parte confere e parte diverge do cadastro. Confira o documento.`;
    } else {
      // Nenhum identificador comparável → cai no julgamento da IA / inconclusivo.
      match = ex.confere_com_moto;
      if (match === false) motivo = `${nomeCurto} aparenta ser de outro veículo.`;
      else if (match === null) motivo = `Não foi possível confirmar que ${tipo === 'atpv' ? 'o ATPV-e' : 'a procuração'} é desta moto — confira manualmente.`;
    }

    return jsonResponse({ extraido: true, match, motivo, lido: ex }, 200);
  } catch (err) {
    console.error('extrair-dados-doc-veiculo error', err);
    return jsonResponse({ extraido: false, match: null, motivo: err instanceof Error ? err.message : String(err) }, 200);
  }
});
