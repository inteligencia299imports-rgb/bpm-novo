// Cliente do RENAVE-WS (SERPRO) — Registro Nacional de Veículos em Estoque.
// Grupo "Estabelecimento (Concessionária ou Revenda)".
//
// Auth: mTLS com certificado ICP-Brasil e-CNPJ do estabelecimento. Em
// HOMOLOGAÇÃO o SERPRO oferece um "cliente padrão de teste" — basta NÃO enviar
// certificado. Por isso, sem RENAVE_CERT_PEM/RENAVE_KEY_PEM configurados, o
// cliente usa fetch normal (homolog).
//
// ATENÇÃO — achado 2026-09-14: "estaleiro" é o nome da PLATAFORMA do SERPRO,
// não é sinônimo de homologação — os dois ambientes vivem sob esse domínio.
// O que diferencia é o prefixo `hom.`:
//   • Homologação (teste, sem certificado): hom.renave.estaleiro.serpro.gov.br
//   • Produção (mTLS obrigatório):          renave.estaleiro.serpro.gov.br
// Confirmado batendo em /api/cliente-autenticado sem certificado: o host SEM
// `hom.` respondeu 401 Unauthorized (produção); o host COM `hom.` respondeu
// 200 com "Estabelecimento padrão de teste" (homologação). O código já teve
// isso invertido — DEFAULT_BASE apontava pro host de PRODUÇÃO.
//
// Base URL: RENAVE_BASE_URL (default: homologação). Setar RENAVE_BASE_URL
// pra `https://renave.estaleiro.serpro.gov.br/renave-ws` (sem `hom.`) —
// junto com pelo menos um par de certificado (ver "Múltiplos
// estabelecimentos (CNPJs)" abaixo) — liga produção (ver buildClient).
//
// Cada chamada é logada em `renave_chamadas` (best-effort — falha ao logar
// nunca derruba a chamada real ao RENAVE) quando o chamador passa `ctx`
// (admin client + chassi/estoque_moto_nova_id/operação/usuário). Ver
// docs no README — tabela usada pra auditoria por moto (chassi).
//
// Múltiplos estabelecimentos (CNPJs) — achado 2026-09-14: a SERPRO
// identifica "quem está chamando" pelo CNPJ do certificado mTLS, não por um
// campo no payload — usar o certificado errado pra um CNPJ gera rejeição
// "CNPJ do estabelecimento solicitante é divergente do CNPJ informado pela
// montadora no pré-cadastro". Como o grupo opera com vários CNPJs (cada um
// com seu próprio e-CNPJ), cada um precisa do PRÓPRIO par de secrets:
//   - Slot "principal" (sem sufixo, já configurado — FAG): RENAVE_CNPJ,
//     RENAVE_CERT_PEM, RENAVE_KEY_PEM.
//   - Slots adicionais (2, 3, 4...): RENAVE_CNPJ_2/RENAVE_CERT_PEM_2/
//     RENAVE_KEY_PEM_2, RENAVE_CNPJ_3/..., etc. — um trio por CNPJ novo.
// `RENAVE_CNPJ*` é só texto (14 dígitos, com ou sem máscara — não é
// sensível); o certificado (.pfx) e a senha de importação NUNCA vão pro
// código nem pra este arquivo — só os secrets PEM já convertidos.
// `buildClient()` escolhe o par certo comparando o CNPJ da empresa dona da
// moto (resolvido em index.ts a partir de estoque_motos_novas.empresa_id)
// contra os `RENAVE_CNPJ*` configurados. CNPJ sem par configurado = chamada
// sai sem certificado (SERPRO rejeita com 401 em produção — falha segura,
// nunca usa o certificado de outro CNPJ por engano).

const DEFAULT_BASE = 'https://hom.renave.estaleiro.serpro.gov.br/renave-ws';
const MAX_CNPJ_SLOTS = 20;

export interface RenaveResp {
  status: number;
  body: any;
}

/** Contexto pra log em `renave_chamadas` — opcional; sem `admin`, não loga. */
export interface RenaveLogCtx {
  admin?: any;
  chassi?: string | null;
  estoqueMotoNovaId?: string | null;
  /** Moto seminova (entrada de veículo próprio) — mutuamente exclusivo com estoqueMotoNovaId. */
  avaliacaoId?: string | null;
  operacao: string;
  usuarioId?: string | null;
  /** CNPJ (só dígitos) do estabelecimento dono da moto — escolhe o certificado certo em buildClient(). */
  cnpjEstabelecimento?: string | null;
}

