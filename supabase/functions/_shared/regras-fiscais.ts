// Regras fiscais do SisFin — resolução compartilhada pelos emissores (crm-novo, ofc, bpm-novo).
//
// FONTE: sisfin/src/lib/fiscal/regras-fiscais.ts (também usada pelo Simulador fiscal do SisFin). Os emissores têm uma cópia em
// supabase/functions/_shared/regras-fiscais.ts — altere aqui e copie para os três.
//
// Modelo (desde 2026-09-24):
//   naturezas_operacao                 1 natureza por CFOP por empresa (`cfop`; texto da nota em
//                                      `natop`; indicador de presença do cabeçalho). O
//                                      emissor acha as naturezas pela família de CFOPs da operação
//                                      (tabelas cfops / operacoes_fiscais). O CFOP diz se é interna (1/5),
//                                      interestadual (2/6) ou exterior (3/7).
//   naturezas_operacao_regras_fiscais  O que varia DENTRO de um CFOP: UFs, NCM (prefixo), categoria,
//                                      origem e bem usado -> CST, se destaca ICMS, redução da base e
//                                      cBenef do ICMS,
//                                      PIS/COFINS, IPI, IBS/CBS, ISSQN. A série da NF-e não é do
//                                      SisFin: a Focus usa a série configurada pra empresa.
//                                      A regra mais específica entre as naturezas da família decide.
//   icms_uf / icms_uf_ncm              TODAS as alíquotas de ICMS: interna + FCP por UF, com exceção
//                                      por NCM/prefixo (e bem usado) e a dispensa de DIFAL. A
//                                      interestadual (4/7/12%) é a das Resoluções do Senado.

// Tipo mínimo do cliente: serve pro supabase-js via npm: (crm-novo, ofc) e via esm.sh (bpm-novo).
// deno-lint-ignore no-explicit-any
type ClienteSupabase = { from: (tabela: string) => any };

// Operação = o que o emissor pede ("venda", "compra", "devolucao_compra"...). A família de CFOPs de
// cada operação vem do banco: cfops.operacao (catálogo) -> operacoes_fiscais.codigo.
export type Operacao = string;

export interface NaturezaCfop {
  id: string;
  empresa_id: string;
  cfop: string;
  descricao: string;
  natop: string | null;
  tipo: string;
  regime_tributario: string | null;
  indicador_presenca: number | null;
  faturada: boolean;
  consumidor_final: boolean;
  operacao_devolucao: boolean;
  informacoes_complementares: string | null;
  informacoes_adicionais_fisco: string | null;
}

export interface RegraFiscal {
  id: string;
  natureza_operacao_id: string;
  destino_ufs: string[];
  produto_ncms: string[];
  produto_categorias: string[];
  origem_mercadoria: string | null;
  bem_usado: boolean | null;
  ordem: number;
  cfop: string | null;
  icms_cst: string | null;
  // false = operação sem destaque de ICMS (pICMS 0) mesmo com CST que destacaria (ex.: moto 0km
  // CST 00 interestadual, consignação CST 90). true = alíquota da tabela.
  icms_destaca: boolean;
  icms_tipo_tributacao: string | null;
  icms_reducao_bc: number | null;
  codigo_beneficio_fiscal: string | null;
  ipi_cst: string | null;
  ipi_enquadramento: string | null;
  ipi_aliquota: number | null;
  pis_cst: string | null;
  pis_aliquota: number | null;
  cofins_cst: string | null;
  cofins_aliquota: number | null;
  ibscbs_cst: string | null;
  cclasstrib: string | null;
  cbs_aliquota: number | null;
  ibs_uf_aliquota: number | null;
  ibs_mun_aliquota: number | null;
  ibscbs_reducao: number | null;
  issqn_situacao: string | null;
  issqn_aliquota: number | null;
  issqn_base_percentual: number | null;
  issqn_codigo_servico: string | null;
  issqn_reter: boolean;
  issqn_descontar_total: boolean;
  codigo_cnae: string | null;
  codigo_tributario_municipio: string | null;
  codigo_nbs: string | null;
  informacoes_complementares: string | null;
  informacoes_adicionais_fisco: string | null;
}

interface AliquotaUf { uf: string; aliquota_interna: number; aliquota_fcp: number }
interface ExcecaoNcm {
  uf: string;
  ncm: string;
  bem_usado: boolean | null;
  aliquota_interna: number | null;
  aliquota_fcp: number | null;
  difal_dispensado_st: boolean;
}

