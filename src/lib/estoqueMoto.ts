import { supabase } from '@/lib/supabase';
import { isTipoConsignada } from '@/lib/tipoAquisicao';
import { nomeMarcaModelo } from '@/lib/marcaModelo';

/**
 * Select canonico de estoque_motos (SEMINOVAS). marca/modelo/placa/preco de tabela/
 * tipo/classificacao vem da avaliacao vinculada — a tabela so guarda o que e proprio dela.
 */
export const ESTOQUE_MOTO_SELECT =
  '*, avaliacao:avaliacao_id(id, marca:marca_id(nome), modelo:modelo_id(nome), categoria, cor, cilindrada, placa, ' +
  'ano_fabricacao, ano_modelo, km, quanto_pede, classificacao, tipo_aquisicao, chassi, renavam, ' +
  'tem_manual, tem_chave_reserva, manutencao_vencida, crlv_url, resultado_consulta, ' +
  'pos_compra_status, atendimento_id, atendimento:atendimento_id(loja_id)), ' +
  'atendimento_venda:atendimento_venda_id(vendedor_id)';

/** Select de estoque_motos_novas (0km). marca/modelo sao FK (marca_id/modelo_id). */
export const ESTOQUE_NOVA_SELECT =
  '*, marca:marca_id(nome), modelo:modelo_id(nome), ' +
  'atendimento_venda:atendimento_venda_id(vendedor_id)';

export type EstoqueFonte = 'seminova' | '0km';

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

/** Achata um registro de estoque_motos (seminova) para o formato "denormalizado" que as telas usam. */
export function mapEstoqueMoto(row: any, lojaMap?: Map<string, LojaInfo>) {
  const av = row?.avaliacao ?? {};
  const li = row?.loja_id ? lojaMap?.get(row.loja_id) : undefined;
  const origemLojaId = av.atendimento?.loja_id ? String(av.atendimento.loja_id) : null;
  const liOrigem = origemLojaId ? lojaMap?.get(origemLojaId) : undefined;

  return {
    ...row,
    fonte: 'seminova' as EstoqueFonte,
    marca: nomeMarcaModelo(av.marca) || null,
    modelo: nomeMarcaModelo(av.modelo) || null,
    categoria: av.categoria ?? null,
    cor: av.cor ?? null,
    cilindrada: av.cilindrada ?? null,
    placa: av.placa ?? null,
    ano_fabricacao: av.ano_fabricacao ?? null,
    ano_modelo: av.ano_modelo ?? null,
    km: av.km ?? null,
    chassi: av.chassi ?? null,
    renavam: av.renavam ?? null,
    ncm: null,
    tipo: isTipoConsignada(av.tipo_aquisicao) ? 'consignada' : 'propria',
    tipo_aquisicao: av.tipo_aquisicao ?? null,
    preco: av.quanto_pede ?? null,
    valor_custo: null,
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

/** Achata um registro de estoque_motos_novas (0km) na MESMA forma de saida de mapEstoqueMoto. */
export function mapEstoqueMotoNova(row: any, lojaMap?: Map<string, LojaInfo>) {
  const li = row?.loja_id ? lojaMap?.get(row.loja_id) : undefined;
  return {
    ...row,
    fonte: '0km' as EstoqueFonte,
    marca: row?.marca?.nome ?? null,
    modelo: row?.modelo?.nome ?? null,
    categoria: row?.categoria ?? null,
    cor: row?.cor ?? null,
    cilindrada: row?.cilindrada ?? null,
    placa: row?.placa ?? null,
    ano_fabricacao: row?.ano_fabricacao ?? null,
    ano_modelo: row?.ano_modelo ?? null,
    km: '0',
    chassi: row?.chassi ?? null,
    renavam: row?.renavam ?? null,
    ncm: row?.ncm ?? null,
    tipo: '0km',
    tipo_aquisicao: null,
    preco: row?.valor ?? null,
    valor_custo: row?.valor_custo ?? null,
    classificacao: null,
    data_entrada: row?.created_at ?? null,
    tem_manual: null,
    tem_chave_reserva: null,
    manutencao_vencida: null,
    crlv_url: null,
    resultado_consulta: null,
    pos_compra_status: null,
    venda_vendedor_id: row?.atendimento_venda?.vendedor_id ?? null,
    loja: li?.loja ?? null,
    empresa: li?.empresa ?? null,
    uf: li?.uf ?? null,
    loja_origem: li?.loja ?? null,
  };
}

export interface FetchEstoqueOpts {
  /** Filtra os dois estoques por status (ex.: 'disponivel'). */
  status?: string;
  /** Busca apenas ids especificos (com a fonte de cada um). */
  ids?: Array<{ id: string; tipo: EstoqueFonte }>;
}

/**
 * Lista unificada dos dois estoques (seminova + 0km) ja no formato achatado.
 * Reusa fetchLojaMap. Sem opts -> tudo.
 */
export async function fetchEstoqueUnificado(opts: FetchEstoqueOpts = {}) {
  const seminovaIds = opts.ids?.filter((x) => x.tipo === 'seminova').map((x) => x.id);
  const novaIds = opts.ids?.filter((x) => x.tipo === '0km').map((x) => x.id);

  const q1 = () => {
    if (opts.ids && (!seminovaIds || seminovaIds.length === 0)) return Promise.resolve({ data: [] as any[] });
    let q = supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).order('created_at', { ascending: false });
    if (seminovaIds && seminovaIds.length) q = q.in('id', seminovaIds);
    if (opts.status) q = q.eq('status', opts.status);
    return q;
  };
  const q2 = () => {
    if (opts.ids && (!novaIds || novaIds.length === 0)) return Promise.resolve({ data: [] as any[] });
    let q = supabase.from('estoque_motos_novas').select(ESTOQUE_NOVA_SELECT).order('created_at', { ascending: false });
    if (novaIds && novaIds.length) q = q.in('id', novaIds);
    if (opts.status) q = q.eq('status', opts.status);
    return q;
  };

  const [lojaMap, r1, r2] = await Promise.all([fetchLojaMap(), q1(), q2()]);
  const seminovas = ((r1 as any).data || []).map((row: any) => mapEstoqueMoto(row, lojaMap));
  const novas = ((r2 as any).data || []).map((row: any) => mapEstoqueMotoNova(row, lojaMap));
  return [...seminovas, ...novas];
}

/** Atualiza a linha de estoque na tabela certa conforme a fonte. */
export async function atualizarEstoqueVenda(fonte: EstoqueFonte, id: string, patch: Record<string, any>) {
  const tabela = fonte === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
  return supabase.from(tabela).update(patch).eq('id', id);
}

/** Reverte uma moto para "disponivel" (usado ao perder/cancelar o atendimento). */
export async function reverterEstoqueVenda(fonte: EstoqueFonte, id: string, atendimentoId?: string) {
  const tabela = fonte === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
  let q = supabase.from(tabela).update({
    status: 'disponivel',
    atendimento_venda_id: null,
    data_venda: null,
    valor_venda: null,
    valor_sinal: null,
  }).eq('id', id);
  if (atendimentoId) q = q.eq('atendimento_venda_id', atendimentoId);
  return q;
}
