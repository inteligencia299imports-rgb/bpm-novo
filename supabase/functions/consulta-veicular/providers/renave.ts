import type { ConsultaEntrada, RenaveAptidaoRaw } from '../types.ts';

/**
 * RenaveProvider: chama "Consultar aptidao de veiculo para solicitacao de
 * entrada/saida em estoque" do RENAVE-WS.
 *
 * Contrato confirmado pelo Swagger publico do grupo "Estabelecimento
 * (Concessionaria ou Revenda)":
 *   GET  {base}/renave-ws/api/aptidao-veiculo-estoque
 *   query: placa (7), renavam ([0-9]{11}), numeroCrv ([0-9]{12}) -- opcionais;
 *          tipoCrv (AZUL|VERDE|BRANCO|DIGITAL) -- OBRIGATORIO.
 *   auth: mTLS (o estabelecimento e identificado pelo certificado, nao vai
 *         CNPJ no corpo/query).
 *   resposta 200: AptidaoVeiculoEstoque
 *     { comunicacaoComDetranFalhou, diagnostico{ veiculoApto,
 *       motivosParaNaoAptidao[], veiculoBaixado, veiculoComAlarme,
 *       veiculoComRestricaoJudicial, veiculoComRestricaoNaReceitaFederal,
 *       veiculoComRestricaoPgfn, veiculoComRouboFurto, veiculoSemAtpv, ... },
 *       informacoesDebitos{ existemDebitos, valorDebitoIpva,
 *       valorDebitoLicenciamento, valorDebitoMultas, valorDebitoDpvat,
 *       valorTaxasEDebitosDiversos, boletos[{ dataVencimentoBoleto,
 *       numeroCodigoBarras, valorBoleto }], codigosBancos[] },
 *       veiculo{ chassi, placa, renavam, restricoes[{ codigoTipo, tipo }],
 *       veiculoAcabado, dataPreCadastro } }
 */

const RENAVE_APTIDAO_PATH = '/renave-ws/api/aptidao-veiculo-estoque';
const TIPOS_CRV_VALIDOS = ['AZUL', 'VERDE', 'BRANCO', 'DIGITAL'];
const TIPO_CRV_PADRAO = 'DIGITAL';

// diagnostico.<flag> === true  ->  texto para a lista de motivos_nao_aptidao
const FLAGS_DIAGNOSTICO: Record<string, string> = {
  veiculoBaixado: 'Veículo baixado',
  veiculoComAlarme: 'Restrição de alarme',
  veiculoComPendenciaDeEmissaoCrv: 'Pendência de emissão de CRV',
  veiculoComRecall: 'Recall pendente',
  veiculoComRestricaoExtrajudicial: 'Restrição extrajudicial',
  veiculoComRestricaoImpeditivaNoDetran: 'Restrição impeditiva no Detran',
  veiculoComRestricaoJudicial: 'Restrição judicial (Renajud)',
  veiculoComRestricaoNaReceitaFederal: 'Restrição da Receita Federal',
  veiculoComRestricaoPgfn: 'Restrição PGFN',
  veiculoComRouboFurto: 'Consta roubo/furto',
  veiculoSemAtpv: 'Sem ATPV-e',
  veiculoComLicenciamentoProvisorio: 'Licenciamento provisório',
  veiculoTemAutorizacaoTransferenciaParaEstabelecimentoDiferenteDoEstabelecimentoConsultante:
    'Autorização de transferência para outro estabelecimento',
  veiculoTemComunicacaoDeVendaParaCompradorDiferenteDoEstabelecimentoConsultante:
    'Comunicação de venda para outro comprador',
  veiculoTemIntencaoDeVendaParaCompradorDiferenteDoEstabelecimentoConsultante:
    'Intenção de venda para outro comprador',
};

export interface RenaveConfig {
  baseUrl: string;
  /** Certificado mTLS. Opcional: a homologação do RENAVE tem "cliente padrão"
   *  que responde sem certificado (base hom.renave.estaleiro.serpro.gov.br). */
  certPem?: string;
  keyPem?: string;
}

