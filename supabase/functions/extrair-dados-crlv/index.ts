import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
// Extração de documento (OCR + leitura de campos) exige um modelo de visão forte;
// o Haiku erra chassi/renavam/placa em fotos de CRLV. Sobrescrevível por env.
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL_EXTRACAO') || 'claude-sonnet-5';

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
  eh_crlv: boolean;
  tipo_documento: string | null;
  chassi: string | null;
  renavam: string | null;
  placa: string | null;
  numero_crv: string | null;
  codigo_seguranca_crv: string | null;
  tipo_crv: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  marca_documento: string | null;
  modelo_documento: string | null;
}

const soAlfaNum = (v: string | null) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
const soDigitos = (v: string | null) => (v || '').replace(/\D/g, '') || null;
// Numero do CRV tem exatamente 12 digitos.
const soNumeroCrv = (v: string | null) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length === 12 ? d : null;
};
// Codigo de seguranca do CRV/CLA tem exatamente 11 digitos -- campo DIFERENTE
// do numero do CRV (12 digitos). Achado 2026-09-22: sao dois campos distintos
// no CRLV (ex.: "NÚMERO DO CRV" vs "CÓDIGO DE SEGURANÇA DO CLA"), exigido pela
// SERPRO pra entrada RENAVE de veiculo proprio (seminova).
const soCodigoSegurancaCrv = (v: string | null) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length === 11 ? d : null;
};
const TIPOS_CRV = ['AZUL', 'VERDE', 'BRANCO', 'DIGITAL'];
const soTipoCrv = (v: string | null) => {
  const t = (v || '').toUpperCase().trim();
  return TIPOS_CRV.includes(t) ? t : null;
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
): Promise<ExtracaoResultado> {
  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

  const workspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Chaves de API vinculadas a identidade exigem o workspace-id no header.
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      tools: [
        {
          name: 'registrar_dados_crlv',
          description: 'Registra os dados extraídos do documento CRLV (Certificado de Registro e Licenciamento de Veículo).',
          input_schema: {
            type: 'object',
            properties: {
              leitura: {
                type: 'string',
                description: 'ANTES de preencher os demais campos, transcreva aqui literalmente o que você lê, rótulo por rótulo: "PLACA: ...", "CHASSI: ...", "RENAVAM: ...", "ANO FAB/ANO MOD: ...", "MARCA/MODELO/VERSÃO: ...", "Nº CRV/CÓDIGO CLA: ...". Escreva "ilegível" no que não der para ler. Isso serve para você não trocar os campos.',
              },
              eh_crlv: {
                type: 'boolean',
                description: 'true se a imagem é realmente um CRLV/CRLV-e (Certificado de Registro e Licenciamento de Veículo) brasileiro. false se é outro documento (CNH, RG, comprovante, contrato, nota fiscal, ATPV/DUT, etc.).',
              },
              tipo_documento: {
                type: 'string',
                description: 'Quando eh_crlv=false, diga em uma ou duas palavras que documento é (ex.: "CNH", "RG", "ATPV-e", "comprovante de residência"). String vazia "" quando eh_crlv=true.',
              },
              marca_documento: { type: 'string', description: 'Marca do veículo exatamente como escrita no CRLV. String vazia "" se não estiver legível.' },
              modelo_documento: { type: 'string', description: 'Modelo/espécie do veículo exatamente como escrito no CRLV. String vazia "" se não estiver legível.' },
              ano_fabricacao: { type: 'string', description: 'Ano de fabricação (4 dígitos). String vazia "" se não estiver legível/presente — nunca invente.' },
              ano_modelo: { type: 'string', description: 'Ano do modelo (4 dígitos). String vazia "" se não estiver legível/presente — nunca invente.' },
              placa: { type: 'string', description: 'Placa do veículo (padrão antigo LLLNNNN, Mercosul carro LLLNLNN ou Mercosul moto LLLNNLN). String vazia "" se não estiver legível/presente — nunca invente.' },
              chassi: { type: 'string', description: 'Número do chassi (17 caracteres alfanuméricos). String vazia "" se não estiver legível/presente — nunca invente.' },
              renavam: { type: 'string', description: 'Número do RENAVAM. String vazia "" se não estiver legível/presente — nunca invente.' },
              numero_crv: { type: 'string', description: 'Número do CRV (12 dígitos), no CRLV aparece como "Nº DO CRV" ou "NÚMERO DO CRV". É um campo DIFERENTE do código de segurança abaixo — não confunda os dois. String vazia "" se não estiver legível/presente — nunca invente.' },
              codigo_seguranca_crv: { type: 'string', description: 'Código de segurança do CRV/CLA (11 dígitos) — no CRLV aparece como "CÓDIGO DE SEGURANÇA DO CLA" ou "CÓDIGO DE SEGURANÇA DO CRV" ou "CAT". É DIFERENTE do número do CRV (aquele tem 12 dígitos, este tem 11). String vazia "" se não estiver legível/presente — nunca invente.' },
              tipo_crv: { type: 'string', description: 'Tipo do CRV: "DIGITAL" se o título do documento disser algo como "CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL" ou "CRLV-e"; caso contrário, a cor impressa no CRLV físico: "AZUL", "VERDE" ou "BRANCO". String vazia "" se não for possível determinar.' },
            },
            required: ['leitura', 'eh_crlv', 'tipo_documento', 'marca_documento', 'modelo_documento', 'ano_fabricacao', 'ano_modelo', 'placa', 'chassi', 'renavam', 'numero_crv', 'codigo_seguranca_crv', 'tipo_crv'],
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
              text: `Você vai receber a imagem de um documento que DEVERIA ser um CRLV / CRLV-e (Certificado de Registro e Licenciamento de Veículo) brasileiro de uma motocicleta. A foto pode estar girada, com brilho ou reflexo; leia com muita atenção, ampliando mentalmente as regiões de texto pequeno.\n\n`
                + `Primeiro decida: eh_crlv=true somente se for mesmo um CRLV. Se for outro documento (CNH, RG, ATPV-e/recibo de compra e venda, comprovante, etc.), eh_crlv=false, preencha tipo_documento e deixe os demais campos vazios.\n\n`
                + `Extraia (quando eh_crlv=true), sempre pelos rótulos do documento:\n`
                + `• placa — campo "PLACA" (7 caracteres).\n`
                + `• chassi — campo "CHASSI" (17 caracteres alfanuméricos; não contém as letras I, O, Q).\n`
                + `• renavam — campo "CÓDIGO RENAVAM" (11 dígitos).\n`
                + `• ano_fabricacao / ano_modelo — campo "ANO FABRICAÇÃO / ANO MODELO" (dois anos de 4 dígitos, ex.: "2019/2020").\n`
                + `• marca/modelo — campo "MARCA / MODELO / VERSÃO".\n`
                + `• numero_crv — campo "Nº DO CRV" / "NÚMERO DO CRV" (12 dígitos).\n`
                + `• codigo_seguranca_crv — campo "CÓDIGO DE SEGURANÇA DO CLA" / "CÓDIGO DE SEGURANÇA DO CRV" (11 dígitos — NÃO é o mesmo campo do número do CRV acima).\n`
                + `• tipo_crv — "DIGITAL" se o título do documento disser "...VEÍCULO - DIGITAL"/"CRLV-e"; senão a cor impressa (AZUL/VERDE/BRANCO).\n\n`
                + `Regra de ouro: se qualquer valor não estiver claramente legível, retorne string vazia "" — nunca chute caracteres.\n`
                + `Preencha primeiro o campo "leitura" (transcrição rótulo a rótulo) e só depois os demais.`,
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
  console.log('extrair-dados-crlv leitura da IA:', input.leitura, '=> eh_crlv:', input.eh_crlv, 'tipo:', input.tipo_documento, 'placa:', input.placa, 'chassi:', input.chassi, 'renavam:', input.renavam);

  return {
    eh_crlv: input.eh_crlv !== false,
    tipo_documento: (((input.tipo_documento as string) ?? '').trim()) || null,
    chassi: soAlfaNum((input.chassi as string) ?? null),
    renavam: soDigitos((input.renavam as string) ?? null),
    placa: soAlfaNum((input.placa as string) ?? null),
    numero_crv: soNumeroCrv((input.numero_crv as string) ?? null),
    codigo_seguranca_crv: soCodigoSegurancaCrv((input.codigo_seguranca_crv as string) ?? null),
    tipo_crv: soTipoCrv((input.tipo_crv as string) ?? null),
    ano_fabricacao: soAno((input.ano_fabricacao as string) ?? null),
    ano_modelo: soAno((input.ano_modelo as string) ?? null),
    marca_documento: limpaTexto((input.marca_documento as string) ?? null),
    modelo_documento: limpaTexto((input.modelo_documento as string) ?? null),
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
    // resto do sistema) e ja traz a placa cadastrada para a conferencia do CRLV.
    supabaseAdmin
      .from('avaliacoes')
      .select('id, placa, chassi, renavam, numero_crv, codigo_seguranca_crv, tipo_crv, ano_fabricacao, ano_modelo, atendimentos_motos!inner(vendedor_id, loja_id)')
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
    chassi: null, renavam: null, placa: null, numero_crv: null, codigo_seguranca_crv: null, tipo_crv: null,
    ano_fabricacao: null, ano_modelo: null, marca_documento: null, modelo_documento: null,
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

    const extraido = await extrairViaClaude(base64, mediaType, apiKey);

    // O arquivo anexado não é um CRLV (CNH, RG, ATPV-e, comprovante...) -> rejeita e faz rollback.
    if (!extraido.eh_crlv) {
      const tipo = extraido.tipo_documento ? ` (parece ser: ${extraido.tipo_documento})` : '';
      return jsonResponse({
        ...vazio,
        extraido: false,
        match: false,
        motivo: `O arquivo anexado não é um CRLV${tipo}. Anexe o CRLV da moto (o documento do veículo, com placa, chassi e RENAVAM).`,
      }, 200);
    }

    // Conferência só pela PLACA — marca/modelo do CRLV costumam vir abreviados
    // ou em formato diferente do cadastro (ex.: "HOND/POP 110I") e geravam
    // rejeição indevida quando usados pra bloquear o anexo.
    const placaCad = soAlfaNum(acesso.placa);
    const match: boolean | null = (extraido.placa && placaCad) ? (extraido.placa === placaCad) : null;

    if (match === false) {
      return jsonResponse({
        ...extraido,
        extraido: false,
        match: false,
        motivo: `O documento CRLV não é da mesma moto: a placa do cadastro é "${acesso.placa}" e a do documento é "${extraido.placa}".`,
      }, 200);
    }

    // "Match forte" = a placa do documento bate com a cadastrada — autoriza
    // SOBRESCREVER um campo já preenchido. Sem placa pra comparar (match ===
    // null, ex.: 1º documento da avaliação, ainda sem placa cadastrada) só
    // preenche os campos que estiverem vazios.
    const matchForte = match === true;

    const updatePayload: Record<string, string> = {};
    const divergencias: string[] = [];
    // norm: função para comparar valor do documento com o já cadastrado.
    const aplica = (
      campo: string,
      valorDoc: string | null,
      valorCadRaw: unknown,
      norm: (v: string | null) => string | null,
      rotulo: string,
    ) => {
      if (!valorDoc) return;
      const valorCad = valorCadRaw == null ? null : String(valorCadRaw);
      if (norm(valorDoc) === norm(valorCad)) return; // igual -> nada a fazer
      if (!norm(valorCad) || matchForte) {
        updatePayload[campo] = valorDoc;
      } else {
        divergencias.push(`${rotulo} do documento (${valorDoc}) difere do cadastro`);
      }
    };
    aplica('ano_fabricacao', extraido.ano_fabricacao, acesso.ano_fabricacao, soDigitos, 'ano de fabricação');
    aplica('ano_modelo', extraido.ano_modelo, acesso.ano_modelo, soDigitos, 'ano do modelo');
    aplica('placa', extraido.placa, acesso.placa, soAlfaNum, 'placa');
    aplica('chassi', extraido.chassi, acesso.chassi, soAlfaNum, 'chassi');
    aplica('renavam', extraido.renavam, acesso.renavam, soDigitos, 'RENAVAM');
    aplica('numero_crv', extraido.numero_crv, acesso.numero_crv, soDigitos, 'nº do CRV');
    aplica('codigo_seguranca_crv', extraido.codigo_seguranca_crv, acesso.codigo_seguranca_crv, soDigitos, 'código de segurança do CRV');
    aplica('tipo_crv', extraido.tipo_crv, acesso.tipo_crv, (v) => (v || '').toUpperCase().trim() || null, 'tipo do CRV');

    console.log('extrair-dados-crlv update:', JSON.stringify(updatePayload), 'matchForte:', matchForte, 'divergencias:', divergencias);

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from('avaliacoes').update(updatePayload).eq('id', avaliacao_id);
    }

    return jsonResponse({
      ...extraido,
      extraido: true,
      match,
      divergencias: divergencias.length ? divergencias : undefined,
      // Campos abaixo refletem o que foi de fato gravado (não o que foi só lido),
      // para o front aplicar apenas as mudanças efetivas.
      ano_fabricacao: updatePayload.ano_fabricacao ?? null,
      ano_modelo: updatePayload.ano_modelo ?? null,
      placa: updatePayload.placa ?? null,
      chassi: updatePayload.chassi ?? null,
      renavam: updatePayload.renavam ?? null,
      numero_crv: updatePayload.numero_crv ?? null,
      codigo_seguranca_crv: updatePayload.codigo_seguranca_crv ?? null,
      tipo_crv: updatePayload.tipo_crv ?? null,
      // Valores lidos do documento (para telas que queiram exibir/depurar).
      lido: {
        marca: extraido.marca_documento, modelo: extraido.modelo_documento,
        ano_fabricacao: extraido.ano_fabricacao, ano_modelo: extraido.ano_modelo,
        placa: extraido.placa, chassi: extraido.chassi,
        renavam: extraido.renavam, numero_crv: extraido.numero_crv,
        codigo_seguranca_crv: extraido.codigo_seguranca_crv, tipo_crv: extraido.tipo_crv,
      },
    }, 200);
  } catch (err) {
    console.error('extrair-dados-crlv error', err);
    return jsonResponse({
      ...vazio,
      extraido: false,
      motivo: err instanceof Error ? err.message : String(err),
    }, 200);
  }
});
