// Regras fiscais do SisFin — resolução compartilhada pelos emissores (crm-novo, ofc, bpm-novo).
//
// FONTE: sisfin/scripts/regras-fiscais/regras-fiscais.ts. Os emissores têm uma cópia em
// supabase/functions/_shared/regras-fiscais.ts — altere aqui e copie para os três.
//
// Modelo (desde 2026-09-24):
//   naturezas_operacao                 1 natureza por CFOP por empresa (coluna `cfop`, texto da
//                                      nota em `natop`). O emissor acha a natureza por
//                                      empresa + família de CFOPs da operação (OPERACOES).
//   naturezas_operacao_regras_fiscais  1 linha por cenário (UF/destino, NCM por prefixo,
//                                      categoria, origem, atendimento, bem usado) com todos os
//                                      impostos. A regra mais específica entre as naturezas da
//                                      família decide — e com ela o CFOP (natureza da regra).
//   icms_uf / icms_uf_ncm              alíquota interna + FCP por UF (exceção por NCM/prefixo):
//                                      DIFAL e venda interna sem alíquota na regra.
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
  serie: string | null;
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
  destino: number | null;
  destino_ufs: string[];
  produto_ncms: string[];
  produto_categorias: string[];
  origem_mercadoria: string | null;
  tipo_atendimento: string;
  bem_usado: boolean | null;
  serie: string | null;
  ordem: number;
  cfop: string | null;
  natop: string | null;
  indicador_presenca: number | null;
  icms_cst: string | null;
  icms_tipo_tributacao: string | null;
  icms_aliquota: number | null;
  icms_reducao_bc: number | null;
  icms_aliquota_efetiva: number | null;
  icms_reducao_bc_efetiva: number | null;
  icms_aliquota_st_consumidor: number | null;
  codigo_beneficio_fiscal: string | null;
  difal_dispensado_st: boolean;
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
interface ExcecaoNcm { uf: string; ncm: string; aliquota_interna: number | null; aliquota_fcp: number | null }

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
  atendimento?: "presencial" | "online" | null; // só venda; ausente = não filtra
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
    .select("id, empresa_id, cfop, descricao, natop, serie, tipo, regime_tributario, indicador_presenca, faturada, consumidor_final, operacao_devolucao, informacoes_complementares, informacoes_adicionais_fisco")
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
    supabase.from("icms_uf_ncm").select("uf, ncm, aliquota_interna, aliquota_fcp"),
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

// Escolhe a regra mais específica que casa com o item, entre todas as naturezas da operação.
// Pesos: UF listada / destino (interna × interestadual) > NCM (prefixo mais longo) / categoria
// > bem usado > origem > atendimento; empate -> menor `ordem`.
export function escolherRegra(op: OperacaoCarregada, item: ItemFiscal): RegraEscolhida | null {
  const uf = (item.ufDestino || "").toUpperCase();
  const ncm = (item.ncm || "").replace(/\D/g, "");
  const categoria = (item.categoria || "").trim();
  const origem = bucketOrigem(item.icmsOrigem);
  const bemUsado = item.bemUsado === true;
  const porId = new Map(op.naturezas.map((n) => [n.id, n]));
  let melhor: RegraEscolhida | null = null;
  let melhorScore = -1;
  let melhorOrdem = Infinity;
  for (const r of op.regras) {
    const natureza = porId.get(r.natureza_operacao_id);
    if (!natureza) continue;
    let score = 0;
    const ufs = (r.destino_ufs || []).map((x) => x.toUpperCase());
    if (ufs.length) { if (!ufs.includes(uf)) continue; score += 20; }
    if (r.destino != null) { if ((r.destino === 1) !== (uf === op.ufEmitente)) continue; score += 20; }
    const ncms = r.produto_ncms || [];
    if (ncms.length) {
      const casou = ncms.filter((p) => ncm && ncm.startsWith(p)).sort((a, b) => b.length - a.length)[0];
      if (!casou) continue;
      score += 10 + casou.length / 100;
    }
    const cats = r.produto_categorias || [];
    if (cats.length) { if (!categoria || !cats.includes(categoria)) continue; score += 10; }
    if (r.bem_usado != null) { if (r.bem_usado !== bemUsado) continue; score += 2; }
    if (r.origem_mercadoria) { if (r.origem_mercadoria !== origem) continue; score += 1; }
    if (r.tipo_atendimento && r.tipo_atendimento !== "ambos" && item.atendimento) {
      if (r.tipo_atendimento !== item.atendimento) continue;
      score += 0.5;
    }
    if (score > melhorScore || (score === melhorScore && r.ordem < melhorOrdem)) {
      melhor = { regra: r, natureza };
      melhorScore = score;
      melhorOrdem = r.ordem;
    }
  }
  return melhor;
}