interface ParCertificado { cnpj: string; cert: string; key: string }

// Achado 2026-09-15: gravar PEM (com quebras de linha) como secret via CLI é
// frágil — tanto `--env-file` com "\n" escapado quanto passar o valor direto
// como argumento (`NAME=$(cat arquivo)`) já geraram secret corrompido em
// produção ("Unable to decode certificate"), mesmo com o PEM validado
// localmente. Pra não depender de acertar a codificação de quebra de linha
// pela CLI/shell, secrets novos podem ser gravados em **base64** do PEM
// (sem quebra de linha nenhuma — imune a esse tipo de problema); aceita as
// duas formas pra não quebrar os slots antigos já configurados como PEM cru.
function decodeCertSecret(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-----BEGIN')) return raw; // já é PEM
  try {
    const decoded = atob(trimmed);
    return decoded.trim().startsWith('-----BEGIN') ? decoded : raw;
  } catch {
    return raw;
  }
}

function candidatosCertificados(): ParCertificado[] {
  const out: ParCertificado[] = [];
  const push = (cnpjRaw: string | undefined, cert: string | undefined, key: string | undefined) => {
    if (cnpjRaw && cert && key) out.push({ cnpj: cnpjRaw.replace(/\D/g, ''), cert: decodeCertSecret(cert), key: decodeCertSecret(key) });
  };
  push(Deno.env.get('RENAVE_CNPJ'), Deno.env.get('RENAVE_CERT_PEM'), Deno.env.get('RENAVE_KEY_PEM'));
  for (let i = 2; i <= MAX_CNPJ_SLOTS; i++) {
    push(Deno.env.get(`RENAVE_CNPJ_${i}`), Deno.env.get(`RENAVE_CERT_PEM_${i}`), Deno.env.get(`RENAVE_KEY_PEM_${i}`));
  }
  return out;
}

function buildClient(cnpjEstabelecimento?: string | null): { client: unknown | undefined; base: string } {
  const baseUrlSecret = Deno.env.get('RENAVE_BASE_URL');
  const base = (baseUrlSecret || DEFAULT_BASE).replace(/\/+$/, '');
  let client: unknown | undefined;
  // O certificado só é anexado quando RENAVE_BASE_URL aponta pra produção —
  // em homologação (base default, host `hom.`) o SERPRO espera o "cliente
  // padrão de teste" sem certificado. Isso evita usar um certificado real de
  // produção contra a homologação por engano (os secrets podem estar
  // configurados de antemão, sem que isso já ligue produção sozinho).
  if (baseUrlSecret) {
    const candidatos = candidatosCertificados();
    const cnpjDigits = cnpjEstabelecimento ? cnpjEstabelecimento.replace(/\D/g, '') : null;
    // Com CNPJ definido, só usa o par exato daquele CNPJ (nunca cai pra outro
    // por engano). Sem CNPJ (ex.: 'cliente'/'pendentes' fora de um contexto
    // de moto/empresa), usa o primeiro configurado como padrão.
    const alvo = cnpjDigits ? candidatos.find((c) => c.cnpj === cnpjDigits) : candidatos[0];
    if (alvo) client = (Deno as any).createHttpClient({ cert: alvo.cert, key: alvo.key });
  }
  return { client, base };
}

async function registrarChamada(
  ctx: RenaveLogCtx | undefined,
  info: { endpoint: string; metodo: string; requestBody: unknown; status: number; responseBody: unknown; erro: string | null },
) {
  if (!ctx?.admin) return;
  const sucesso = info.status >= 200 && info.status < 300;
  try {
    // Sucesso: acumula pra sempre (é a linha do tempo real da moto). Falha:
    // mantém só a última tentativa dessa operação — sem isso, cada retry
    // (comum enquanto se ajusta CFOP/CST/alíquota) empilhava uma linha nova,
    // poluindo o histórico com erros já superados.
    if (!sucesso) {
      let del = ctx.admin.from('renave_chamadas').delete().eq('operacao', ctx.operacao).eq('sucesso', false);
      del = ctx.estoqueMotoNovaId ? del.eq('estoque_moto_nova_id', ctx.estoqueMotoNovaId)
        : ctx.avaliacaoId ? del.eq('avaliacao_id', ctx.avaliacaoId)
        : ctx.chassi ? del.eq('chassi', ctx.chassi)
        : del.is('estoque_moto_nova_id', null).is('avaliacao_id', null).is('chassi', null);
      await del;
    }
    await ctx.admin.from('renave_chamadas').insert({
      chassi: ctx.chassi ? String(ctx.chassi).toUpperCase().replace(/\s/g, '') : null,
      estoque_moto_nova_id: ctx.estoqueMotoNovaId || null,
      avaliacao_id: ctx.avaliacaoId || null,
      operacao: ctx.operacao,
      endpoint: info.endpoint,
      metodo: info.metodo,
      request_body: info.requestBody ?? null,
      status_http: info.status,
      sucesso,
      response_body: info.responseBody ?? null,
      erro_mensagem: info.erro,
      usuario_id: ctx.usuarioId || null,
    });
  } catch (e) {
    // Log é best-effort — nunca deixa a chamada real ao RENAVE falhar por isso.
    console.warn('renave_chamadas insert falhou:', e);
  }
}

