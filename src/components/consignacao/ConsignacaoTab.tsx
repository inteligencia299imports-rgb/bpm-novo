import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, FileText, Filter } from 'lucide-react';
import { CONSIGNACAO_COLUMNS } from '@/types/crm';
import type { ConsignacaoStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import AvaliacaoForm from '@/components/avaliacoes/AvaliacaoForm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import FiltersPanel from '@/components/shared/FiltersPanel';


interface ConsignacaoTabProps {
  initialAvaliacaoId?: string | null;
  onInitialHandled?: () => void;
}

const ConsignacaoTab = ({ initialAvaliacaoId, onInitialHandled }: ConsignacaoTabProps = {}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [showFilters, setShowFilters] = useState(false);


  useEffect(() => {
    if (initialAvaliacaoId) {
      supabase.from('avaliacoes')
        .select(`*, atendimentos_motos!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro)))`)
        .eq('id', initialAvaliacaoId).single().then(({ data }) => {
          if (data) {
            const am = (data as any).atendimentos_motos;
            setSelectedItem({ ...data, atendimento: { ...am, loja: am?.loja_empresas?.loja }, moto: data });
          }
        });
      onInitialHandled?.();
    }
  }, [initialAvaliacaoId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const selectStr = `*, atendimentos_motos!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro)))`;

    const estResult = await fetchAllRange(() => supabase.from('estoque_motos').select('avaliacao_id, status, observacoes, created_at').not('avaliacao_id', 'is', null));
    const nfeResult = await fetchAllRange(() => supabase.from('nfe_entradas' as any).select('avaliacao_id, status').not('avaliacao_id', 'is', null));
    const result = await fetchAllRange(() =>
      supabase.from('avaliacoes').select(selectStr).eq('tipo_aquisicao', 'consignada').order('updated_at', { ascending: false })
    );
    const error = result.error;
    const data = result.data || [];
    const estData = estResult.data;
    const nfeEmitidaSet = new Set(
      ((nfeResult.data as any[]) || []).filter((n: any) => n.status === 'processada' && n.avaliacao_id).map((n: any) => n.avaliacao_id),
    );
    if (error) { toast.error('Erro ao carregar consignações'); } else {
      const estoqueMap: Record<string, { status: string; observacoes: string | null; data_entrada: string | null }> = {};
      (estData || []).forEach((e: any) => { if (e.avaliacao_id) estoqueMap[e.avaliacao_id] = { status: e.status, observacoes: e.observacoes, data_entrada: e.created_at }; });
      const histResult = await fetchAllRange(() => supabase.from('status_history').select('entity_id, created_at').eq('entity_type', 'avaliacao').eq('status', 'adquirida'));
      const histByEntity: Record<string, string> = {};
      (histResult.data || []).forEach((h: any) => {
        const prev = histByEntity[h.entity_id];
        if (!prev || new Date(h.created_at).getTime() > new Date(prev).getTime()) histByEntity[h.entity_id] = h.created_at;
      });
      const acquDateMap: Record<string, string> = {};
      (data || []).forEach((d: any) => {
        const picked = histByEntity[d.id] || estoqueMap[d.id]?.data_entrada || null;
        if (picked) acquDateMap[d.id] = picked;
      });
      let mapped = (data || [])
        .map((d: any) => ({ ...d, atendimento: { ...d.atendimentos_motos, loja: d.atendimentos_motos?.loja_empresas?.loja }, moto: d, _estoqueInfo: estoqueMap[d.id] || null, _dataAquisicao: acquDateMap[d.id] || null, _nfeEmitida: nfeEmitidaSet.has(d.id) }));
      if (search.trim()) { const s = search.trim().toLowerCase(); mapped = mapped.filter((a: any) => [a.atendimento?.cliente?.nome_razao_social, a.atendimento?.cliente?.telefone, a.moto?.marca, a.moto?.modelo, a.moto?.placa].some(f => f && String(f).toLowerCase().includes(s))); }
      if (filterCidade !== 'todos') { mapped = mapped.filter((a: any) => matchesCidade(a.atendimento?.loja, filterCidade)); }
      setItems(mapped);
    }
    setLoading(false);
  }, [search, filterCidade]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const getColumnItems = (status: ConsignacaoStatus) => items.filter((a: any) => (a.consignacao_status || 'em_aberto') === status);

  if (selectedItem) return <AvaliacaoForm avaliacaoId={selectedItem.id} context="consignacao" onClose={() => { setSelectedItem(null); fetchItems(); }} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><FileText className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Consignação</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos adquiridas consignadas</p>
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
        <KanbanSkeleton columns={4} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-4">
            {CONSIGNACAO_COLUMNS.map(col => {
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
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => (
                      <ProcessCard key={a.id} clientName={a.atendimento?.cliente?.nome_razao_social || 'N/A'} phone={a.atendimento?.cliente?.telefone}
                        motoLabel={a.moto ? [a.moto.placa?.replace(/-/g, ''), `${a.moto.marca} ${(a.moto.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined}
                        loja={a.atendimento?.loja} date={a._dataAquisicao || a.updated_at}
                        nameTag={a._nfeEmitida ? { label: 'NF-e' } : undefined}
                        statusColor={col.hex} onClick={() => setSelectedItem(a)} />
                    ))}
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

export default ConsignacaoTab;