// Alíquota interna e FCP da UF, com exceção por NCM (prefixo mais longo).
export function aliquotasUf(op: OperacaoCarregada, uf: string, ncm?: string | null) {
  const base = op.icmsUf[(uf || "").toUpperCase()];
  const n = (ncm || "").replace(/\D/g, "");
  const exc = op.excecoes
    .filter((x) => x.uf === (uf || "").toUpperCase() && n && n.startsWith(x.ncm))
    .sort((a, b) => b.ncm.length - a.ncm.length)[0];
  return {
    interna: num(exc?.aliquota_interna) ?? base?.aliquota_interna ?? null,
    fcp: num(exc?.aliquota_fcp) ?? base?.aliquota_fcp ?? 0,
  };
}

export const natOpDe = (e: RegraEscolhida) => (e.regra.natop || e.natureza.natop || e.natureza.descricao).slice(0, 60);
export const serieDe = (e: RegraEscolhida) => e.regra.serie ?? e.natureza.serie;
export const cfopDe = (e: RegraEscolhida) => e.regra.cfop ?? e.natureza.cfop;

// Converte a regra escolhida para o formato antigo de naturezas_operacao_regras (uma linha por
// imposto) — o que o resto de cada emissor já sabe consumir. Mesma semântica da view
// naturezas_operacao_regras_v2: aliquota_interna_destino = alíquota interna real da UF (DIFAL);
// na UF do emitente, a alíquota da regra se houver.
export function comoRegrasPorImposto(op: OperacaoCarregada, e: RegraEscolhida, item: ItemFiscal) {
  const r = e.regra;
  const uf = (item.ufDestino || "").toUpperCase();
  const { interna, fcp } = aliquotasUf(op, uf, item.ncm);
  const comum = {
    destino_ufs: [uf], tipo_atendimento: r.tipo_atendimento, origem_mercadoria: r.origem_mercadoria,
    produto_tipo: r.produto_ncms.length ? "ncm" : "todos", produto_ncms: r.produto_ncms, produto_categorias: r.produto_categorias,
    ordem: r.ordem, informacoes_complementares: null as string | null, informacoes_adicionais_fisco: null as string | null,
  };
  const icms = r.icms_cst ? {
    ...comum, imposto: "icms", cfop: cfopDe(e), situacao_tributaria: r.icms_cst,
    aliquota: num(r.icms_aliquota), reducao_base_calculo: num(r.icms_reducao_bc), base_calculo: null,
    aliquota_interna_destino: uf === op.ufEmitente ? (num(r.icms_aliquota) ?? interna) : interna,
    aliquota_fcp: fcp ? fcp : null, tipo_tributacao: r.icms_tipo_tributacao,
    aliquota_icms_efetiva: num(r.icms_aliquota_efetiva), reducao_base_calculo_efetiva: num(r.icms_reducao_bc_efetiva),
    aliquota_suportada_consumidor_final: num(r.icms_aliquota_st_consumidor), codigo_beneficio_fiscal: r.codigo_beneficio_fiscal,
    difal_dispensado_st: !!r.difal_dispensado_st, indicador_presenca: r.indicador_presenca, natureza_operacao_descricao: natOpDe(e),
    informacoes_complementares: r.informacoes_complementares, informacoes_adicionais_fisco: r.informacoes_adicionais_fisco,
  } : null;
  const simples = (imposto: string, cst: string | null, aliquota: unknown) =>
    cst ? { ...comum, imposto, cfop: null, situacao_tributaria: cst, aliquota: num(aliquota) } : null;
  return {
    icms,
    pis: simples("pis", r.pis_cst, r.pis_aliquota),
    cofins: simples("cofins", r.cofins_cst, r.cofins_aliquota),
    ipi: r.ipi_cst ? { ...simples("ipi", r.ipi_cst, r.ipi_aliquota)!, codigo_enquadramento_ipi: r.ipi_enquadramento, indicador_presenca: r.indicador_presenca } : null,
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