export interface OperacaoCarregada {
  operacao: Operacao;
  cfops: string[];          // família da operação (catálogo cfops), em ordem de código
  ufEmitente: string;
  naturezas: NaturezaCfop[];
  regras: RegraFiscal[];
  icmsUf: Record<string, AliquotaUf>;
  excecoes: ExcecaoNcm[];
}

export interface ItemFiscal {
  ufDestino: string;
  ncm?: string | null;
  categoria?: string | null;          // produto_categorias (ex.: itens_equipamentos.id)
  icmsOrigem?: number | null;         // 0–8
  bemUsado?: boolean | null;          // moto seminova = true; ausente = novo
}

export interface RegraEscolhida { regra: RegraFiscal; natureza: NaturezaCfop }

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

// Carrega naturezas ativas da família da operação (ou só a natureza escolhida) + regras + alíquotas.
export async function carregarOperacao(
  supabase: ClienteSupabase,
  p: { empresaId: string; ufEmitente: string | null; operacao: Operacao; naturezaId?: string | null },
): Promise<OperacaoCarregada | { erro: string }> {
  const { data: familia, error: e0 } = await supabase
    .from("cfops").select("codigo").eq("operacao", p.operacao).eq("ativo", true).order("codigo");
  if (e0) return { erro: `Erro ao ler o catálogo de CFOPs: ${e0.message}` };
  const cfops = ((familia ?? []) as { codigo: string }[]).map((c) => c.codigo);
  if (!cfops.length) return { erro: `Operação "${p.operacao}" sem CFOPs no catálogo (tabela cfops).` };
  let q = supabase
    .from("naturezas_operacao")
    .select("id, empresa_id, cfop, descricao, natop, tipo, regime_tributario, indicador_presenca, faturada, consumidor_final, operacao_devolucao, informacoes_complementares, informacoes_adicionais_fisco")
    .eq("empresa_id", p.empresaId)
    .eq("ativo", true)
    .in("cfop", cfops);
  if (p.naturezaId) q = q.eq("id", p.naturezaId);
  const { data: naturezas, error } = await q;
  if (error) return { erro: `Erro ao ler naturezas de operação: ${error.message}` };
  const lista = (naturezas ?? []) as NaturezaCfop[];
  if (!lista.length) {
    return {
      erro: p.naturezaId
        ? `A natureza escolhida não está ativa ou não é de ${p.operacao.replace(/_/g, " ")} (CFOPs ${cfops.join(", ")}).`
        : `Nenhuma natureza ativa de ${p.operacao.replace(/_/g, " ")} (CFOPs ${cfops.join(", ")}) cadastrada pra essa empresa no SisFin.`,
    };
  }
  const [{ data: regras, error: e2 }, { data: ufs, error: e3 }, { data: excecoes, error: e4 }] = await Promise.all([
    supabase.from("naturezas_operacao_regras_fiscais").select("*").in("natureza_operacao_id", lista.map((n) => n.id)).eq("ativo", true).order("ordem"),
    supabase.from("icms_uf").select("uf, aliquota_interna, aliquota_fcp"),
    supabase.from("icms_uf_ncm").select("uf, ncm, bem_usado, aliquota_interna, aliquota_fcp, difal_dispensado_st"),
  ]);
  const erro = e2 ?? e3 ?? e4;
  if (erro) return { erro: `Erro ao ler regras fiscais: ${erro.message}` };
  return {
    operacao: p.operacao,
    cfops,
    ufEmitente: (p.ufEmitente || "").toUpperCase(),
    naturezas: lista,
    regras: (regras ?? []) as RegraFiscal[],
    icmsUf: Object.fromEntries(((ufs ?? []) as AliquotaUf[]).map((u) => [u.uf, { ...u, aliquota_interna: Number(u.aliquota_interna), aliquota_fcp: Number(u.aliquota_fcp) }])),
    excecoes: (excecoes ?? []) as ExcecaoNcm[],
  };
}

// Origem do ICMS (0–8) -> bucket da regra. Importada: 1, 2, 6, 7.
export const bucketOrigem = (o: number | null | undefined) => ([1, 2, 6, 7].includes(Number(o) || 0) ? "importada" : "nacional");

// O CFOP diz o destino: 1/5 = mesma UF, 2/6 = outra UF, 3/7 = exterior.
function cfopCasaComUf(cfop: string, uf: string, ufEmitente: string): boolean {
  const d = cfop[0];
  if (d === "1" || d === "5") return uf === ufEmitente;
  if (d === "2" || d === "6") return !!uf && uf !== ufEmitente && uf !== "EX";
  return uf === "EX";
}

