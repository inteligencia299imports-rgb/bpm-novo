import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Send, Eye, Copy, Filter } from 'lucide-react';
import { SITUACOES_NPS } from '@/types/crm';
import type { SituacaoNps } from '@/types/crm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import AtendimentoCard from '@/components/showroom/AtendimentoCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import RespostasNpsDialog from './RespostasNpsDialog';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import FiltersPanel from '@/components/shared/FiltersPanel';

import { isLojaDucati } from '@/lib/lojaUtils';
import NpsDateFilter from './NpsDateFilter';

interface NpsVendasTabProps {
  onNavigateToShowroom: (atendimentoId: string) => void;
}

const NpsVendasTab = ({ onNavigateToShowroom }: NpsVendasTabProps) => {
  const { user, userName, role } = useAuth();
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [entregaMap, setEntregaMap] = useState<Record<string, boolean>>({});
  const [npsSentMap, setNpsSentMap] = useState<Record<string, 'sent' | 'invalid'>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [respostasDialog, setRespostasDialog] = useState<{ open: boolean; atendimentoId: string; nomeCliente: string }>({ open: false, atendimentoId: '', nomeCliente: '' });
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const PER_STATUS_LIMIT = 50;
    const isSearching = search.trim().length > 0;

    const buildQuery = (status?: SituacaoNps) => {
      let q = supabase
        .from('atendimentos')
        .select('*, motos_interesse(*), motos_avaliacao(*)')
        .eq('situacao', 'vendido')
        .in('interesse', ['comprar', 'trocar']);

      if (status) {
        if (status === 'em_aberto') {
          q = q.or('nps_status.eq.em_aberto,nps_status.is.null');
        } else {
          q = q.eq('nps_status', status);
        }
      }

      if (role !== 'gestor') {
        q = q.eq('vendedor_id', user?.id || '');
      }

      q = q.order('updated_at', { ascending: false });
      if (!isSearching && status) q = q.limit(PER_STATUS_LIMIT);
      return q;
    };

    let data: any[] = [];
    let error: any = null;
    if (isSearching) {
      const result = await buildQuery();
      error = result.error;
      data = result.data || [];
    } else {
      const statuses: SituacaoNps[] = SITUACOES_NPS.map(s => s.value);
      const results = await Promise.all(statuses.map(s => buildQuery(s)));
      error = results.find(r => r.error)?.error;
      data = results.flatMap(r => r.data || []);
    }

    if (error) {
      toast.error('Erro ao carregar NPS Vendas');
      console.error(error);
    } else {
      // Enrich motos_interesse with estoque data
      let mapped = data || [];
      const atIds = mapped.map((a: any) => a.id);
      if (atIds.length > 0) {
        const { data: estData } = await supabase.from('estoque').select('id, marca, modelo, placa, cor, atendimento_venda_id').in('atendimento_venda_id', atIds);
        const estMap: Record<string, any> = {};
        (estData || []).forEach((e: any) => { if (e.atendimento_venda_id) estMap[e.atendimento_venda_id] = e; });
        mapped = mapped.map((a: any) => {
          const est = estMap[a.id];
          if (est && a.motos_interesse) {
            a.motos_interesse = a.motos_interesse.map((mi: any) =>
              mi.estoque_moto_id === est.id ? { ...mi, _estoque: est } : mi
            );
          }
          return a;
        });
      }

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) =>
          [a.nome_cliente, a.telefone, a.loja].some(f => f && String(f).toLowerCase().includes(s))
        );
      }
      setAtendimentos(mapped);

      // Fetch ENTREGA DA MOTO step status for each atendimento
      if (atIds.length > 0) {
        const { data: pvData } = await supabase
          .from('pos_venda_processos')
          .select('atendimento_id, concluida, data_conclusao')
          .eq('etapa', 'ENTREGA DA MOTO')
          .in('atendimento_id', atIds);
        const map: Record<string, boolean> = {};
        (pvData || []).forEach((p: any) => { map[p.atendimento_id] = !!p.concluida || !!p.data_conclusao; });
        setEntregaMap(map);
      } else {
        setEntregaMap({});
      }

      // Fetch latest NPS status_history per atendimento
      if (atIds.length > 0) {
        const { data: shData } = await supabase
          .from('status_history')
          .select('entity_id, status, created_at')
          .in('entity_id', atIds)
          .in('status', ['NPS ENVIADO', 'NPS ENVIADO MANUALMENTE', 'NPS NÃO ENVIADO'])
          .order('created_at', { ascending: false });
        const sMap: Record<string, 'sent' | 'invalid'> = {};
        (shData || []).forEach((r: any) => {
          if (sMap[r.entity_id]) return; // first (latest) wins
          sMap[r.entity_id] = r.status === 'NPS NÃO ENVIADO' ? 'invalid' : 'sent';
        });
        setNpsSentMap(sMap);
      } else {
        setNpsSentMap({});
      }
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColumnItems = (status: SituacaoNps) =>
    atendimentos.filter(a => {
      if ((a.nps_status || 'em_aberto') !== status) return false;
      if (!matchesCidade(a.loja, filterCidade)) return false;
      if (dateFrom || dateTo) {
        if (!a.data_venda) return false;
        const t = new Date(a.data_venda).getTime();
        if (dateFrom && t < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
        if (dateTo && t > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      }
      return true;
    });

  const handleUpdateStatus = async (e: React.MouseEvent, id: string, newStatus: SituacaoNps) => {
    e.stopPropagation();
    const updates: any = { nps_status: newStatus };
    if (newStatus === 'enviado') updates.nps_enviado_at = new Date().toISOString();
    if (newStatus === 'respondido') updates.nps_respondido_at = new Date().toISOString();

    const { error } = await supabase.from('atendimentos').update(updates).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(`Marcado como ${newStatus === 'enviado' ? 'Enviado' : 'Respondido'}`);
      fetchData();
    }
  };

  const handleEnviarPesquisa = async (e: React.MouseEvent, atendimento: any, forceCopy = false) => {
    e.stopPropagation();
    const telefone = atendimento.telefone?.replace(/\D/g, '') || '';
    const id = atendimento.id;
    const previousStatus = atendimento.nps_status || 'em_aberto';
    const link = `https://tally.so/r/OD4Gp7?id=${id}`;
    const useCopy = forceCopy || previousStatus === 'enviado';

    if (useCopy) {
      try {
        await navigator.clipboard.writeText(link);
        toast.success('Link copiado');
      } catch {
        toast.error('Não foi possível copiar o link');
        return;
      }
    } else {
      const url = `https://wa.me/55${telefone}?text=${encodeURIComponent(link)}`;
      window.open(url, '_blank');
    }

    const updates = { nps_status: 'enviado', nps_enviado_at: new Date().toISOString() };
    const { error } = await supabase.from('atendimentos').update(updates).eq('id', id);
    if (error) {
      toast.error('Erro ao registrar envio');
    } else {
      const isManual = previousStatus === 'enviado';
      await supabase.from('status_history').insert({
        entity_id: id,
        entity_type: 'nps_venda',
        status: isManual ? 'NPS ENVIADO MANUALMENTE' : 'enviado',
        changed_by: user?.id,
        changed_by_name: userName,
        observacoes: isManual ? 'Pesquisa reenviada (link copiado)' : (forceCopy ? 'Pesquisa enviada (link copiado)' : 'Pesquisa enviada'),
      });
      if (!isManual) toast.success('Pesquisa enviada');
      fetchData();
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="outline" size="icon" className="md:hidden shrink-0" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <FiltersPanel show={showFilters}>
        <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
        <NpsDateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </FiltersPanel>



      {loading ? (
        <KanbanSkeleton columns={3} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-3">
            {SITUACOES_NPS.map(col => {
              const items = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{items.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum atendimento</p>
                    ) : (
                      items.map(a => {
                        const status = a.nps_status || 'em_aberto';
                        let indicator: 'ready' | 'not_ready' | null = null;
                        let reason: string | undefined = undefined;
                        if (status === 'em_aberto') {
                          indicator = entregaMap[a.id] ? 'ready' : 'not_ready';
                          reason = entregaMap[a.id]
                            ? 'Pronto para envio: entrega da moto concluída'
                            : 'Pendente: aguardando registro da data de entrega da moto';
                        } else if (status === 'enviado') {
                          const s = npsSentMap[a.id];
                          if (s === 'sent') { indicator = 'ready'; reason = 'NPS ENVIADO'; }
                          else if (s === 'invalid') { indicator = 'not_ready'; reason = 'NPS NÃO ENVIADO'; }
                        }
                        return (
                         <AtendimentoCard
                          key={a.id}
                          atendimento={a}
                          onClick={() => onNavigateToShowroom(a.id)}
                          dateOverride={a.data_venda || undefined}
                          statusColorOverride={SITUACOES_NPS.find(s => s.value === status)?.hex}
                          readyIndicator={indicator}
                          readyReason={reason}
                          actions={
                            <>
                              {(a.nps_status || 'em_aberto') === 'em_aberto' && entregaMap[a.id] && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a, true)}>
                                  <Send className="h-3 w-3" /> Enviar
                                </Button>
                              )}
                              {(a.nps_status || 'em_aberto') === 'enviado' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a)}>
                                  <Copy className="h-3 w-3" /> Copiar Link
                                </Button>
                              )}
                              {(a.nps_status || 'em_aberto') === 'respondido' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => { e.stopPropagation(); setRespostasDialog({ open: true, atendimentoId: a.id, nomeCliente: a.nome_cliente }); }}>
                                  <Eye className="h-3 w-3" /> Visualizar Respostas
                                </Button>
                              )}
                            </>

                          }
                        />
                      );})
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <RespostasNpsDialog
        open={respostasDialog.open}
        onOpenChange={(open) => setRespostasDialog(prev => ({ ...prev, open }))}
        atendimentoId={respostasDialog.atendimentoId}
        nomeCliente={respostasDialog.nomeCliente}
      />
    </div>
  );
};

export default NpsVendasTab;
