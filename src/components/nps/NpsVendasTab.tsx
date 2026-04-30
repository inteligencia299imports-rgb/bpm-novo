import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Send, Eye } from 'lucide-react';
import { SITUACOES_NPS } from '@/types/crm';
import type { SituacaoNps } from '@/types/crm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import AtendimentoCard from '@/components/showroom/AtendimentoCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import RespostasNpsDialog from './RespostasNpsDialog';

interface NpsVendasTabProps {
  onNavigateToShowroom: (atendimentoId: string) => void;
}

const NpsVendasTab = ({ onNavigateToShowroom }: NpsVendasTabProps) => {
  const { user, userName, role } = useAuth();
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [entregaMap, setEntregaMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [respostasDialog, setRespostasDialog] = useState<{ open: boolean; atendimentoId: string; nomeCliente: string }>({ open: false, atendimentoId: '', nomeCliente: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('atendimentos')
      .select('*, motos_interesse(*), motos_avaliacao(*)')
      .eq('situacao', 'vendido')
      .in('interesse', ['comprar', 'trocar'])
      .gte('data_venda', '2026-04-06');

    // Vendedores veem apenas os próprios; gestor vê todos
    if (role !== 'gestor') {
      query = query.eq('vendedor_id', user?.id || '');
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

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
          .select('atendimento_id, concluida')
          .eq('etapa', 'ENTREGA DA MOTO')
          .in('atendimento_id', atIds);
        const map: Record<string, boolean> = {};
        (pvData || []).forEach((p: any) => { map[p.atendimento_id] = !!p.concluida; });
        setEntregaMap(map);
      } else {
        setEntregaMap({});
      }
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColumnItems = (status: SituacaoNps) =>
    atendimentos.filter(a => (a.nps_status || 'em_aberto') === status);

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

  const handleEnviarPesquisa = async (e: React.MouseEvent, atendimento: any) => {
    e.stopPropagation();
    const telefone = atendimento.telefone?.replace(/\D/g, '') || '';
    const id = atendimento.id;
    const previousStatus = atendimento.nps_status || 'em_aberto';
    const link = `https://tally.so/r/OD4Gp7?id=${id}`;

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
    const { error } = await supabase.from('atendimentos').update(updates).eq('id', id);
    if (error) {
      toast.error('Erro ao registrar envio');
    } else {
      await supabase.from('status_history').insert({
        entity_id: id,
        entity_type: 'nps_venda',
        status: 'enviado',
        changed_by: user?.id,
        changed_by_name: userName,
        observacoes: previousStatus === 'enviado' ? 'Pesquisa reenviada (link copiado)' : 'Pesquisa enviada',
      });
      if (previousStatus !== 'enviado') toast.success('Pesquisa enviada');
      fetchData();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
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
      </div>

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
                      items.map(a => (
                         <AtendimentoCard
                          key={a.id}
                          atendimento={a}
                          onClick={() => onNavigateToShowroom(a.id)}
                          dateOverride={a.data_venda || undefined}
                          statusColorOverride={SITUACOES_NPS.find(s => s.value === (a.nps_status || 'em_aberto'))?.hex}
                          readyIndicator={entregaMap[a.id] ? 'ready' : 'not_ready'}
                          readyReason={entregaMap[a.id] ? 'Pronto para envio: entrega da moto concluída' : 'Pendente: aguardando conclusão da etapa "Entrega da moto" no Pós-Venda'}
                          actions={
                            <>
                              {(a.nps_status || 'em_aberto') === 'enviado' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a)}>
                                  <Send className="h-3 w-3" /> Reenviar Pesquisa
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
                      ))
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