// Escolhe a regra mais específica que casa com o item, entre todas as naturezas da operação.
// Pesos: NCM (prefixo mais longo) / categoria > UF listada > bem usado > origem; empate -> menor
// `ordem`. Produto vem antes da UF: dentro de um CFOP a lista de UFs é exceção de estado, e uma
// regra de produto (ex.: moto 0km, NCM 8711) não pode perder pra regra genérica que lista UFs.
// Naturezas cujo CFOP não bate com o destino (5xxx x 6xxx) ficam de fora.
export function escolherRegra(op: OperacaoCarregada, item: ItemFiscal): RegraEscolhida | null {
  const uf = (item.ufDestino || "").toUpperCase();
  const ncm = (item.ncm || "").replace(/\D/g, "");
  const categoria = (item.categoria || "").trim();
  const origem = bucketOrigem(item.icmsOrigem);
  const bemUsado = item.bemUsado === true;
  const porId = new Map(op.naturezas.filter((n) => cfopCasaComUf(n.cfop, uf, op.ufEmitente)).map((n) => [n.id, n]));
  let melhor: RegraEscolhida | null = null;
  let melhorScore = -1;
  let melhorOrdem = Infinity;
  for (const r of op.regras) {
    const natureza = porId.get(r.natureza_operacao_id);
    if (!natureza) continue;
    let score = 0;
    const ufs = (r.destino_ufs || []).map((x) => x.toUpperCase());
    // Interestadual (CFOP 2/6xxx) sem UF marcada não é "coringa" pra qualquer estado — exige a
    // UF de destino explícita na regra. Sem isso, um estado nunca verificado de verdade (nem
    // cadastrado por engano) casava silenciosamente numa regra genérica de outro estado, com
    // CST/alíquota que ninguém conferiu pra esse destino (achado real: venda pra MA emitida sem
    // ninguém ter configurado MA, absorvida por uma regra "qualquer UF"). Interna (1/5xxx) não
    // tem essa ambiguidade — só existe uma UF possível (a do emitente) — então coringa continua ok.
    if (ufs.length) { if (!ufs.includes(uf)) continue; score += 20; }
    else if (natureza.cfop[0] === "2" || natureza.cfop[0] === "6") continue;
    const ncms = r.produto_ncms || [];
    if (ncms.length) {
      const casou = ncms.filter((p) => ncm && ncm.startsWith(p)).sort((a, b) => b.length - a.length)[0];
      if (!casou) continue;
      score += 40 + casou.length / 100;
    }
    const cats = r.produto_categorias || [];
    if (cats.length) { if (!categoria || !cats.includes(categoria)) continue; score += 40; }
    if (r.bem_usado != null) { if (r.bem_usado !== bemUsado) continue; score += 10; }
    if (r.origem_mercadoria) { if (r.origem_mercadoria !== origem) continue; score += 1; }
    if (score > melhorScore || (score === melhorScore && r.ordem < melhorOrdem)) {
      melhor = { regra: r, natureza };
      melhorScore = score;
      melhorOrdem = r.ordem;
    }
  }
  return melhor;
}

// Alíquota interna, FCP e dispensa de DIFAL da UF, com exceção por NCM (prefixo mais longo; a
// exceção de bem usado específico vence a genérica).
export function aliquotasUf(op: OperacaoCarregada, uf: string, ncm?: string | null, bemUsado?: boolean | null) {
  const u = (uf || "").toUpperCase();
  const base = op.icmsUf[u];
  const n = (ncm || "").replace(/\D/g, "");
  const exc = op.excecoes
    .filter((x) => x.uf === u && n && n.startsWith(x.ncm) && (x.bem_usado == null || x.bem_usado === (bemUsado === true)))
    .sort((a, b) => b.ncm.length - a.ncm.length || (a.bem_usado == null ? 1 : 0) - (b.bem_usado == null ? 1 : 0))[0];
  return {
    interna: num(exc?.aliquota_interna) ?? base?.aliquota_interna ?? null,
    fcp: num(exc?.aliquota_fcp) ?? base?.aliquota_fcp ?? 0,
    difalDispensado: !!exc?.difal_dispensado_st,
  };
}

