// Regras fiscais do SisFin — resolução compartilhada pelos emissores (crm-novo, ofc, bpm-novo).
//
// FONTE: sisfin/scripts/regras-fiscais/regras-fiscais.ts. Os emissores têm uma cópia em
// supabase/functions/_shared/regras-fiscais.ts — altere aqui e copie para os três.
//
// Modelo (desde 2026-09-24):
//   naturezas_operacao                 1 natureza por CFOP por empresa (`cfop`; texto da nota em
//                                      `natop`; indicador de presença do cabeçalho). O
//                                      emissor acha as naturezas pela família de CFOPs da operação
//                                      (OPERACOES). O CFOP já diz se a operação é interna (1/5),
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

// Família de CFOPs de cada operação. A ordem não importa: quem decide é a regra.
export const OPERACOES = {
  venda: ["5102", "6102", "6108", "5403", "6403", "5405", "6404"],
  venda_consignada: ["5115", "6115"],
  devolucao_compra: ["5202", "6202", "5411", "6411"],
  garantia: ["5915", "6915"],
  transferencia: ["5152", "6152", "5409", "6409"],
  outra_saida: ["5949"],
  bonificacao: ["5910", "6910"],
  servico: ["5933", "6933"],
  compra: ["1102", "2102", "3102", "1403", "2403"],
  compra_consignada: ["1113", "2113"],
  entrada_consignacao: ["1917", "2917"],
  devolucao_consignacao: ["5918", "6918", "5919", "6919"],
} as const;
export type Operacao = keyof typeof OPERACOES;

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
  let q = supabase
    .from("naturezas_operacao")
    .select("id, empresa_id, cfop, descricao, natop, tipo, regime_tributario, indicador_presenca, faturada, consumidor_final, operacao_devolucao, informacoes_complementares, informacoes_adicionais_fisco")
    .eq("empresa_id", p.empresaId)
    .eq("ativo", true)
    .in("cfop", [...OPERACOES[p.operacao]]);
  if (p.naturezaId) q = q.eq("id", p.naturezaId);
  const { data: naturezas, error } = await q;
  if (error) return { erro: `Erro ao ler naturezas de operação: ${error.message}` };
  const lista = (naturezas ?? []) as NaturezaCfop[];
  if (!lista.length) {
    return {
      erro: p.naturezaId
        ? `A natureza escolhida não está ativa ou não é de ${p.operacao.replace(/_/g, " ")} (CFOPs ${OPERACOES[p.operacao].join(", ")}).`
        : `Nenhuma natureza ativa de ${p.operacao.replace(/_/g, " ")} (CFOPs ${OPERACOES[p.operacao].join(", ")}) cadastrada pra essa empresa no SisFin.`,
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
    if (ufs.length) { if (!ufs.includes(uf)) continue; score += 20; }
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
