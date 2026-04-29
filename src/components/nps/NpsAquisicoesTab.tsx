import React, { useState, useEffect, useCallback } from 'react';
import { TODOS_TIPOS_AQUISICAO } from '@/lib/tipoAquisicao';
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

interface NpsAquisicoesTabProps {
  onNavigateToShowroom: (atendimentoId: string) => void;
}

const NpsAquisicoesTab = ({ onNavigateToShowroom }: NpsAquisicoesTabProps) => {
  const { user, userName } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [respostasDialog, setRespostasDialog] = useState<{ open: boolean; atendimentoId: string; nomeCliente: string }>({ open: false, atendimentoId: '', nomeCliente: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos!inner (id, nome_cliente, telefone, loja, interesse, situacao, temperatura, created_at, updated_at, nps_status, sexo, uf, tipo_atendimento, vendedor_id, origem),
        motos_avaliacao!inner (id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada)
      `)
      .in('situacao', ['adquirida', 'estoque', 'perdido'])
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

      // Fetch acquisition dates from status_history
      const motoIds = mapped.map((m: any) => m.moto_avaliacao_id).filter(Boolean);
      const avalIds = mapped.map((m: any) => m.id).filter(Boolean);
      if (motoIds.length > 0) {
        const { data: histData } = await supabase.from('status_history').select('entity_id, created_at').eq('entity_type', 'avaliacao').eq('status', 'adquirida').in('entity_id', motoIds);
        const motoAcqMap: Record<string, string> = {};
        (histData || []).forEach((h: any) => { motoAcqMap[h.entity_id] = h.created_at; });
        mapped = mapped.map((m: any) => ({ ...m, _dataAquisicao: (m.moto_avaliacao_id && motoAcqMap[m.moto_avaliacao_id]) || null }));
      }

      // Readiness indicators
      const readyMap: Record<string, boolean> = {};
      if (avalIds.length > 0) {
        const [{ data: pcData }, { data: cgData }, { data: retData }] = await Promise.all([
          supabase.from('pos_compra_processos').select('avaliacao_id, concluida').eq('etapa', 'DOCUMENTAÇÃO RECEBIDA').in('avaliacao_id', avalIds),
          supabase.from('consignacao_processos').select('avaliacao_id, concluida').eq('etapa', 'NF EMITIDA').in('avaliacao_id', avalIds),
          supabase.from('status_history').select('entity_id').eq('entity_type', 'avaliacao').eq('status', 'RETIRADA').in('entity_id', avalIds),
        ]);
        const pcMap: Record<string, boolean> = {};
        (pcData || []).forEach((p: any) => { pcMap[p.avaliacao_id] = !!p.concluida; });
        const cgMap: Record<string, boolean> = {};
        (cgData || []).forEach((c: any) => { cgMap[c.avaliacao_id] = !!c.concluida; });
        const retSet = new Set((retData || []).map((r: any) => r.entity_id));

        mapped.forEach((m: any) => {
          const tipo = m.tipo_aquisicao;
          if (tipo === 'propria' || tipo === 'convertida' || tipo === 'repasse') {
            readyMap[m.id] = !!pcMap[m.id] && m.situacao === 'adquirida';
          } else if (tipo === 'consignada') {
            if (retSet.has(m.id)) {
              readyMap[m.id] = true;
            } else if (m.situacao !== 'perdido') {
              readyMap[m.id] = !!cgMap[m.id];
            } else {
              readyMap[m.id] = false;
            }
          }
        });
      }
      mapped = mapped.map((m: any) => ({ ...m, _ready: readyMap[m.id] || false }));

      // Exclude perdido that aren't retiradas
      mapped = mapped.filter((m: any) => m.situacao !== 'perdido' || readyMap[m.id]);

      // Filtra apenas aquisições a partir de 06/04/2026
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
    items.filter(a => (a.nps_status || 'em_aberto') === status);

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
    const url = `https://wa.me/55${telefone}?text=https%3A%2F%2Ftally.so%2Fr%2FVLZ5Ej%3Fid%3D${atendimentoId}`;
    window.open(url, '_blank');

    const updates = { nps_status: 'enviado', nps_enviado_at: new Date().toISOString() };
    const { error } = await supabase.from('avaliacoes').update(updates).eq('id', item.id);
    if (error) {
      toast.error('Erro ao registrar envio');
    } else {
      await supabase.from('status_history').insert({
        entity_id: atendimentoId,
        entity_type: 'nps_aquisicao',
        status: 'enviado',
        changed_by: user?.id,
        changed_by_name: userName,
        observacoes: previousStatus === 'enviado' ? 'Pesquisa reenviada' : 'Pesquisa enviada',
      });
      toast.success(previousStatus === 'enviado' ? 'Pesquisa reenviada' : 'Pesquisa enviada');
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
                      colItems.map(a => (
                        <AtendimentoCard
                          key={a.id}
                          atendimento={a._atendimentoCard}
                          onClick={() => onNavigateToShowroom(a.atendimento_id)}
                          dateOverride={a._dataAquisicao || undefined}
                          statusColorOverride={SITUACOES_NPS.find(s => s.value === (a.nps_status || 'em_aberto'))?.hex}
                          readyIndicator={a._ready ? 'ready' : 'not_ready'}
                          actions={
                            <>
                              {(a.nps_status || 'em_aberto') === 'em_aberto' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a)}>
                                  <Send className="h-3 w-3" /> Enviar Pesquisa
                                </Button>
                              )}
                              {(a.nps_status || 'em_aberto') === 'enviado' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => handleEnviarPesquisa(e, a)}>
                                  <Send className="h-3 w-3" /> Reenviar Pesquisa
                                </Button>
                              )}
                              {(a.nps_status || 'em_aberto') === 'respondido' && (
                                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 w-full" onClick={(e) => { e.stopPropagation(); setRespostasDialog({ open: true, atendimentoId: a.atendimento_id, nomeCliente: a.atendimento?.nome_cliente || '' }); }}>
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

export default NpsAquisicoesTab;