// Alíquota interestadual (Res. SF 22/1989 e 13/2012): importado (origem 1, 2, 3, 8) = 4%;
// Sul/Sudeste (exceto ES) para Norte/Nordeste/Centro-Oeste/ES = 7%; demais = 12%.
const REGIAO_UF: Record<string, string> = {
  AC: "N", AP: "N", AM: "N", PA: "N", RO: "N", RR: "N", TO: "N",
  AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
  DF: "CO", GO: "CO", MT: "CO", MS: "CO", ES: "SE", MG: "SE", RJ: "SE", SP: "SE", PR: "S", RS: "S", SC: "S",
};
export function aliquotaInterestadual(ufOrigem: string, ufDestino: string, icmsOrigem?: number | null): number {
  const o = (ufOrigem || "").toUpperCase(), d = (ufDestino || "").toUpperCase();
  if ([1, 2, 3, 8].includes(Number(icmsOrigem) || 0)) return 4;
  const sulSudeste = REGIAO_UF[o] === "S" || (REGIAO_UF[o] === "SE" && o !== "ES");
  const beneficiado = ["N", "NE", "CO"].includes(REGIAO_UF[d]) || d === "ES";
  return sulSudeste && beneficiado ? 7 : 12;
}

export const natOpDe = (e: RegraEscolhida) => (e.natureza.natop || e.natureza.descricao).slice(0, 60);
export const cfopDe = (e: RegraEscolhida) => e.regra.cfop ?? e.natureza.cfop;

// Converte a regra escolhida para o formato antigo de naturezas_operacao_regras (uma linha por
// imposto) — o que o resto de cada emissor já sabe consumir. Alíquotas de ICMS vêm da tabela:
//   aliquota (pICMS) = interna da UF (operação interna) ou 4/7/12 — 0 se a regra não destaca ICMS;
//   aliquota_icms_efetiva = a mesma alíquota, sem ST (grupo ICMS Efetivo, CST 60/500);
//   aliquota_interna_destino (DIFAL) = interna da UF de destino; aliquota_fcp = FCP dela;
//   aliquota_suportada_consumidor_final (pST, CST 60) = interna da UF do emitente.
export function comoRegrasPorImposto(op: OperacaoCarregada, e: RegraEscolhida, item: ItemFiscal) {
  const r = e.regra;
  const uf = (item.ufDestino || "").toUpperCase();
  const destino = aliquotasUf(op, uf, item.ncm, item.bemUsado);
  const emitente = aliquotasUf(op, op.ufEmitente, item.ncm, item.bemUsado);
  const pICMS = uf === op.ufEmitente ? destino.interna : aliquotaInterestadual(op.ufEmitente, uf, item.icmsOrigem);
  const comum = {
    destino_ufs: [uf], tipo_atendimento: "ambos", origem_mercadoria: r.origem_mercadoria,
    produto_tipo: r.produto_ncms.length ? "ncm" : "todos", produto_ncms: r.produto_ncms, produto_categorias: r.produto_categorias,
    ordem: r.ordem, informacoes_complementares: null as string | null, informacoes_adicionais_fisco: null as string | null,
  };
  const icms = r.icms_cst ? {
    ...comum, imposto: "icms", cfop: cfopDe(e), situacao_tributaria: r.icms_cst,
    aliquota: r.icms_destaca === false ? 0 : pICMS, reducao_base_calculo: num(r.icms_reducao_bc), base_calculo: null,
    aliquota_interna_destino: destino.interna, aliquota_fcp: destino.fcp ? destino.fcp : null,
    tipo_tributacao: r.icms_tipo_tributacao,
    aliquota_icms_efetiva: pICMS, reducao_base_calculo_efetiva: null,
    aliquota_suportada_consumidor_final: emitente.interna, codigo_beneficio_fiscal: r.codigo_beneficio_fiscal,
    difal_dispensado_st: destino.difalDispensado, indicador_presenca: e.natureza.indicador_presenca, natureza_operacao_descricao: natOpDe(e),
    informacoes_complementares: r.informacoes_complementares, informacoes_adicionais_fisco: r.informacoes_adicionais_fisco,
  } : null;
  const simples = (imposto: string, cst: string | null, aliquota: unknown) =>
    cst ? { ...comum, imposto, cfop: null, situacao_tributaria: cst, aliquota: num(aliquota) } : null;
  return {
    icms,
    pis: simples("pis", r.pis_cst, r.pis_aliquota),
    cofins: simples("cofins", r.cofins_cst, r.cofins_aliquota),
    ipi: r.ipi_cst ? { ...simples("ipi", r.ipi_cst, r.ipi_aliquota)!, codigo_enquadramento_ipi: r.ipi_enquadramento, indicador_presenca: e.natureza.indicador_presenca } : null,
    ibscbs: r.ibscbs_cst ? {
      ...simples("ibscbs", r.ibscbs_cst, null)!, classificacao_tributaria: r.cclasstrib,
      cbs_aliquota: num(r.cbs_aliquota), ibs_uf_aliquota: num(r.ibs_uf_aliquota), ibs_mun_aliquota: num(r.ibs_mun_aliquota), percentual_reducao: num(r.ibscbs_reducao),
    } : null,
    issqn: r.issqn_situacao || r.issqn_aliquota != null || r.issqn_codigo_servico ? {
      ...comum, imposto: "issqn", cfop: null, situacao_tributaria: r.issqn_situacao, aliquota: num(r.issqn_aliquota),
      base_percentual: num(r.issqn_base_percentual), codigo_servico_issqn: r.issqn_codigo_servico, reter_iss: !!r.issqn_reter,
      descontar_iss_total: !!r.issqn_descontar_total, codigo_cnae: r.codigo_cnae, codigo_tributario_municipio: r.codigo_tributario_municipio, codigo_nbs: r.codigo_nbs,
    } : null,
  };
}

