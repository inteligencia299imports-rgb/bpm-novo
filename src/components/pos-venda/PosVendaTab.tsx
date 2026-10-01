import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ShoppingBag, Filter } from 'lucide-react';
import { POS_VENDA_COLUMNS } from '@/types/crm';
import type { PosVendaStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import PosVendaDetail from './PosVendaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { nfeTagFromRows } from '@/lib/nfeTag';
import { ESTOQUE_MOTO_SELECT, ESTOQUE_NOVA_SELECT, mapEstoqueMoto, mapEstoqueMotoNova, fetchLojaMap } from '@/lib/estoqueMoto';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import CidadeFilter, { matchesCidade, getSiglaFromLoja, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import FiltersPanel from '@/components/shared/FiltersPanel';
import { useAtendimentoUrlSync } from '@/hooks/useAtendimentoUrlSync';


interface PosVendaTabProps {
  initialAtendimentoId?: string | null;
  onInitialHandled?: () => void;
  onNavigateToPosCompra?: (avaliacaoId: string) => void;
}

// Oculto temporariamente a pedido do usuário, 2026-09-30: atendimento
// reconstruído (era o lado da aquisição de uma moto já revendida — sem
// NF de venda própria pra acompanhar aqui). Reavaliar depois.
const ATENDIMENTOS_OCULTOS_POS_VENDA = new Set<string>([
  'bd165fb9-859b-4225-b2b7-df7dc4f1bb43', // Roberto Frederico Conrado Rivas Marquez
]);

const PosVendaTab = ({ initialAtendimentoId, onInitialHandled, onNavigateToPosCompra }: PosVendaTabProps = {}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [showFilters, setShowFilters] = useState(false);

  useAtendimentoUrlSync('pos_venda', selectedItem?.id);

  useEffect(() => {
    if (initialAtendimentoId) {
      supabase.from('atendimentos_motos').select(`*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*)), motos_interesse(*, ${MARCA_MODELO_SELECT}), avaliacoes!avaliacoes_atendimento_id_fkey(*, ${MARCA_MODELO_SELECT})`).eq('id', initialAtendimentoId).single().then(async ({ data: raw }) => {
        const data = flattenMarcaModelo(raw as any);
        if (data) {
          // Fetch estoque moto info (seminova ou 0km)
          const lojaMap = await fetchLojaMap();
          const [{ data: estRow }, { data: estNovaRow }] = await Promise.all([
            supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).eq('atendimento_venda_id', data.id).maybeSingle(),
            supabase.from('estoque_motos_novas').select(ESTOQUE_NOVA_SELECT).eq('atendimento_venda_id', data.id).maybeSingle(),
          ]);
          const est = estRow ? mapEstoqueMoto(estRow, lojaMap) : (estNovaRow ? mapEstoqueMotoNova(estNovaRow, lojaMap) : null);
          setSelectedItem({ ...data, loja: (data as any).loja_empresas?.loja, _estoqueMoto: est && (est.tipo === 'propria' || est.tipo === '0km') ? est : null });
        }
      });
      onInitialHandled?.();
    }
  }, [initialAtendimentoId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const PER_STATUS_LIMIT = 50;
    const isSearching = search.trim().length > 0;
    // Colunas de aprovação são um eixo separado (venda_aprovacao_status), não pos_venda_status.
    const statuses = POS_VENDA_COLUMNS.map(c => c.value).filter(v => v !== 'aguardando_aprovacao' && v !== 'aprovada');
    const AT_SELECT = `*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*)), motos_interesse(*, ${MARCA_MODELO_SELECT}), avaliacoes!avaliacoes_atendimento_id_fkey(*, ${MARCA_MODELO_SELECT})`;
    const [estResRaw, estNovasRaw, lojaMap, nfeResult, nfeDevolucaoResult, etapaNfResult] = await Promise.all([
      fetchAllRange<any>(() => supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).not('atendimento_venda_id', 'is', null)),
      supabase.from('estoque_motos_novas').select(ESTOQUE_NOVA_SELECT).not('atendimento_venda_id', 'is', null),
      fetchLojaMap(),
      fetchAllRange<any>(() => supabase.from('nfe_entradas' as any).select('atendimento_id, status, ambiente, operacao, created_at').not('atendimento_id', 'is', null).like('operacao', 'venda%')),
      // NF de venda devolvida (pós-24h): o negócio foi desfeito, não conta mais
      // como "tem NF de venda" pra travar/esconder o item — a não ser que uma NF de
      // venda nova tenha sido autorizada DEPOIS da devolução (reemissão).
      fetchAllRange<any>(() => supabase.from('nfe_entradas' as any).select('atendimento_id, created_at').in('operacao', ['devolucao_venda_seminova', 'devolucao_venda_0km']).eq('status', 'processada').eq('ambiente', 'producao')),
      // Achado real 2026-09-29: etapa "NF EMITIDA" concluída sem nfe_entradas
      // (emitida fora do bpm-novo, ou atendimento importado) — mesmo padrão já
      // usado em PosCompraTab/ConsignacaoTab, faltava aqui.
      fetchAllRange<any>(() => supabase.from('pos_venda_processos').select('atendimento_id').eq('etapa', 'NF EMITIDA').eq('concluida', true)),
    ]);
    // Tag de status da NF por atendimento — reflete o último status da NF.
    const nfeRowsPorAtendimento: Record<string, any[]> = {};
    ((nfeResult.data as any[]) || []).forEach((n: any) => {
      if (!n.atendimento_id) return;
      (nfeRowsPorAtendimento[n.atendimento_id] ??= []).push(n);
    });
    // Última devolução de venda autorizada por atendimento. Uma devolução só anula a NF de venda
    // se for posterior à última venda autorizada em produção — achado real 2026-10-01: Alessa
    // Louany (NF 534 venda → 564 devolução → 565 nova venda) aparecia "concluída sem NF".
    const ultimaDevolucaoVenda: Record<string, string> = {};
    ((nfeDevolucaoResult.data as any[]) || []).forEach((n: any) => {
      if (n.atendimento_id && String(n.created_at) > (ultimaDevolucaoVenda[n.atendimento_id] ?? '')) ultimaDevolucaoVenda[n.atendimento_id] = String(n.created_at);
    });
    const atendimentosComDevolucaoVenda = new Set(Object.keys(ultimaDevolucaoVenda).filter((id) =>
      !(nfeRowsPorAtendimento[id] || []).some((n: any) => n.status === 'processada' && n.ambiente === 'producao' && String(n.created_at) > ultimaDevolucaoVenda[id]),
    ));
    const etapaNfConcluidaSet = new Set(((etapaNfResult.data as any[]) || []).map((e: any) => e.atendimento_id));
    const estRes = {
      data: [
        ...(estResRaw.data || []).map((r: any) => mapEstoqueMoto(r, lojaMap)),
        ...(((estNovasRaw as any).data) || []).map((r: any) => mapEstoqueMotoNova(r, lojaMap)),
      ],
      error: estResRaw.error,
    };

    let atData: any[];
    let atError: any;
    if (isSearching) {
      const result = await fetchAllRange(() => supabase.from('atendimentos_motos').select(AT_SELECT).eq('situacao', 'vendido').order('updated_at', { ascending: false }));
      atError = result.error;
      atData = result.data || [];
    } else {
      const statusResults = await Promise.all([
        ...statuses.map(s => supabase.from('atendimentos_motos').select(AT_SELECT).eq('situacao', 'vendido').eq('pos_venda_status', s).order('updated_at', { ascending: false }).limit(PER_STATUS_LIMIT)),
        (supabase.from('atendimentos_motos').select(AT_SELECT).eq('situacao', 'vendido') as any).eq('venda_aprovacao_status', 'aguardando').order('updated_at', { ascending: false }).limit(PER_STATUS_LIMIT),
        (supabase.from('atendimentos_motos').select(AT_SELECT).eq('situacao', 'vendido') as any).eq('venda_aprovacao_status', 'aprovada').order('updated_at', { ascending: false }).limit(PER_STATUS_LIMIT),
      ]);
      atError = statusResults.find(r => r.error)?.error;
      const seen = new Set<string>();
      atData = statusResults.flatMap(r => r.data || []).filter((a: any) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    }
    if (atError) { toast.error('Erro ao carregar pós-venda'); setLoading(false); return; }
    atData = atData.map((a: any) => ({ ...flattenMarcaModelo(a), loja: a.loja_empresas?.loja }));

    // Build estoque map: própria entries by atendimento_venda_id
    const estoquePropria: Record<string, any> = {};
    const estoqueConsignada = new Set<string>();
    (estRes.data || []).forEach((e: any) => {
      if ((e.tipo === 'propria' || e.tipo === '0km') && e.atendimento_venda_id) estoquePropria[e.atendimento_venda_id] = e;
      if (e.tipo === 'consignada' && e.atendimento_venda_id) estoqueConsignada.add(e.atendimento_venda_id);
    });

    // Include: atendimentos with própria estoque (seminova ou 0km, Ducati inclusive) OR without
    // any estoque (externas) but NOT consignada-only
    let filtered = atData
      .filter(a => estoquePropria[a.id] || (!estoquePropria[a.id] && !estoqueConsignada.has(a.id)))
      .map(a => {
        const est = estoquePropria[a.id];
        // 0km com ATPV-e já emitido: a tag do card vira "ATPV-e" (etapa mais
        // recente que a NF-e de venda no pós-venda), não "NF-e".
        const _nfeTag = est?.fonte === '0km' && est?.renave_atpv_numero
          ? { label: 'ATPV-e', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' }
          : nfeTagFromRows(nfeRowsPorAtendimento[a.id]);
        const _temNfeProducao = !atendimentosComDevolucaoVenda.has(a.id)
          && (etapaNfConcluidaSet.has(a.id) || (nfeRowsPorAtendimento[a.id] || []).some((n: any) => n.status === 'processada' && n.ambiente === 'producao'));
        if (est) return { ...a, _estoqueMoto: est, _nfeTag, _temNfeProducao };
        // Fallback: use first moto_interesse info
        const mi = a.motos_interesse?.[0];
        return { ...a, _estoqueMoto: mi ? { marca: mi.marca, modelo: mi.modelo, placa: null } : null, _nfeTag, _temNfeProducao };
      });

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const sAlfanum = s.replace(/[^a-z0-9]/g, '');
      filtered = filtered.filter((a: any) => {
        if ([a.cliente?.nome_razao_social, a.cliente?.telefone, a.loja].some(f => f && String(f).toLowerCase().includes(s))) return true;
        if (!sAlfanum) return false;
        const moto = a._estoqueMoto;
        const placa = String(moto?.placa ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const chassi = String(moto?.chassi ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return (!!placa && placa.includes(sAlfanum)) || (!!chassi && chassi.includes(sAlfanum));
      });
    }
    if (filterCidade !== 'todos') {
      filtered = filtered.filter((a: any) => matchesCidade(a.loja, filterCidade));
    }
    filtered = filtered.filter((a: any) => !ATENDIMENTOS_OCULTOS_POS_VENDA.has(a.id));
    setItems(filtered);
    setLoading(false);
  }, [search, filterCidade]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const columnOf = (a: any): PosVendaStatus => {
    const normal = (a.pos_venda_status || 'em_aberto') as PosVendaStatus;
    if (a.venda_aprovacao_status === 'recusada') return normal; // fica na coluna normal com a tag "Recusado"
    // Aguardando aprovação só enquanto o master não decide — a NF-e de venda não é pré-requisito.
    if (a.venda_aprovacao_status === 'aguardando') return 'aguardando_aprovacao';
    if (a.venda_aprovacao_status === 'aprovada' && normal === 'em_aberto') return 'aprovada';
    return normal;
  };
  const getColumnItems = (status: PosVendaStatus) => items.filter((a: any) => {
    if (columnOf(a) !== status) return false;
    // Concluída com NF-e de venda já emitida em produção: processo realmente
    // encerrado, sai do quadro. Sem NF-e vinculada (ex.: venda importada de
    // outro sistema), continua visível/acessível.
    if (status === 'concluido' && a._temNfeProducao) return false;
    return true;
  });

  const handleStatusChanged = useCallback((itemId: string, newStatus: string, field: string) => {
    setItems(prev => prev.map(a => a.id === itemId ? { ...a, [field]: newStatus } : a));
    setSelectedItem((prev: any) => prev && prev.id === itemId ? { ...prev, [field]: newStatus } : prev);
  }, []);

  if (selectedItem) return <PosVendaDetail item={selectedItem} onClose={() => setSelectedItem(null)} onStatusChanged={handleStatusChanged} onNavigateToPosCompra={onNavigateToPosCompra} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><ShoppingBag className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Pós-Venda</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos vendidas próprias</p>
      </div>
      <div className="flex flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Button variant="outline" size="icon" className="md:hidden shrink-0" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>
      <FiltersPanel show={showFilters}>
        <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
      </FiltersPanel>

      {loading ? (
        <KanbanSkeleton columns={6} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-6">
            {POS_VENDA_COLUMNS.map(col => {
              const colItems = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[300px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => {
                      const est = a._estoqueMoto;
                      return (
                         <ProcessCard key={a.id} clientName={a.cliente?.nome_razao_social} phone={a.cliente?.telefone}
                           motoLabel={est ? [est.placa?.replace(/-/g, ''), `${est.marca} ${(est.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined}
                           loja={a.loja} patio={getSiglaFromLoja(est?.loja) || undefined} date={a.data_venda || a.updated_at} statusColor={col.hex}
                           nameTag={a.venda_aprovacao_status === 'recusada' ? { label: 'Recusado', className: 'bg-red-600 hover:bg-red-600' } : (a._nfeTag || undefined)}
                           onClick={() => setSelectedItem(a)} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PosVendaTab;
