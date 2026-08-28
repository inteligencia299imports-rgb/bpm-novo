import type { ConsultaEntrada, RenaveAptidaoRaw } from '../types.ts';

/**
 * RenaveProvider: chama "Consultar aptidao para entrada em estoque" do
 * RENAVE (https://centraldeajuda.serpro.gov.br/renave/operacoes/consultar-aptidao-veiculo-estoque/).
 *
 * PENDENTE DE CONFIRMACAO CONTRA O SWAGGER OFICIAL:
 *   - RENAVE_PATH abaixo e um palpite baseado no padrao REST das demais
 *     operacoes documentadas (nao verificado -- o Swagger real so aparece
 *     autenticado com o certificado mTLS em
 *     https://renave.estaleiro.serpro.gov.br/renave-ws/swagger-ui.html).
 *   - Os nomes de campo da REQUEST_BODY e do parseResponse() abaixo sao
 *     placeholders. NAO usar em producao sem validar contra o Swagger real.
 *
 * O que ESTA confirmado pela documentacao publica (nao inventado):
 *   - A operacao retorna diagnostico apto/nao apto + motivos de inaptidao.
 *   - Retorna dados informativos do veiculo (Renavam/Detran), incluindo
 *     valores de debitos existentes e ate 5 boletos informados pelo Detran.
 *   - Falha de comunicacao com o Detran e informada separadamente (nao e
 *     "apto" nem "nao apto" -- fica indeterminado).
 *   - Motivos de inaptidao documentados: roubo/furto, restricao de alarme,
 *     leilao, pendencia de emissao de CRV, restricao judicial (Renajud),
 *     restricao da Receita Federal (RFB), pendencia impeditiva do Detran,
 *     restricao PGFN, debito com o Detran, comunicacao de venda para outro
 *     comprador, licenciamento provisorio, autorizacao de transferencia de
 *     estoque pendente, comunicacao Renave para outro estabelecimento.
 *   - Status HTTP documentados no manual RENAVE-WS: 200, 201, 400, 401,
 *     403, 404, 422, 500.
 */

// TODO: confirmar o path exato contra o Swagger oficial.
const RENAVE_PATH = '/v1/estoque/aptidao';

export interface RenaveConfig {
  baseUrl: string;
  certPem: string;
  keyPem: string;
}

export function loadRenaveConfigFromEnv(): RenaveConfig | null {
  const baseUrl = Deno.env.get('RENAVE_BASE_URL');
  const certPem = Deno.env.get('RENAVE_CERT_PEM');
  const keyPem = Deno.env.get('RENAVE_KEY_PEM');
  if (!baseUrl || !certPem || !keyPem) return null;
  return { baseUrl, certPem, keyPem };
}

/**
 * Checagem basica de formato PEM (tem BEGIN/END e mais de uma linha).
 * Um erro comum ao configurar o secret via `$(cat arquivo.pem)` no
 * PowerShell e o Get-Content devolver um array de linhas que, ao ser
 * interpolado numa string, vira tudo junto separado por espaco -- isso
 * apaga as quebras de linha que o formato PEM exige. Rodar
 * `Get-Content -Raw arquivo.pem` (nao `cat`/`Get-Content` sem -Raw) evita
 * o problema.
 */
export function pemPareceValido(pem: string): boolean {
  const linhas = pem.trim().split('\n');
  return linhas.length > 2 && /-----BEGIN [A-Z ]+-----/.test(pem) && /-----END [A-Z ]+-----/.test(pem);
}

// Motivos de inaptidao documentados publicamente pela Central de Ajuda do
// RENAVE. As chaves de texto exatas devolvidas pela API real ainda nao sao
// conhecidas -- este mapa serve so pra normalizar o texto interno assim
// que confirmarmos o formato real (codigo vs texto livre) no Swagger.
export const MOTIVOS_NAO_APTIDAO_CONHECIDOS = [
  'ROUBO_FURTO',
  'RESTRICAO_ALARME',
  'LEILAO',
  'PENDENCIA_EMISSAO_CRV',
  'RESTRICAO_JUDICIAL_RENAJUD',
  'RESTRICAO_RFB',
  'PENDENCIA_IMPEDITIVA_DETRAN',
  'RESTRICAO_PGFN',
  'DEBITO_DETRAN',
  'COMUNICACAO_VENDA_OUTRO_COMPRADOR',
  'LICENCIAMENTO_PROVISORIO',
  'TRANSFERENCIA_ESTOQUE_PENDENTE',
  'COMUNICACAO_RENAVE_OUTRO_ESTABELECIMENTO',
] as const;

let httpClient: Deno.HttpClient | null = null;

function getHttpClient(config: RenaveConfig): Deno.HttpClient {
  if (!httpClient) {
    httpClient = Deno.createHttpClient({
      cert: config.certPem,
      key: config.keyPem,
    });
  }
  return httpClient;
}

export async function consultarAptidaoRenave(
  entrada: ConsultaEntrada,
  config: RenaveConfig,
): Promise<RenaveAptidaoRaw> {
  try {
    const client = getHttpClient(config);
    const res = await fetch(`${config.baseUrl}${RENAVE_PATH}`, {
      // @ts-ignore -- `client` e uma extensao do fetch do Deno, nao faz
      // parte do tipo padrao RequestInit do lib.dom.
      client,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // TODO: confirmar nomes de campo exatos contra o Swagger oficial.
      body: JSON.stringify({
        placa: entrada.placa,
        uf: entrada.uf,
        renavam: entrada.renavam,
        tipoCrv: entrada.tipo_crv,
        numeroCrv: entrada.numero_crv,
      }),
    });

    if (!res.ok) {
      return {
        consultado: false,
        apto_estoque: null,
        motivos_nao_aptidao: [],
        falha_comunicacao_detran: false,
        debitos: [],
        erro: { motivo: 'ERRO', codigo_http: res.status, mensagem: await safeText(res) },
      };
    }

    const raw = await res.json();
    return parseResponse(raw);
  } catch (err) {
    return {
      consultado: false,
      apto_estoque: null,
      motivos_nao_aptidao: [],
      falha_comunicacao_detran: false,
      debitos: [],
      erro: { motivo: 'ERRO', codigo_http: 0, mensagem: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}

// TODO: PLACEHOLDER -- reescrever assim que o Swagger oficial confirmar os
// nomes de campo reais da resposta. Estrutura atual e um chute razoavel
// baseado na descricao funcional da operacao, nao no schema real.
function parseResponse(raw: any): RenaveAptidaoRaw {
  return {
    consultado: true,
    apto_estoque: raw?.apto ?? raw?.aptoEstoque ?? null,
    motivos_nao_aptidao: Array.isArray(raw?.motivosNaoAptidao) ? raw.motivosNaoAptidao : [],
    falha_comunicacao_detran: !!(raw?.falhaComunicacaoDetran ?? raw?.detranIndisponivel),
    debitos: Array.isArray(raw?.debitos)
      ? raw.debitos.map((d: any) => ({
          tipo: d?.tipo ?? null,
          valor: d?.valor ?? null,
          descricao: d?.descricao,
        }))
      : [],
    boletos: Array.isArray(raw?.boletos) ? raw.boletos : [],
    veiculo: raw?.veiculo
      ? {
          renavam: raw.veiculo.renavam ?? null,
          chassi: raw.veiculo.chassi ?? null,
          marca_modelo: raw.veiculo.marcaModelo ?? null,
          ano_fabricacao: raw.veiculo.anoFabricacao ?? null,
          ano_modelo: raw.veiculo.anoModelo ?? null,
        }
      : undefined,
  };
}