// ============================================================================
// MOTOR — cenário da operação. Tudo aqui é dedução pela regra legal a partir dos dados da
// venda (empresa, cliente, entrega); nada é configurado. Decisões confirmadas pelo fiscal em
// 2026-09-24:
//   - retirada presencial = operação INTERNA (UF fiscal = a do emitente, CFOP 5xxx, sem DIFAL,
//     sem frete); o endereço do destinatário na nota continua o real;
//   - destinatário isento de IE = não contribuinte (indIEDest 9 — o 2 é rejeitado por quase
//     toda SEFAZ em interestadual, rejeição 805), consumidor final, COM DIFAL na interestadual.
// ============================================================================

export interface DestinatarioFiscal {
  contribuinteIcms: boolean | null | undefined;
  inscricaoEstadual: string | null | undefined;
  // Marcado no cadastro do cliente (ex.: PJ contribuinte comprando pra uso/consumo).
  consumidorFinal?: boolean | null;
}

export interface EntradaCenario {
  regimeEmitente: string | null | undefined;
  ufEmitente: string | null | undefined;
  ufDestinatario: string | null | undefined; // UF do endereço do cliente
  retiradaPresencial?: boolean | null;
  destinatario: DestinatarioFiscal;
  valorFrete?: number | null;
}

export interface Cenario {
  ufFiscal: string;          // UF que decide CFOP/alíquota/DIFAL (a do emitente na retirada)
  interna: boolean;
  idDest: 1 | 2;             // local_destino da NF-e
  indIEDest: 1 | 9;          // 1 = contribuinte com IE; 9 = não contribuinte / isento
  consumidorFinal: 0 | 1;    // indFinal
  regimeNormal: boolean;     // Simples/MEI não recolhe DIFAL (STF ADI 5464)
  difal: boolean;            // DIFAL da operação (por item ainda depende do CST — difalNoItem)
  modalidadeFrete: 0 | 9;    // 9 = sem frete (retirada ou frete zero)
  retiradaPresencial: boolean;
}

const up = (v: string | null | undefined) => (v || "").trim().toUpperCase();

export function montarCenario(e: EntradaCenario): Cenario {
  const ufEmitente = up(e.ufEmitente);
  const retiradaPresencial = e.retiradaPresencial === true;
  const ufFiscal = retiradaPresencial ? ufEmitente : up(e.ufDestinatario) || ufEmitente;
  const interna = ufFiscal === ufEmitente;
  // indIEDest 1 só com IE real (dígitos): contribuinte sem IE ou com "ISENTO" vira 9 (rejeição 728).
  const ie = (e.destinatario.inscricaoEstadual || "").replace(/\D/g, "");
  const indIEDest: 1 | 9 = e.destinatario.contribuinteIcms === true && ie ? 1 : 9;
  const consumidorFinal: 0 | 1 = indIEDest === 9 || e.destinatario.consumidorFinal === true ? 1 : 0;
  const regime = up(e.regimeEmitente);
  const regimeNormal = !!regime && !regime.includes("SIMPLES") && regime !== "MEI";
  const difal = regimeNormal && !interna && indIEDest === 9 && consumidorFinal === 1;
  const modalidadeFrete: 0 | 9 = retiradaPresencial || !(Number(e.valorFrete) > 0) ? 9 : 0;
  return { ufFiscal, interna, idDest: interna ? 1 : 2, indIEDest, consumidorFinal, regimeNormal, difal, modalidadeFrete, retiradaPresencial };
}

