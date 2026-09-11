// Cliente do RENAVE-WS (SERPRO) — Registro Nacional de Veículos em Estoque.
// Grupo "Estabelecimento (Concessionária ou Revenda)".
//
// Auth: mTLS com certificado ICP-Brasil e-CNPJ do estabelecimento. Em
// HOMOLOGAÇÃO o SERPRO oferece um "cliente padrão de teste" — basta NÃO enviar
// certificado. Por isso, sem RENAVE_CERT_PEM/RENAVE_KEY_PEM configurados, o
// cliente usa fetch normal (homolog).
//
// Base URL: RENAVE_BASE_URL (default: homolog estaleiro).

const DEFAULT_BASE = 'https://renave.estaleiro.serpro.gov.br/renave-ws';

export interface RenaveResp {
  status: number;
  body: any;
}

function buildClient(): { client: unknown | undefined; base: string } {
  const base = (Deno.env.get('RENAVE_BASE_URL') || DEFAULT_BASE).replace(/\/+$/, '');
  const cert = Deno.env.get('RENAVE_CERT_PEM');
  const key = Deno.env.get('RENAVE_KEY_PEM');
  let client: unknown | undefined;
  if (cert && key) {
    // Deno: fetch com certificado de cliente (mTLS).
    client = (Deno as any).createHttpClient({ cert, key });
  }
  return { client, base };
}

async function call(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
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
  return { status: res.status, body };
}

/** Mensagem de erro legível de uma resposta do RENAVE. */
export function erroRenave(r: RenaveResp): string {
  const b = r.body || {};
  if (typeof b.message === 'string' && b.message) return b.message;
  if (Array.isArray(b.errors) && b.errors.length) {
    return b.errors.map((e: any) => (typeof e === 'string' ? e : (e.message || e.mensagem || JSON.stringify(e)))).join(' | ');
  }
  if (Array.isArray(b.mensagens) && b.mensagens.length) return b.mensagens.join(' | ');
  if (typeof b.raw === 'string' && b.raw) return b.raw.slice(0, 500);
  return `RENAVE HTTP ${r.status}`;
}

// --- Operações ------------------------------------------------------------

export const clienteAutenticado = () => call('GET', '/api/cliente-autenticado');

export const pendentesEntrada = (chassi?: string) =>
  call('GET', '/api/veiculos-zero-km-pendentes-entrada-estoque', { query: { chassi } });

export interface EntradaZeroKm {
  chassi: string;
  chaveNotaFiscal: string;
  valorCompra: number;
  dataEntradaEstoque: string;          // ISO
  dataHoraMedicaoHodometro: string;    // ISO
  quilometragemHodometro: number;
  cpfOperadorResponsavel?: string;
}
export const entrarEstoqueZeroKm = (e: EntradaZeroKm) =>
  call('POST', '/api/entradas-estoque-zero-km', { body: e });

export const enviarNotaFiscal = (chaveNotaFiscal: string, evento: 'COMPRA' | 'VENDA', idEstoque: number) =>
  call('POST', '/api/notas-fiscais', { body: { chaveNotaFiscal, evento, idEstoque } });

export const consultarEstoque = (id: number) => call('GET', `/api/estoques/${id}`);

export const municipios = (nome: string, uf: string) =>
  call('GET', '/api/municipios', { query: { nome, uf } });

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
export const sairEstoqueZeroKm = (s: SaidaZeroKm) =>
  call('POST', '/api/saidas-estoque-veiculo-zero-km', { body: s });

export const pdfAtpvPorChassi = (chassi: string) =>
  call('GET', '/api/pdf-atpv', { query: { chassi } });
