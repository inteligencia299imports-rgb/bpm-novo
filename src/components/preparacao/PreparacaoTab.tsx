import React, { useState, useEffect, useCallback } from 'react';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass, isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import { supabase } from '@/lib/supabase';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search, X, Wrench, Filter } from 'lucide-react';
import { PREPARACAO_COLUMNS } from '@/types/crm';
import type { PreparacaoStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';
import FiltersPanel from '@/components/shared/FiltersPanel';


interface PreparacaoTabProps {
  initialAvaliacaoId?: string | null;
  onInitialHandled?: () => void;
}

const CIDADE_LOJAS: Record<string, string[]> = {
  'Brasília': ['299i', '299s', 'Aventura', 'Ducati BSB'],
  'Florianópolis': ['299f', 'Ducati FLN'],
  'Porto Alegre': ['299p', 'Ducati POA'],
};

const PreparacaoTab = ({ initialAvaliacaoId, onInitialHandled }: PreparacaoTabProps = {}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState<'todos' | 'Brasília' | 'Florianópolis' | 'Porto Alegre'>('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  useEffect(() => {
    if (initialAvaliacaoId) {
      supabase.from('avaliacoes')
        .select(`*, atendimentos!inner(id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes, tem_manual, tem_chave_reserva, manutencao_vencida, resultado_consulta)`)
        .eq('id', initialAvaliacaoId).single().then(({ data }) => {
          if (data) setSelectedItem({ ...data, atendimento: (data as any).atendimentos, moto: (data as any).motos_avaliacao });
        });
      onInitialHandled?.();
    }
  }, [initialAvaliacaoId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const selectStr = `*, atendimentos!inner(id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes, tem_manual, tem_chave_reserva, manutencao_vencida, resultado_consulta)`;

    const estResult = await fetchAllRange(() => supabase.from('estoque').select('avaliacao_id, status, observacoes, data_entrada').not('avaliacao_id', 'is', null));
    const result = await fetchAllRange(() =>
      supabase.from('avaliacoes').select(selectStr).in('situacao', ['adquirida', 'estoque']).order('updated_at', { ascending: false })
    );
    const err1 = result.error;
    const allData = result.data || [];
    if (err1) { toast.error('Erro ao carregar preparação'); } else {
      const estData = estResult.data;
      const estoqueMap: Record<string, { status: string; observacoes: string | null }> = {};
      (estData || []).forEach((e: any) => { if (e.avaliacao_id) estoqueMap[e.avaliacao_id] = { status: e.status, observacoes: e.observacoes }; });

      // Fetch release readiness data
      const avaliacaoIds = allData.map((d: any) => d.id);
      const motoIdsForHist = allData.map((d: any) => d.moto_avaliacao_id).filter(Boolean);
      const histEntityIds = Array.from(new Set([...motoIdsForHist, ...avaliacaoIds]));
      const avaliacaoIdSet = new Set(avaliacaoIds);
      const [pcResult, consigResult, histResult] = await Promise.all([
        fetchAllRange(() => supabase.from('pos_compra_processos').select('avaliacao_id, etapa, concluida').in('etapa', ['NF EMITIDA', 'VISTORIA/CADEIA DOMINIAL']).eq('concluida', true)),
        fetchAllRange(() => supabase.from('consignacao_processos').select('avaliacao_id, etapa, concluida').eq('etapa', 'NF EMITIDA').eq('concluida', true)),
        fetchAllRange(() => supabase.from('status_history').select('entity_id, created_at').eq('entity_type', 'avaliacao').eq('status', 'adquirida').in('entity_id', histEntityIds.length ? histEntityIds : [''])),
      ]);
      const pcData = (pcResult.data || []).filter((p: any) => avaliacaoIdSet.has(p.avaliacao_id));
      const consigData = (consigResult.data || []).filter((p: any) => avaliacaoIdSet.has(p.avaliacao_id));

      const releaseReadyMap: Record<string, boolean> = {};
      allData.forEach((d: any) => {
        const tipo = d.tipo_aquisicao;
        if (isTipoConsignada(tipo)) {
          // Consignada: exige NF EMITIDA
          const nf = consigData.find(p => p.avaliacao_id === d.id && p.etapa === 'NF EMITIDA');
          releaseReadyMap[d.id] = !!(nf?.concluida);
        } else if (isTipoPropria(tipo)) {
          // Própria / Convertida / Test-ride / Repasse: exige NF EMITIDA + VISTORIA/CADEIA DOMINIAL
          const nf = pcData.find(p => p.avaliacao_id === d.id && p.etapa === 'NF EMITIDA');
          const vistoria = pcData.find(p => p.avaliacao_id === d.id && p.etapa === 'VISTORIA/CADEIA DOMINIAL');
          releaseReadyMap[d.id] = !!(nf?.concluida && vistoria?.concluida);
        } else {
          releaseReadyMap[d.id] = false;
        }
      });

      const histByEntity: Record<string, string> = {};
      (histResult.data || []).forEach((h: any) => {
        const prev = histByEntity[h.entity_id];
        if (!prev || new Date(h.created_at).getTime() > new Date(prev).getTime()) histByEntity[h.entity_id] = h.created_at;
      });
      const acquDateMap: Record<string, string> = {};
      allData.forEach((d: any) => {
        const byMoto = d.moto_avaliacao_id ? histByEntity[d.moto_avaliacao_id] : null;
        const byAval = histByEntity[d.id];
        const picked = [byMoto, byAval].filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];
        if (picked) acquDateMap[d.id] = picked;
      });

      let mapped = allData.map((d: any) => ({ ...d, atendimento: d.atendimentos, moto: d.motos_avaliacao, _estoqueInfo: estoqueMap[d.id] || null, _releaseReady: releaseReadyMap[d.id] ?? null, _dataAquisicao: acquDateMap[d.id] || null }));
      if (search.trim()) { const s = search.trim().toLowerCase(); mapped = mapped.filter((a: any) => [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto?.marca, a.moto?.modelo, a.moto?.placa].some(f => f && String(f).toLowerCase().includes(s))); }
      setItems(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const filteredItems = filterCidade === 'todos'
    ? items
    : items.filter((a: any) => CIDADE_LOJAS[filterCidade].includes(a.atendimento?.loja));
  const getColumnItems = (status: PreparacaoStatus) => filteredItems.filter((a: any) => (a.preparacao_status || 'em_aberto') === status);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><Wrench className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Preparação</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Preparação de motos adquiridas</p>
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
        <div className="flex flex-wrap items-center gap-1">
          {(['todos', 'Brasília', 'Florianópolis', 'Porto Alegre'] as const).map(c => (
            <Button
              key={c}
              size="sm"
              variant={filterCidade === c ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', filterCidade === c && 'shadow-sm')}
              onClick={() => setFilterCidade(c)}
            >
              {c === 'todos' ? 'Todas Cidades' : c}
            </Button>
          ))}
        </div>
      </FiltersPanel>

      {loading ? (
        <KanbanSkeleton columns={4} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-6">
            {PREPARACAO_COLUMNS.map(col => {
              const colItems = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[260px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-xs font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => (
                      <ProcessCard key={a.id} clientName={a.atendimento?.nome_cliente || 'N/A'}
                        motoLabel={a.moto ? [(a.moto.modelo || '').toUpperCase(), a.moto.placa?.replace(/-/g, '')].filter(Boolean).join(' - ') : undefined}
                        loja={a.atendimento?.loja} date={a._dataAquisicao || a.updated_at}
                        dateLabel={a._dataAquisicao ? 'Aquisição' : undefined}
                        statusColor={col.hex}
                        readyIndicator={a._releaseReady === true ? 'ready' : a._releaseReady === false ? 'not_ready' : null}
                        extraBadge={a.tipo_aquisicao ? { label: getTipoAquisicaoLabel(a.tipo_aquisicao) || '', className: getTipoAquisicaoBadgeClass(a.tipo_aquisicao) } : undefined}
                        onClick={() => setSelectedItem(a)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedItem && (
        <PreparacaoProcessoDialog
          open={!!selectedItem}
          onOpenChange={(open) => { if (!open) { setSelectedItem(null); fetchItems(); } }}
          avaliacaoId={selectedItem.id}
          currentStatus={selectedItem.preparacao_status || 'em_aberto'}
          avaliacaoData={selectedItem}
          onStatusChanged={() => { setSelectedItem(null); fetchItems(); }}
        />
      )}
    </div>
  );
};

export default PreparacaoTab;
