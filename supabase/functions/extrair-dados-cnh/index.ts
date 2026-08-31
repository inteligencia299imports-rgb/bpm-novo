import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
// Extração de documento (OCR + leitura de campos) exige um modelo de visão forte;
// o Haiku erra CPF/nome/data em fotos de CNH. Sobrescrevível por env.
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

// ---- Nome: iniciais maiúsculas, mantendo conectivos minúsculos ----
const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function formatarNome(nome: string): string {
  return (nome || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((tok, i) => (i > 0 && CONECTIVOS.has(tok) ? tok : tok.charAt(0).toUpperCase() + tok.slice(1)))
    .join(' ');
}

// remove acentos, pontuação e caixa -> pra comparar nome por proximidade
function normNome(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Similaridade por tokens (Dice) -- fallback local caso a IA não decida.
function similaridadeNome(a: string, b: string): number {
  const ta = new Set(normNome(a).split(' ').filter((t) => t.length > 1));
  const tb = new Set(normNome(b).split(' ').filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

const soDigitos = (v: string | null) => (v || '').replace(/\D/g, '');

/** Normaliza data ("AAAA-MM-DD" ou "DD/MM/AAAA") -> "AAAA-MM-DD"; null se inválida ou idade fora de 0..120. */
function normDataNasc(v: string | null): string | null {
  const raw = (v || '').trim();
  let y = '', mo = '', d = '';
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) { [, y, mo, d] = m; }
  else {
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (m) { d = m[1]; mo = m[2]; y = m[3]; }
  }
  if (!y) return null;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const md = now.getMonth() - dt.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < dt.getDate())) age--;
  if (age < 0 || age > 120) return null;
  return `${y}-${mo}-${d}`;
}

interface ExtracaoCnh {
  eh_cnh: boolean;
  tipo_documento: string | null;
  nome: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  confere_com_cliente: boolean;
}

async function extrairViaClaude(
  fileBase64: string,
  mediaType: string,
  apiKey: string,
  nomeCliente: string,
): Promise<ExtracaoCnh> {
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
      max_tokens: 1024,
      tools: [
        {
          name: 'registrar_dados_cnh',
          description: 'Registra os dados extraídos da CNH (Carteira Nacional de Habilitação) e informa se o titular corresponde ao cliente cadastrado.',
          input_schema: {
            type: 'object',
            properties: {
              leitura: {
                type: 'string',
                description: 'ANTES de preencher os demais campos, transcreva aqui literalmente o que você consegue ler, rótulo por rótulo: "NOME: ...", "CPF: ...", "DATA NASCIMENTO: ...", "Nº REGISTRO: ...", "VALIDADE: ...", "1ª HABILITAÇÃO: ...", "DATA EMISSÃO: ...". Escreva "ilegível" no que não der para ler. Isso serve para você não trocar os campos.',
              },
              eh_cnh: {
                type: 'boolean',
                description: 'true se a imagem é realmente uma CNH (Carteira Nacional de Habilitação) brasileira — modelo antigo em papel ou CNH-e/PID digital. false se é outro documento (CRLV, RG, comprovante, contrato, nota fiscal, etc.).',
              },
              tipo_documento: {
                type: 'string',
                description: 'Quando eh_cnh=false, diga em uma ou duas palavras que documento é (ex.: "CRLV", "RG", "comprovante de residência"). String vazia "" quando eh_cnh=true.',
              },
              nome: { type: 'string', description: 'Nome completo do titular, do campo rotulado "NOME" (NÃO use "NOME SOCIAL" nem "FILIAÇÃO"). String vazia "" se não estiver legível.' },
              cpf: { type: 'string', description: 'Somente os 11 dígitos do campo rotulado "CPF". NUNCA use o "Nº REGISTRO"/"REGISTRO" da CNH (também tem 11 dígitos, mas é outro número). String vazia "" se o campo CPF não estiver legível — nunca invente dígitos.' },
              data_nascimento: { type: 'string', description: 'Data do campo "DATA NASCIMENTO" (ou "DATA, LOCAL DE NASCIMENTO"), no formato AAAA-MM-DD. NUNCA use "VALIDADE", "1ª HABILITAÇÃO" ou "DATA EMISSÃO". String vazia "" se não estiver legível — nunca invente.' },
              confere_com_cliente: {
                type: 'boolean',
                description: `true se o nome do titular da CNH corresponde por proximidade ao cliente cadastrado "${nomeCliente}" (tolere abreviações, ordem, acentos e nomes do meio faltando); false se claramente é outra pessoa.`,
              },
            },
            required: ['leitura', 'eh_cnh', 'tipo_documento', 'nome', 'cpf', 'data_nascimento', 'confere_com_cliente'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_dados_cnh' },
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Você vai receber a imagem de um documento que DEVERIA ser uma CNH brasileira (Carteira Nacional de Habilitação) — modelo antigo (papel) ou novo (CNH-e/PID). A foto pode estar girada, com brilho ou reflexo; leia com muita atenção, ampliando mentalmente as regiões de texto pequeno.\n\n`
                + `Primeiro decida: eh_cnh=true somente se for mesmo uma CNH. Se for outro documento (CRLV do veículo, RG, comprovante, etc.), eh_cnh=false, preencha tipo_documento e deixe os demais campos vazios.\n\n`
                + `Campos a extrair (quando eh_cnh=true):\n`
                + `• nome — campo "NOME" do titular.\n`
                + `• cpf — os 11 dígitos ao lado do rótulo "CPF". CUIDADO: a CNH tem também um "Nº REGISTRO" (ou "REGISTRO") com 11 dígitos, que NÃO é o CPF. Só preencha o CPF se conseguir ler o campo rotulado "CPF".\n`
                + `• data_nascimento — campo "DATA NASCIMENTO", formato AAAA-MM-DD. Não confunda com "VALIDADE", "1ª HABILITAÇÃO" nem "DATA EMISSÃO".\n\n`
                + `Regra de ouro: se qualquer valor não estiver claramente legível, retorne string vazia "" — nunca chute dígitos ou datas.\n`
                + `Preencha primeiro o campo "leitura" (transcrição rótulo a rótulo) e só depois os demais.\n\n`
                + `O cliente cadastrado no sistema é "${nomeCliente}". Defina confere_com_cliente=true apenas se for claramente a mesma pessoa (por proximidade de nome).`,
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
  if (!toolUse) throw new Error('Resposta da IA não retornou os dados esperados');
  const input = toolUse.input as Record<string, unknown>;
  console.log('extrair-dados-cnh leitura da IA:', input.leitura, '=> eh_cnh:', input.eh_cnh, 'tipo:', input.tipo_documento, 'nome:', input.nome, 'cpf:', input.cpf, 'nasc:', input.data_nascimento);

  return {
    eh_cnh: input.eh_cnh !== false,
    tipo_documento: ((input.tipo_documento as string) || '').trim() || null,
    nome: ((input.nome as string) || '').trim() || null,
    cpf: soDigitos((input.cpf as string) ?? '') || null,
    data_nascimento: normDataNasc((input.data_nascimento as string) ?? ''),
    confere_com_cliente: input.confere_com_cliente === true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

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
  if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido (JSON esperado)' }, 400);
  }

  const { cliente_id, url } = body ?? {};
  if (!cliente_id || typeof cliente_id !== 'string' || !url || typeof url !== 'string') {
    return jsonResponse({ error: 'cliente_id e url são obrigatórios' }, 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const mediaType = mediaTypeFromUrl(url);

  const filePromise: Promise<ArrayBuffer | null> = (apiKey && mediaType)
    ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null);

  const [roleRes, clienteRes] = await Promise.all([
    supabaseAdmin
      .from('user_roles')
      .select('app_role')
      .eq('user_id', caller.id)
      .eq('projeto_id', BPM_PROJETO_ID)
      .eq('ativo', true)
      .maybeSingle(),
    supabaseAdmin
      .from('clientes_fornecedores')
      .select('id, nome_razao_social, cpf_cnpj, data_nascimento')
      .eq('id', cliente_id)
      .maybeSingle(),
  ]);

  if (!roleRes.data) return jsonResponse({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);
  const cliente = clienteRes.data as { nome_razao_social: string | null; cpf_cnpj: string | null; data_nascimento: string | null } | null;
  if (!cliente) return jsonResponse({ error: 'Cliente não encontrado' }, 404);

  const vazio = { nome: null, cpf: null, data_nascimento: null };

  if (!apiKey) {
    return jsonResponse({ ...vazio, extraido: false, motivo: 'ANTHROPIC_API_KEY não configurada' }, 200);
  }
  if (!mediaType) {
    return jsonResponse({ ...vazio, extraido: false, motivo: 'Formato de arquivo não suportado para extração' }, 200);
  }

  try {
    const buffer = await filePromise;
    if (!buffer) {
      return jsonResponse({ ...vazio, extraido: false, motivo: 'Falha ao baixar o arquivo da CNH' }, 200);
    }
    const base64 = arrayBufferToBase64(buffer);
    const nomeCliente = (cliente.nome_razao_social || '').trim();
    const extraido = await extrairViaClaude(base64, mediaType, apiKey, nomeCliente || '(sem nome cadastrado)');

    // O arquivo anexado não é uma CNH (CRLV, RG, comprovante...) -> rejeita e faz rollback.
    if (!extraido.eh_cnh) {
      const tipo = extraido.tipo_documento ? ` (parece ser: ${extraido.tipo_documento})` : '';
      return jsonResponse({
        ...vazio,
        extraido: false,
        match: false,
        motivo: `O arquivo anexado não é uma CNH${tipo}. Anexe a CNH do cliente (frente com foto ou o PDF da CNH Digital).`,
      }, 200);
    }

    // Conferência de nome: precisa ter nome no documento e bater por proximidade.
    // A IA (com o nome no contexto) é o critério principal; a similaridade
    // local por tokens só barra divergência grosseira.
    const sim = nomeCliente && extraido.nome ? similaridadeNome(nomeCliente, extraido.nome) : 1;
    const confere = nomeCliente
      ? extraido.confere_com_cliente && sim >= 0.25
      : true; // cliente sem nome cadastrado -> nada pra divergir

    if (!confere) {
      return jsonResponse({
        ...vazio,
        extraido: false,
        match: false,
        motivo: `A CNH anexada não parece ser do cliente: o cadastro é "${nomeCliente}" e o documento indica "${extraido.nome ?? '?'}".`,
      }, 200);
    }

    const cpfCadastrado = soDigitos(cliente.cpf_cnpj);
    const nascCadastrado = (cliente.data_nascimento || '').slice(0, 10) || null;

    // "Match forte" = a IA confirmou E a similaridade de nome é alta. É o que
    // autoriza SOBRESCREVER um campo já preenchido (CPF / data de nascimento).
    // Preencher um campo vazio exige apenas o match normal já validado acima.
    const matchForte = !!nomeCliente && extraido.confere_com_cliente && sim >= 0.6;

    const updatePayload: Record<string, string> = {};
    if (extraido.nome) updatePayload.nome_razao_social = formatarNome(extraido.nome);

    const divergencias: string[] = [];

    let atualizouCpf = false;
    if (extraido.cpf && extraido.cpf.length === 11 && extraido.cpf !== cpfCadastrado) {
      if (!cpfCadastrado || matchForte) {
        updatePayload.cpf_cnpj = extraido.cpf;
        atualizouCpf = true;
      } else {
        divergencias.push(`CPF do documento (${extraido.cpf}) difere do cadastro`);
      }
    }

    let atualizouNascimento = false;
    if (extraido.data_nascimento && extraido.data_nascimento !== nascCadastrado) {
      if (!nascCadastrado || matchForte) {
        updatePayload.data_nascimento = extraido.data_nascimento;
        atualizouNascimento = true;
      } else {
        divergencias.push(`data de nascimento do documento (${extraido.data_nascimento}) difere do cadastro`);
      }
    }

    console.log('extrair-dados-cnh update:', JSON.stringify(updatePayload), 'matchForte:', matchForte, 'sim:', sim.toFixed(2), 'divergencias:', divergencias);

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from('clientes_fornecedores').update(updatePayload).eq('id', cliente_id);
    }

    return jsonResponse({
      extraido: true,
      match: true,
      nome: updatePayload.nome_razao_social ?? null,
      cpf: atualizouCpf ? extraido.cpf : null,
      atualizou_cpf: atualizouCpf,
      data_nascimento: updatePayload.data_nascimento ?? null,
      atualizou_nascimento: atualizouNascimento,
      divergencias: divergencias.length ? divergencias : undefined,
    }, 200);
  } catch (err) {
    console.error('extrair-dados-cnh error', err);
    return jsonResponse({
      ...vazio,
      extraido: false,
      motivo: err instanceof Error ? err.message : String(err),
    }, 200);
  }
});