// DIFAL no item: o da operação, menos CST sem ICMS na operação (40/41/50) e ST com MVA ajustada
// (dispensa cadastrada na exceção por NCM).
export const difalNoItem = (c: Cenario, cst: string | null | undefined, dispensado?: boolean) =>
  c.difal && !["40", "41", "50"].includes(String(cst ?? "")) && !dispensado;

// 6102 -> 6108 (venda interestadual a não contribuinte). Só existe na família interestadual.
export const cfopDoCenario = (c: Cenario, cfop: string) => (c.indIEDest === 9 && !c.interna && cfop === "6102" ? "6108" : cfop);

// Monta um item inteiro (o que a tela "Simulador fiscal" mostra): cenário + regra escolhida +
// alíquotas da tabela.
export function simularItem(op: OperacaoCarregada, c: Cenario, produto: { ncm?: string | null; categoria?: string | null; icmsOrigem?: number | null; bemUsado?: boolean | null }) {
  const item: ItemFiscal = { ufDestino: c.ufFiscal, ...produto };
  const escolhida = escolherRegra(op, item);
  if (!escolhida) return { erro: `Nenhuma regra fiscal casa com este cenário (UF ${c.ufFiscal}, NCM ${produto.ncm || "—"}).` };
  const linhas = comoRegrasPorImposto(op, escolhida, item);
  const icms = linhas.icms;
  const cfop = cfopDoCenario(c, cfopDe(escolhida));
  const difal = !!icms && difalNoItem(c, icms.situacao_tributaria, icms.difal_dispensado_st);
  return {
    natureza: escolhida.natureza,
    regra: escolhida.regra,
    cfop,
    natOp: cfop !== cfopDe(escolhida) ? (op.naturezas.find((n) => n.cfop === cfop)?.natop ?? natOpDe(escolhida)) : natOpDe(escolhida),
    icms: icms && {
      cst: icms.situacao_tributaria,
      destaca: escolhida.regra.icms_destaca !== false,
      aliquota: icms.aliquota,
      reducaoBase: icms.reducao_base_calculo,
      cBenef: icms.codigo_beneficio_fiscal,
      efetivo: ["60", "500"].includes(String(icms.situacao_tributaria)) ? icms.aliquota_icms_efetiva : null,
      stRetida: ["60", "500"].includes(String(icms.situacao_tributaria)) ? icms.aliquota_suportada_consumidor_final : null,
    },
    difal: difal ? {
      aliquotaInternaDestino: icms!.aliquota_interna_destino,
      aliquotaInterestadual: aliquotaInterestadual(op.ufEmitente, c.ufFiscal, produto.icmsOrigem),
      fcp: icms!.aliquota_fcp ?? 0,
    } : null,
    pis: linhas.pis && { cst: linhas.pis.situacao_tributaria, aliquota: linhas.pis.aliquota },
    cofins: linhas.cofins && { cst: linhas.cofins.situacao_tributaria, aliquota: linhas.cofins.aliquota },
    ipi: linhas.ipi && { cst: linhas.ipi.situacao_tributaria, aliquota: linhas.ipi.aliquota },
    ibscbs: linhas.ibscbs && { cst: linhas.ibscbs.situacao_tributaria, cclasstrib: linhas.ibscbs.classificacao_tributaria },
  };
}

// Operações do catálogo (pra telas): código, nome e CFOPs de cada uma.
export async function listarOperacoes(supabase: ClienteSupabase) {
  const [{ data: ops, error: e1 }, { data: cfops, error: e2 }] = await Promise.all([
    supabase.from("operacoes_fiscais").select("codigo, nome, ordem").order("ordem"),
    supabase.from("cfops").select("codigo, operacao").not("operacao", "is", null).eq("ativo", true).order("codigo"),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const porOp = new Map<string, string[]>();
  for (const c of (cfops ?? []) as { codigo: string; operacao: string }[]) porOp.set(c.operacao, [...(porOp.get(c.operacao) ?? []), c.codigo]);
  return ((ops ?? []) as { codigo: string; nome: string }[]).map((o) => ({ codigo: o.codigo, nome: o.nome, cfops: porOp.get(o.codigo) ?? [] }));
}
