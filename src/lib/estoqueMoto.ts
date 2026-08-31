import { supabase } from '@/lib/supabase';
import { isTipoConsignada } from '@/lib/tipoAquisicao';

/**
 * Select canonico de estoque_motos com as specs da moto embutidas da avaliacao.
 * A tabela estoque_motos so guarda o que e proprio dela; marca/modelo/placa/preco
 * de tabela/tipo/classificacao vem da avaliacao vinculada.
 */
export const ESTOQUE_MOTO_SELECT =
  '*, avaliacao:avaliacao_id(id, marca, modelo, categoria, cor, cilindrada, placa, ' +
  'ano_fabricacao, ano_modelo, km, quanto_pede, classificacao, tipo_aquisicao, chassi, renavam, ' +
  'tem_manual, tem_chave_reserva, manutencao_vencida, crlv_url, resultado_consulta, ' +
  'pos_compra_status, atendimento_id, atendimento:atendimento_id(loja_id)), ' +
  'moto_nova:moto_nova_id(id, marca:marca_id(nome), modelo:modelo_id(nome), categoria, cor, cilindrada, ano_fabricacao, ' +
  'ano_modelo, chassi, renavam, placa, ncm, valor, valor_custo), ' +
  'atendimento_venda:atendimento_venda_id(vendedor_id)';

export interface LojaInfo {
  loja_id: string;
  loja: string;
  empresa: string | null;
  uf: string | null;
  empresa_id: string;
}

/** Mapa loja_empresas.id -> { loja, empresa, uf } (tabela pequena, ~8 linhas). */
export async function fetchLojaMap(): Promise<Map<string, LojaInfo>> {
  const { data } = await supabase
    .from('loja_empresas')
    .select('id, loja, empresa_id, empresas:empresa_id(nome, uf)')
    .eq('sistema', 'motos');
  const map = new Map<string, LojaInfo>();
  for (const r of (data as any[]) || []) {
    map.set(r.id, {
      loja_id: r.id,
      loja: r.loja,
      empresa: r.empresas?.nome ?? null,
      uf: r.empresas?.uf ?? null,
      empresa_id: r.empresa_id,
    });
  }
  return map;
}

/** Achata um registro de estoque_motos (com avaliacao embutida) para o formato "denormalizado" que as telas usavam. */
export function mapEstoqueMoto(row: any, lojaMap?: Map<string, LojaInfo>) {
  const av = row?.avaliacao ?? {};
  const mn = row?.moto_nova ?? null;
  const eh0km = !!row?.moto_nova_id && !!mn;
  const li = row?.loja_id ? lojaMap?.get(row.loja_id) : undefined;
  const origemLojaId = av.atendimento?.loja_id ? String(av.atendimento.loja_id) : null;
  const liOrigem = origemLojaId ? lojaMap?.get(origemLojaId) : undefined;

  // Specs: 0km vem de estoque_motos_novas; seminova/consignada vem da avaliacao.
  // Em estoque_motos_novas marca/modelo sao FK (marca_id/modelo_id); o embed traz { nome }.
  const src = eh0km ? mn : av;
  return {
    ...row,
    marca: eh0km ? (mn.marca?.nome ?? null) : (av.marca ?? null),
    modelo: eh0km ? (mn.modelo?.nome ?? null) : (av.modelo ?? null),
    categoria: src.categoria ?? null,
    cor: src.cor ?? null,
    cilindrada: src.cilindrada ?? null,
    placa: src.placa ?? null,
    ano_fabricacao: src.ano_fabricacao ?? null,
    ano_modelo: src.ano_modelo ?? null,
    km: eh0km ? '0' : (av.km ?? null),
    chassi: src.chassi ?? null,
    renavam: src.renavam ?? null,
    ncm: eh0km ? (mn.ncm ?? null) : null,
    tipo: eh0km ? '0km' : (isTipoConsignada(av.tipo_aquisicao) ? 'consignada' : 'propria'),
    tipo_aquisicao: eh0km ? null : (av.tipo_aquisicao ?? null),
    preco: eh0km ? (mn.valor ?? null) : (av.quanto_pede ?? null),
    valor_custo: eh0km ? (mn.valor_custo ?? null) : null,
    classificacao: eh0km ? null : (av.classificacao ?? null),
    data_entrada: row?.created_at ?? null,
    tem_manual: eh0km ? null : (av.tem_manual ?? null),
    tem_chave_reserva: eh0km ? null : (av.tem_chave_reserva ?? null),
    manutencao_vencida: eh0km ? null : (av.manutencao_vencida ?? null),
    crlv_url: eh0km ? null : (av.crlv_url ?? null),
    resultado_consulta: eh0km ? null : (av.resultado_consulta ?? null),
    pos_compra_status: eh0km ? null : (av.pos_compra_status ?? null),
    venda_vendedor_id: row?.atendimento_venda?.vendedor_id ?? null,
    loja: li?.loja ?? null,
    empresa: li?.empresa ?? null,
    uf: li?.uf ?? null,
    loja_origem: liOrigem?.loja ?? li?.loja ?? null,
  };
}