async function call(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown; ctx?: RenaveLogCtx } = {},
): Promise<RenaveResp> {
  const { client, base } = buildClient(opts.ctx?.cnpjEstabelecimento);
  const qs = opts.query
    ? '?' + Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const init: RequestInit & { client?: unknown } = {
    method,
    headers: { 'Accept': 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  };
  if (client) init.client = client;
  const res = await fetch(`${base}${path}${qs}`, init as RequestInit);
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  const resp: RenaveResp = { status: res.status, body };
  await registrarChamada(opts.ctx, {
    endpoint: path,
    metodo: method,
    requestBody: opts.query ? { ...opts.query, ...(opts.body as any ?? {}) } : opts.body,
    status: resp.status,
    responseBody: resp.body,
    erro: resp.status >= 400 ? erroRenave(resp) : null,
  });
  return resp;
}

/**
 * Mensagem de erro legível de uma resposta do RENAVE. O formato real de erro
 * da SERPRO (confirmado em produção/homologação) é
 * `{ titulo, detalhe, mensagemParaUsuarioFinal, dataHora }` — prioriza
 * `mensagemParaUsuarioFinal` (é literalmente pra isso que o campo existe),
 * depois `detalhe`, depois `titulo`. Mantém os formatos antigos (message/
 * errors/mensagens/raw) como fallback pra outros endpoints que não sigam
 * esse padrão, e só cai no HTTP genérico se nada disso vier preenchido.
 */
export function erroRenave(r: RenaveResp): string {
  const b = r.body || {};
  if (typeof b.mensagemParaUsuarioFinal === 'string' && b.mensagemParaUsuarioFinal) return b.mensagemParaUsuarioFinal;
  if (typeof b.detalhe === 'string' && b.detalhe) return b.detalhe;
  if (typeof b.titulo === 'string' && b.titulo) return b.titulo;
  if (typeof b.message === 'string' && b.message) return b.message;
  if (Array.isArray(b.errors) && b.errors.length) {
    return b.errors.map((e: any) => (typeof e === 'string' ? e : (e.message || e.mensagem || JSON.stringify(e)))).join(' | ');
  }
  if (Array.isArray(b.mensagens) && b.mensagens.length) return b.mensagens.join(' | ');
  if (typeof b.raw === 'string' && b.raw) return b.raw.slice(0, 500);
  return `RENAVE HTTP ${r.status}`;
}

// --- Operações ------------------------------------------------------------
// Todas aceitam um `ctx` opcional (último parâmetro) pra logar em
// renave_chamadas — sem ele, chamam o RENAVE normalmente, sem logar.

export const clienteAutenticado = (ctx?: RenaveLogCtx) => call('GET', '/api/cliente-autenticado', { ctx });

export const pendentesEntrada = (chassi?: string, ctx?: RenaveLogCtx) =>
  call('GET', '/api/veiculos-zero-km-pendentes-entrada-estoque', { query: { chassi }, ctx });

export interface EntradaZeroKm {
  chassi: string;
  chaveNotaFiscal: string;
  valorCompra: number;
  dataEntradaEstoque: string;          // ISO
  dataHoraMedicaoHodometro: string;    // ISO
  quilometragemHodometro: number;
  cpfOperadorResponsavel?: string;
}
export const entrarEstoqueZeroKm = (e: EntradaZeroKm, ctx?: RenaveLogCtx) =>
  call('POST', '/api/entradas-estoque-zero-km', { body: e, ctx });

// Entrada de moto SEMINOVA (usada) em estoque — grupo "veículo próprio",
// endpoint separado do zero km. Achado 2026-09-22: schema confirmado direto
// no OpenAPI da SERPRO (GET /renave-ws/v2/api-docs?group=Estabelecimento...,
// definição SolicitacaoEntradaEstoqueVeiculoProprio) e validado batendo o
// payload real em homologação (retornou 422 de negócio "veículo não
// encontrado" — ou seja, passou toda a validação de schema). Diferente do
// zero km: não usa chassi/chaveNotaFiscal/valorCompra no payload — usa dados
// do CRLV (código de segurança + tipo). `dataEntradaEstoque` é `date` puro
// (YYYY-MM-DD), não date-time.
export interface EntradaVeiculoProprio {
  cpfOperadorResponsavel: string;
  dataEntradaEstoque: string; // YYYY-MM-DD
  veiculo: {
    codigoSegurancaCrv: string;       // 11 dígitos — "código de segurança do CLA/CRV"
    dataHoraMedicaoHodometro: string; // ISO date-time
    quilometragemHodometro: number;
    tipoCrv: 'AZUL' | 'VERDE' | 'BRANCO' | 'DIGITAL';
    numeroCrv?: string;   // 12 dígitos
    placa?: string;
    renavam?: string;     // 11 dígitos
  };
}
export const entrarEstoqueVeiculoProprio = (e: EntradaVeiculoProprio, ctx?: RenaveLogCtx) =>
  call('POST', '/api/solicitacoes-entrada-estoque-veiculo-proprio', { body: e, ctx });

export const enviarNotaFiscal = (chaveNotaFiscal: string, evento: 'COMPRA' | 'VENDA', idEstoque: number, ctx?: RenaveLogCtx) =>
  call('POST', '/api/notas-fiscais', { body: { chaveNotaFiscal, evento, idEstoque }, ctx });

export const consultarEstoque = (id: number, ctx?: RenaveLogCtx) => call('GET', `/api/estoques/${id}`, { ctx });

// Achado 2026-09-15 (chassi 95V4F00AAPM000003): quando a SERPRO recusa a
// entrada dizendo que o chassi "possui um estoque ativo", `pendentesEntrada`
// NÃO ajuda a recuperar o idEstoque -- por definição, "pendentes" lista só
// quem AINDA NÃO deu entrada, e um chassi com estoque ativo já passou dessa
// fase (nunca aparece lá). Catálogo #66 "Consultar Veículo" (`GET
// /api/veiculos`) foi testado em produção contra esse chassi real: o
// endpoint existe e aceita `chassi` como filtro (200 OK), MAS a resposta não
// tem `id`/`idEstoque` nenhum -- só confirma a restrição de estoque ativo
// (`{ placa: "", renavam: "00000000000", restricoes: [{ codigoTipo: "86" }] }`).
// Ou seja, não resolve o resync sozinho; mantido aqui só como diagnóstico
// (confirma o estado) -- quem chama já sabe que pode não achar `idRecuperado`
// e cai no fallback de erro pedindo verificação manual.
export const consultarVeiculoPorChassi = (chassi: string, ctx?: RenaveLogCtx) =>
  call('GET', '/api/veiculos', { query: { chassi }, ctx });

// Achado 2026-09-15: a busca por nome do SERPRO é sensível a acento — "BRASÍLIA"
// devolve [] (vazio), só "BRASILIA" (sem acento) acha o município (confirmado
// em renave_chamadas). Sem acento aqui na consulta, não só no match local da
// resposta.
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const municipios = (nome: string, uf: string, ctx?: RenaveLogCtx) =>
  call('GET', '/api/municipios', { query: { nome: semAcento(nome), uf }, ctx });

export interface SaidaZeroKm {
  idEstoque: number;
  dataVenda: string;          // ISO
  valorVenda: number;
  chaveNotaFiscal?: string;
  cpfOperadorResponsavel?: string;
  emailEstabelecimento?: string;
  comprador: {
    tipoDocumento: 'CPF' | 'CNPJ';
    numeroDocumento: string;
    nome?: string;
    email?: string;
    endereco?: {
      codigoMunicipio: number;
      cep?: string;
      logradouro?: string;
      numero?: string;
      bairro?: string;
      complemento?: string;
    };
  };
}
export const sairEstoqueZeroKm = (s: SaidaZeroKm, ctx?: RenaveLogCtx) =>
  call('POST', '/api/saidas-estoque-veiculo-zero-km', { body: s, ctx });

export const pdfAtpvPorChassi = (chassi: string, ctx?: RenaveLogCtx) =>
  call('GET', '/api/pdf-atpv', { query: { chassi }, ctx });
