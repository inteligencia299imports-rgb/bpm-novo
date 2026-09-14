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
// junto com RENAVE_CERT_PEM/RENAVE_KEY_PEM — liga produção (ver buildClient).
//
// Cada chamada é logada em `renave_chamadas` (best-effort — falha ao logar
// nunca derruba a chamada real ao RENAVE) quando o chamador passa `ctx`
// (admin client + chassi/estoque_moto_nova_id/operação/usuário). Ver
// docs no README — tabela usada pra auditoria por moto (chassi).

const DEFAULT_BASE = 'https://hom.renave.estaleiro.serpro.gov.br/renave-ws';

export interface RenaveResp {
  status: number;
  body: any;
}

/** Contexto pra log em `renave_chamadas` — opcional; sem `admin`, não loga. */
export interface RenaveLogCtx {
  admin?: any;
  chassi?: string | null;
  estoqueMotoNovaId?: string | null;
  operacao: string;
  usuarioId?: string | null;
}

function buildClient(): { client: unknown | undefined; base: string } {
  const baseUrlSecret = Deno.env.get('RENAVE_BASE_URL');
  const base = (baseUrlSecret || DEFAULT_BASE).replace(/\/+$/, '');
  const cert = Deno.env.get('RENAVE_CERT_PEM');
  const key = Deno.env.get('RENAVE_KEY_PEM');
  let client: unknown | undefined;
  // O certificado só é anexado quando RENAVE_BASE_URL aponta pra produção —
  // em homologação (base default, host `hom.`) o SERPRO espera o "cliente
  // padrão de teste" sem certificado. Isso evita usar um certificado real de
  // produção contra a homologação por engano (RENAVE_CERT_PEM/KEY_PEM podem
  // estar configurados de antemão, sem que isso já ligue produção sozinho).
  if (baseUrlSecret && cert && key) {
    // Deno: fetch com certificado de cliente (mTLS).
    client = (Deno as any).createHttpClient({ cert, key });
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
        : ctx.chassi ? del.eq('chassi', ctx.chassi)
        : del.is('estoque_moto_nova_id', null).is('chassi', null);
      await del;
    }
    await ctx.admin.from('renave_chamadas').insert({
      chassi: ctx.chassi ? String(ctx.chassi).toUpperCase().replace(/\s/g, '') : null,
      estoque_moto_nova_id: ctx.estoqueMotoNovaId || null,
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
  const { client, base } = buildClient();
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

export const enviarNotaFiscal = (chaveNotaFiscal: string, evento: 'COMPRA' | 'VENDA', idEstoque: number, ctx?: RenaveLogCtx) =>
  call('POST', '/api/notas-fiscais', { body: { chaveNotaFiscal, evento, idEstoque }, ctx });

export const consultarEstoque = (id: number, ctx?: RenaveLogCtx) => call('GET', `/api/estoques/${id}`, { ctx });

export const municipios = (nome: string, uf: string, ctx?: RenaveLogCtx) =>
  call('GET', '/api/municipios', { query: { nome, uf }, ctx });

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