export function loadRenaveConfigFromEnv(): RenaveConfig | null {
  const baseUrl = Deno.env.get('RENAVE_BASE_URL');
  if (!baseUrl) return null;
  const certPem = Deno.env.get('RENAVE_CERT_PEM');
  const keyPem = Deno.env.get('RENAVE_KEY_PEM');
  // O painel de secrets costuma engolir as quebras de linha do PEM. Tentamos
  // reconstruir o formato antes de usar -- assim o secret não precisa ser
  // colado de forma perfeita.
  return {
    baseUrl,
    certPem: certPem ? normalizarPem(certPem) : undefined,
    keyPem: keyPem ? normalizarPem(keyPem) : undefined,
  };
}

/**
 * Reconstrói um PEM que perdeu as quebras de linha (secret colado numa linha
 * só, ou com "\n" literais / CRLF). Cada bloco BEGIN..END é reescrito com o
 * corpo base64 quebrado a cada 64 colunas -- formato que o OpenSSL/Deno
 * aceitam. Se o texto já estiver multi-linha, é devolvido como veio.
 */
export function normalizarPem(pem: string): string {
  let txt = (pem ?? '').trim();
  if (!txt) return txt;
  txt = txt.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!/-----BEGIN /.test(txt)) return txt;
  if (txt.split('\n').length > 2) return txt;

  const blocos = [...txt.matchAll(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/g)];
  if (blocos.length === 0) return txt;
  return (
    blocos
      .map((b) => {
        const label = b[1].trim();
        const corpo = (b[2] || '').replace(/[^A-Za-z0-9+/=]/g, '');
        const linhas = corpo.match(/.{1,64}/g) ?? [];
        return `-----BEGIN ${label}-----\n${linhas.join('\n')}\n-----END ${label}-----`;
      })
      .join('\n') + '\n'
  );
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

let httpClient: Deno.HttpClient | null | undefined;

// Sem certificado (homologação / cliente padrão) devolve null: o fetch é feito
// sem mTLS.
function getHttpClient(config: RenaveConfig): Deno.HttpClient | null {
  if (httpClient === undefined) {
    httpClient = config.certPem && config.keyPem
      ? Deno.createHttpClient({ cert: config.certPem, key: config.keyPem })
      : null;
  }
  return httpClient;
}

function erroRenave(codigo_http: number, mensagem: string): RenaveAptidaoRaw {
  return {
    consultado: false,
    apto_estoque: null,
    motivos_nao_aptidao: [],
    falha_comunicacao_detran: false,
    debitos: [],
    restricoes: [],
    erro: { motivo: 'ERRO', codigo_http, mensagem },
  };
}

export async function consultarAptidaoRenave(
  entrada: ConsultaEntrada,
  config: RenaveConfig,
): Promise<RenaveAptidaoRaw> {
  try {
    const client = getHttpClient(config);

    const tipoCrv = TIPOS_CRV_VALIDOS.includes((entrada.tipo_crv ?? '').toUpperCase())
      ? (entrada.tipo_crv as string).toUpperCase()
      : TIPO_CRV_PADRAO;

    const qs = new URLSearchParams();
    if (entrada.placa) qs.set('placa', entrada.placa);
    if (entrada.renavam) qs.set('renavam', entrada.renavam);
    if (entrada.numero_crv) qs.set('numeroCrv', entrada.numero_crv);
    qs.set('tipoCrv', tipoCrv);

    // Aceita RENAVE_BASE_URL como origin ("https://host") ou já com
    // "/renave-ws" no fim -- normaliza para a origin.
    const base = config.baseUrl.replace(/\/+$/, '').replace(/\/renave-ws$/i, '');
    const init: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } };
    if (client) {
      // @ts-ignore -- `client` e uma extensao do fetch do Deno (mTLS), nao
      // faz parte do RequestInit do lib.dom.
      init.client = client;
    }
    const res = await fetch(`${base}${RENAVE_APTIDAO_PATH}?${qs.toString()}`, init);

    if (!res.ok) {
      return erroRenave(res.status, `HTTP ${res.status}: ${await safeText(res)}`);
    }

    return parseResponse(await res.json());
  } catch (err) {
    return erroRenave(0, err instanceof Error ? err.message : String(err));
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}

