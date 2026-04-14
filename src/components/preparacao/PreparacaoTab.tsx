import React, { useState, useEffect, useCallback } from 'react';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass, isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Wrench } from 'lucide-react';
import { PREPARACAO_COLUMNS } from '@/types/crm';
import type { PreparacaoStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';

interface PreparacaoTabProps {
  initialAvaliacaoId?: string | null;
  onInitialHandled?: () => void;
}

const PreparacaoTab = ({ initialAvaliacaoId, onInitialHandled }: PreparacaoTabProps = {}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  useEffect(() => {
    if (initialAvaliacaoId) {
      supabase.from('avaliacoes')
        .select(`*, atendimentos!inner(id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes, tem_manual, tem_chave_reserva, manutencao_vencida)`)
        .eq('id', initialAvaliacaoId).single().then(({ data }) => {
          if (data) setSelectedItem({ ...data, atendimento: (data as any).atendimentos, moto: (data as any).motos_avaliacao });
        });
      onInitialHandled?.();
    }
  }, [initialAvaliacaoId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const PER_STATUS_LIMIT = 50;
    const isSearching = search.trim().length > 0;
    const statuses = PREPARACAO_COLUMNS.map(c => c.value);
    const selectStr = `*, atendimentos!inner(id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes, tem_manual, tem_chave_reserva, manutencao_vencida)`;

    let allData: any[];
    let err1: any;
    const estResult = await supabase.from('estoque').select('avaliacao_id, status, observacoes').not('avaliacao_id', 'is', null);
    if (isSearching) {
      const result = await supabase.from('avaliacoes').select(selectStr).in('situacao', ['adquirida', 'estoque']).order('updated_at', { ascending: false });
      err1 = result.error;
      allData = result.data || [];
    } else {
      const statusResults = await Promise.all(statuses.map(s => supabase.from('avaliacoes').select(selectStr).in('situacao', ['adquirida', 'estoque']).eq('preparacao_status', s).order('updated_at', { ascending: false }).limit(PER_STATUS_LIMIT)));
      err1 = statusResults.find(r => r.error)?.error;
      allData = statusResults.flatMap(r => r.data || []);
    }
    if (err1) { toast.error('Erro ao carregar preparação'); } else {
      const estData = estResult.data;
      const estoqueMap: Record<string, { status: string; observacoes: string | null }> = {};
      (estData || []).forEach((e: any) => { if (e.avaliacao_id) estoqueMap[e.avaliacao_id] = { status: e.status, observacoes: e.observacoes }; });

      // Fetch release readiness data
      const avaliacaoIds = allData.map((d: any) => d.id);
      const [pcResult, consigResult, histResult] = await Promise.all([
        supabase.from('pos_compra_processos').select('avaliacao_id, etapa, concluida').in('avaliacao_id', avaliacaoIds.length ? avaliacaoIds : ['']).in('etapa', ['NF EMITIDA', 'VISTORIA/CADEIA DOMINIAL']),
        supabase.from('consignacao_processos').select('avaliacao_id, etapa, concluida').in('avaliacao_id', avaliacaoIds.length ? avaliacaoIds : ['']).eq('etapa', 'NF EMITIDA'),
        supabase.from('status_history').select('entity_id, created_at').eq('entity_type', 'avaliacao').eq('status', 'adquirida').in('entity_id', allData.map((d: any) => d.moto_avaliacao_id).filter(Boolean).length ? allData.map((d: any) => d.moto_avaliacao_id).filter(Boolean) : ['']),
      ]);
      const pcData = pcResult.data || [];
      const consigData = consigResult.data || [];

      const releaseReadyMap: Record<string, boolean> = {};
      allData.forEach((d: any) => {
        const tipo = d.tipo_aquisicao;
        if (isTipoPropria(tipo)) {
          const nf = pcData.find(p => p.avaliacao_id === d.id && p.etapa === 'NF EMITIDA');
          const vistoria = pcData.find(p => p.avaliacao_id === d.id && p.etapa === 'VISTORIA/CADEIA DOMINIAL');
          releaseReadyMap[d.id] = !!(nf?.concluida && vistoria?.concluida);
        } else if (isTipoConsignada(tipo)) {
          const nf = consigData.find(p => p.avaliacao_id === d.id && p.etapa === 'NF EMITIDA');
          releaseReadyMap[d.id] = !!(nf?.concluida);
        }
      });

      const acquDateMap: Record<string, string> = {};
      (histResult.data || []).forEach((h: any) => { acquDateMap[h.entity_id] = h.created_at; });

      let mapped = allData.map((d: any) => ({ ...d, atendimento: d.atendimentos, moto: d.motos_avaliacao, _estoqueInfo: estoqueMap[d.id] || null, _releaseReady: releaseReadyMap[d.id] ?? null, _dataAquisicao: acquDateMap[d.id] || null }));
      if (search.trim()) { const s = search.trim().toLowerCase(); mapped = mapped.filter((a: any) => [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto?.marca, a.moto?.modelo, a.moto?.placa].some(f => f && String(f).toLowerCase().includes(s))); }
      setItems(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const getColumnItems = (status: PreparacaoStatus) => items.filter((a: any) => (a.preparacao_status || 'em_aberto') === status);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><Wrench className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Preparação</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Preparação de motos adquiridas</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </div>
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
                        loja={a.atendimento?.loja} date={a._dataAquisicao || a.updated_at} statusColor={col.hex}
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
          onOpenChange={(open) => { if (!open) setSelectedItem(null); }}
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
