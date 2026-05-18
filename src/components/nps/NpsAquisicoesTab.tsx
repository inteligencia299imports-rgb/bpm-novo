import React, { useState, useEffect, useCallback } from 'react';
import { TODOS_TIPOS_AQUISICAO } from '@/lib/tipoAquisicao';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Send, Eye, Copy } from 'lucide-react';
import { SITUACOES_NPS } from '@/types/crm';
import type { SituacaoNps } from '@/types/crm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import AtendimentoCard from '@/components/showroom/AtendimentoCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import RespostasNpsDialog from './RespostasNpsDialog';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import NpsDateFilter from './NpsDateFilter';

interface NpsAquisicoesTabProps {
  onNavigateToShowroom: (atendimentoId: string) => void;
}

const NpsAquisicoesTab = ({ onNavigateToShowroom }: NpsAquisicoesTabProps) => {
  const { user, userName } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [respostasDialog, setRespostasDialog] = useState<{ open: boolean; atendimentoId: string; nomeCliente: string }>({ open: false, atendimentoId: '', nomeCliente: '' });
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos!inner (id, nome_cliente, telefone, loja, interesse, situacao, temperatura, created_at, updated_at, nps_status, sexo, uf, tipo_atendimento, vendedor_id, origem),
        motos_avaliacao!inner (id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada)
      `)
      .in('tipo_aquisicao', TODOS_TIPOS_AQUISICAO.filter(t => t !== 'test-ride'))
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar NPS Aquisições');
      console.error(error);
    } else {
      let mapped = (data || [])
        .filter((a: any) => a.atendimentos?.interesse === 'vender')
        .map((d: any) => ({
          ...d,
          _atendimentoCard: {
            ...d.atendimentos,
            motos_avaliacao: [d.motos_avaliacao],
            motos_interesse: [],
            interesse: 'vender',
          },
          atendimento: d.atendimentos,
          moto_avaliacao: d.motos_avaliacao,
        }));

      // Fetch acquisition dates from status_history (próprias/convertidas/repasse)
      const motoIds = mapped.map((m: any) => m.moto_avaliacao_id).filter(Boolean);
      const avalIds = mapped.map((m: any) => m.id).filter(Boolean);
      const motoAcqMap: Record<string, string> = {};
      if (motoIds.length > 0) {
        const { data: histData } = await supabase.from('status_history').select('entity_id, created_at').eq('entity_type', 'avaliacao').eq('status', 'adquirida').in('entity_id', motoIds);
        (histData || []).forEach((h: any) => { motoAcqMap[h.entity_id] = h.created_at; });
      }
      // Fetch estoque info for consignadas (data_venda, status, atendimento_venda_id)
      const estInfoMap: Record<string, { data_venda?: string; status?: string; atendimento_venda_id?: string }> = {};
      const estVendaMap: Record<string, string> = {};
      if (avalIds.length > 0) {
        const { data: estData } = await supabase
          .from('estoque')
          .select('avaliacao_id, data_venda, status, atendimento_venda_id')
          .in('avaliacao_id', avalIds);
        (estData || []).forEach((e: any) => {
          if (e.avaliacao_id) {
            estInfoMap[e.avaliacao_id] = { data_venda: e.data_venda, status: e.status, atendimento_venda_id: e.atendimento_venda_id };
            if (e.data_venda) estVendaMap[e.avaliacao_id] = e.data_venda;
          }
        });
      }
      mapped = mapped.map((m: any) => {
        if (m.tipo_aquisicao === 'consignada') {
          // Consignada: data_negociacao = estoque.data_venda OU status_history.RETIRADA
          return { ...m, _dataAquisicao: estVendaMap[m.id] || (m.moto_avaliacao_id && motoAcqMap[m.moto_avaliacao_id]) || null };
        }
        return { ...m, _dataAquisicao: (m.moto_avaliacao_id && motoAcqMap[m.moto_avaliacao_id]) || null };
      });

      // Readiness indicators (vw_envio_nps rules)
      const readyMap: Record<string, boolean> = {};
      const reasonMap: Record<string, string> = {};
      if (avalIds.length > 0) {
        // Pós-compra DOCUMENTAÇÃO RECEBIDA (próprias/convertidas)
        const { data: pcData } = await supabase
          .from('pos_compra_processos')
          .select('avaliacao_id, concluida')
          .eq('etapa', 'DOCUMENTAÇÃO RECEBIDA')
          .in('avaliacao_id', avalIds);
        const pcMap: Record<string, boolean> = {};
        (pcData || []).forEach((p: any) => { pcMap[p.avaliacao_id] = !!p.concluida; });

        // RETIRADA via status_history (consignadas retiradas)
        const { data: retData } = await supabase
          .from('status_history')
          .select('entity_id')
          .eq('status', 'RETIRADA')
          .in('entity_id', motoIds.length > 0 ? motoIds : ['00000000-0000-0000-0000-000000000000']);
        const retSet = new Set((retData || []).map((r: any) => r.entity_id));

        // PREVISÃO DE PAGAMENTO no pos_venda do atendimento_venda_id (consignadas vendidas)
        const atendVendaIds = Object.values(estInfoMap)
          .map(e => e.atendimento_venda_id)
          .filter(Boolean) as string[];
        const pvMap: Record<string, boolean> = {};
        if (atendVendaIds.length > 0) {
          const { data: pvData } = await supabase
            .from('pos_venda_processos')
            .select('atendimento_id, concluida')
            .eq('etapa', 'PREVISÃO DE PAGAMENTO')
            .in('atendimento_id', atendVendaIds);
          (pvData || []).forEach((p: any) => { pvMap[p.atendimento_id] = !!p.concluida; });
        }

        mapped.forEach((m: any) => {
          const tipo = m.tipo_aquisicao;
          if (tipo === 'propria' || tipo === 'convertida' || tipo === 'repasse') {
            if (!pcMap[m.id]) {
              readyMap[m.id] = false;
              reasonMap[m.id] = 'Pendente: aguardando conclusão de "Documentação recebida" no Pós-Compra';
            } else {
              readyMap[m.id] = true;
              reasonMap[m.id] = 'Pronto para envio: documentação recebida';
            }
          } else if (tipo === 'consignada') {
            const est = estInfoMap[m.id];
            const isRetirada = m.moto_avaliacao_id && retSet.has(m.moto_avaliacao_id);
            const isVendida = est?.status === 'vendido' && !!est?.data_venda;
            const pvOk = est?.atendimento_venda_id ? !!pvMap[est.atendimento_venda_id] : false;

            if (isRetirada) {
              readyMap[m.id] = true;
              reasonMap[m.id] = 'Pronto para envio: moto retirada pelo consignante';
            } else if (isVendida && pvOk) {
              readyMap[m.id] = true;
              reasonMap[m.id] = 'Pronto para envio: moto vendida e previsão de pagamento concluída';
            } else if (isVendida && !pvOk) {
              readyMap[m.id] = false;
              reasonMap[m.id] = 'Pendente: aguardando conclusão de "Previsão de pagamento" no Pós-Venda';
            } else {
              readyMap[m.id] = false;
              reasonMap[m.id] = 'Pendente: moto consignada ainda não foi vendida nem retirada';
            }
          }
        });
      }
      mapped = mapped.map((m: any) => ({ ...m, _ready: readyMap[m.id] || false, _readyReason: reasonMap[m.id] || '' }));

      // Latest NPS status_history per atendimento (NPS ENVIADO / NPS NÃO ENVIADO)
      const atIds = mapped.map((m: any) => m.atendimento_id).filter(Boolean);
      const npsSentMap: Record<string, 'sent' | 'invalid'> = {};
      if (atIds.length > 0) {
        const { data: shData } = await supabase
          .from('status_history')
          .select('entity_id, status, created_at')
          .in('entity_id', atIds)
          .in('status', ['NPS ENVIADO', 'NPS ENVIADO MANUALMENTE', 'NPS NÃO ENVIADO'])
          .order('created_at', { ascending: false });
        (shData || []).forEach((r: any) => {
          if (npsSentMap[r.entity_id]) return;
          npsSentMap[r.entity_id] = r.status === 'NPS NÃO ENVIADO' ? 'invalid' : 'sent';
        });
      }
      mapped = mapped.map((m: any) => ({ ...m, _npsSent: npsSentMap[m.atendimento_id] || null }));

      // Filtra apenas aquisições a partir de 06/04/2026 (data_negociacao definida)
      const cutoff = new Date('2026-04-06T00:00:00').getTime();
      mapped = mapped.filter((m: any) => m._dataAquisicao && new Date(m._dataAquisicao).getTime() >= cutoff);

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) =>
          [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto_avaliacao?.modelo, a.moto_avaliacao?.placa]
            .some(f => f && String(f).toLowerCase().includes(s))
        );
      }
      setItems(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColumnItems = (status: SituacaoNps) =>
    items.filter(a => {
      if ((a.nps_status || 'em_aberto') !== status) return false;
      if (!matchesCidade(a.atendimento?.loja, filterCidade)) return false;
      if (dataInicio || dataFim) {
        if (!a._dataAquisicao) return false;
        const t = new Date(a._dataAquisicao).getTime();
        if (dataInicio && t < new Date(`${dataInicio}T00:00:00`).getTime()) return false;
        if (dataFim && t > new Date(`${dataFim}T23:59:59`).getTime()) return false;
      }
      return true;
    });

  const handleUpdateStatus = async (e: React.MouseEvent, id: string, newStatus: SituacaoNps) => {
    e.stopPropagation();
    const updates: any = { nps_status: newStatus };
    if (newStatus === 'enviado') updates.nps_enviado_at = new Date().toISOString();
    if (newStatus === 'respondido') updates.nps_respondido_at = new Date().toISOString();

    const { error } = await supabase.from('avaliacoes').update(updates).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(`Marcado como ${newStatus === 'enviado' ? 'Enviado' : 'Respondido'}`);
      fetchData();
    }
  };

  const handleEnviarPesquisa = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    const telefone = item.atendimento?.telefone?.replace(/\D/g, '') || '';
    const atendimentoId = item.atendimento_id;
    const previousStatus = item.nps_status || 'em_aberto';
    const link = `https://tally.so/r/VLZ5Ej?id=${atendimentoId}`;

    if (previousStatus === 'enviado') {
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
    const { error } = await supabase.from('avaliacoes').update(updates).eq('id', item.id);
    if (error) {
      toast.error('Erro ao registrar envio');
    } else {
      const isManual = previousStatus === 'enviado';
      await supabase.from('status_history').insert({
        entity_id: atendimentoId,
        entity_type: 'nps_aquisicao',
        status: isManual ? 'NPS ENVIADO MANUALMENTE' : 'enviado',
        changed_by: user?.id,
        changed_by_name: userName,
        observacoes: isManual ? 'Pesquisa reenviada (link copiado)' : 'Pesquisa enviada',
      });
      if (!isManual) toast.success('Pesquisa enviada');
      fetchData();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, modelo ou placa..."
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
      </div>

      <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
      <NpsDateFilter
        dataInicio={dataInicio}
        dataFim={dataFim}
        onChange={(i, f) => { setDataInicio(i); setDataFim(f); }}
        label="Data de aquisição"
      />

      {loading ? (
        <KanbanSkeleton columns={3} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-3">
            {SITUACOES_NPS.map(col => {
              const colItems = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma avaliação</p>
                    ) : (
                      colItems.map(a => {
                        const status = a.nps_status || 'em_aberto';
                        let indicator: 'ready' | 'not_ready' | null = null;
                        let reason: string | undefined = undefined;
                        if (status === 'em_aberto') {
                          indicator = a._ready ? 'ready' : 'not_ready';
                          reason = a._readyReason;
                        } else if (status === 'enviado') {
                          if (a._npsSent === 'sent') { indicator = 'ready'; reason = 'NPS ENVIADO'; }
                          else if (a._npsSent === 'invalid') { indicator = 'not_ready'; reason = 'NPS NÃO ENVIADO'; }
                        }
                        return (
                        <AtendimentoCard
                          key={a.id}
                          atendimento={a._atendimentoCard}
                          onClick={() => onNavigateToShowroom(a.atendimento_id)}
                          dateOverride={a._dataAquisicao || undefined}
                          statusColorOverride={SITUACOES_NPS.find(s => s.value === status)?.hex}
                          readyIndicator={indicator}
                          readyReason={reason}
                          interesseLabelOverride={a.tipo_aquisicao === 'consignada' ? 'Consignada' : a.tipo_aquisicao === 'propria' ? 'Própria' : a.tipo_aquisicao === 'convertida' ? 'Convertida' : a.tipo_aquisicao === 'repasse' ? 'Repasse' : undefined}
                          actions={
                            <>
                              {(a.nps_status || 'em_aberto') === 'enviado' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a)}>
                                  <Copy className="h-3 w-3" /> Copiar Link
                                </Button>
                              )}
                              {(a.nps_status || 'em_aberto') === 'respondido' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => { e.stopPropagation(); setRespostasDialog({ open: true, atendimentoId: a.id, nomeCliente: a.atendimento?.nome_cliente || '' }); }}>
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

export default NpsAquisicoesTab;