function numeroPositivo(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

// Mapeia o AptidaoVeiculoEstoque do RENAVE-WS -> DTO interno RenaveAptidaoRaw.
function parseResponse(raw: any): RenaveAptidaoRaw {
  const diag = raw?.diagnostico ?? {};
  const deb = raw?.informacoesDebitos ?? {};

  const motivos: string[] = Array.isArray(diag.motivosParaNaoAptidao)
    ? diag.motivosParaNaoAptidao.filter((m: unknown): m is string => typeof m === 'string' && m.trim() !== '')
    : [];
  for (const [flag, texto] of Object.entries(FLAGS_DIAGNOSTICO)) {
    if (diag[flag] === true && !motivos.includes(texto)) motivos.push(texto);
  }

  const debitos: RenaveAptidaoRaw['debitos'] = [];
  const addDebito = (tipo: string, valor: unknown, descricao: string) => {
    const n = numeroPositivo(valor);
    if (n !== null) debitos.push({ tipo, valor: n, descricao });
  };
  addDebito('IPVA', deb.valorDebitoIpva, 'IPVA');
  addDebito('LICENCIAMENTO', deb.valorDebitoLicenciamento, 'Licenciamento');
  addDebito('MULTA', deb.valorDebitoMultas, 'Multas');
  addDebito('OUTRO', deb.valorDebitoDpvat, 'DPVAT');
  addDebito('OUTRO', deb.valorTaxasEDebitosDiversos, 'Taxas e débitos diversos');

  return {
    consultado: true,
    apto_estoque: typeof diag.veiculoApto === 'boolean' ? diag.veiculoApto : null,
    motivos_nao_aptidao: motivos,
    falha_comunicacao_detran: raw?.comunicacaoComDetranFalhou === true,
    debitos,
    boletos: Array.isArray(deb.boletos)
      ? deb.boletos.map((b: any) => ({
          valor: numeroPositivo(b?.valorBoleto),
          vencimento: b?.dataVencimentoBoleto ?? null,
          descricao: b?.numeroCodigoBarras ?? undefined,
        }))
      : [],
    restricoes: Array.isArray(raw?.veiculo?.restricoes)
      ? raw.veiculo.restricoes.map((r: any) => ({
          codigo: String(r?.codigoTipo ?? ''),
          descricao: String(r?.tipo ?? ''),
        }))
      : [],
    diagnostico: {
      roubo_furto: diag.veiculoComRouboFurto === true,
      restricao_judicial: diag.veiculoComRestricaoJudicial === true,
      restricao_rfb: diag.veiculoComRestricaoNaReceitaFederal === true,
      restricao_pgfn: diag.veiculoComRestricaoPgfn === true,
      restricao_extrajudicial: diag.veiculoComRestricaoExtrajudicial === true,
      restricao_impeditiva_detran: diag.veiculoComRestricaoImpeditivaNoDetran === true,
      alarme: diag.veiculoComAlarme === true,
      baixado: diag.veiculoBaixado === true,
      recall: diag.veiculoComRecall === true,
      pendencia_emissao_crv: diag.veiculoComPendenciaDeEmissaoCrv === true,
      licenciamento_provisorio: diag.veiculoComLicenciamentoProvisorio === true,
      comunicacao_venda: diag.veiculoTemComunicacaoDeVendaParaCompradorDiferenteDoEstabelecimentoConsultante === true,
      sem_atpv: diag.veiculoSemAtpv === true,
    },
    veiculo: raw?.veiculo
      ? {
          renavam: raw.veiculo.renavam ?? null,
          chassi: raw.veiculo.chassi ?? null,
          marca_modelo: null,
          ano_fabricacao: null,
          ano_modelo: null,
        }
      : undefined,
  };
}
