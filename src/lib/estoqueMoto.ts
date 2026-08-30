import { supabase } from '@/lib/supabase';
import { isTipoConsignada } from '@/lib/tipoAquisicao';

/**
 * Select canonico de estoque_motos com as specs da moto embutidas da avaliacao.
 * A tabela estoque_motos so guarda o que e proprio dela; marca/modelo/placa/preco
 * de tabela/tipo/classificacao vem da avaliacao vinculada.
 */
export const ESTOQUE_MOTO_SELECT =
  '*, avaliacao:avaliacao_id(id, marca, modelo, categoria, cor, cilindrada, placa, ' +
  'ano_fabricacao, ano_modelo, km, quanto_pede, classificacao, tipo_aquisicao, ' +
  'tem_manual, tem_chave_reserva, manutencao_vencida, crlv_url, resultado_consulta, ' +
  'pos_compra_status, atendimento_id, atendimento:atendimento_id(loja_id)), ' +
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
  const li = row?.loja_id ? lojaMap?.get(row.loja_id) : undefined;
  const origemLojaId = av.atendimento?.loja_id ? String(av.atendimento.loja_id) : null;
  const liOrigem = origemLojaId ? lojaMap?.get(origemLojaId) : undefined;
  return {
    ...row,
    marca: av.marca ?? null,
    modelo: av.modelo ?? null,
    categoria: av.categoria ?? null,
    cor: av.cor ?? null,
    cilindrada: av.cilindrada ?? null,
    placa: av.placa ?? null,
    ano_fabricacao: av.ano_fabricacao ?? null,
    ano_modelo: av.ano_modelo ?? null,
    km: av.km ?? null,
    tipo: isTipoConsignada(av.tipo_aquisicao) ? 'consignada' : 'propria',
    tipo_aquisicao: av.tipo_aquisicao ?? null,
    preco: av.quanto_pede ?? null,
    classificacao: av.classificacao ?? null,
    data_entrada: row?.created_at ?? null,
    tem_manual: av.tem_manual ?? null,
    tem_chave_reserva: av.tem_chave_reserva ?? null,
    manutencao_vencida: av.manutencao_vencida ?? null,
    crlv_url: av.crlv_url ?? null,
    resultado_consulta: av.resultado_consulta ?? null,
    pos_compra_status: av.pos_compra_status ?? null,
    venda_vendedor_id: row?.atendimento_venda?.vendedor_id ?? null,
    loja: li?.loja ?? null,
    empresa: li?.empresa ?? null,
    uf: li?.uf ?? null,
    loja_origem: liOrigem?.loja ?? li?.loja ?? null,
  };
}
