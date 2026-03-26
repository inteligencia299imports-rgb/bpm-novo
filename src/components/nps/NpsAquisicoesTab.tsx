import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { SITUACOES_NPS } from '@/types/crm';
import type { SituacaoNps } from '@/types/crm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import NpsCard from './NpsCard';

interface NpsAquisicoesTabProps {
  onNavigateToShowroom: (atendimentoId: string) => void;
}

const NpsAquisicoesTab = ({ onNavigateToShowroom }: NpsAquisicoesTabProps) => {
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos!inner (id, nome_cliente, telefone, loja, interesse),
        motos_avaliacao!inner (id, marca, modelo, placa)
      `)
      .eq('situacao', 'adquirida')
      .in('tipo_aquisicao', ['propria', 'consignada'])
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar NPS Aquisições');
      console.error(error);
    } else {
      let mapped = (data || [])
        .filter((a: any) => a.atendimentos?.interesse !== 'trocar')
        .map((d: any) => ({
          ...d,
          atendimento: d.atendimentos,
          moto_avaliacao: d.motos_avaliacao,
        }));

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) =>
          [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto_avaliacao?.modelo, a.moto_avaliacao?.placa]
            .some(f => f && String(f).toLowerCase().includes(s))
        );
      }
      setAvaliacoes(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColumnItems = (status: SituacaoNps) =>
    avaliacoes.filter(a => (a.nps_status || 'em_aberto') === status);

  const handleUpdateStatus = async (id: string, newStatus: SituacaoNps) => {
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
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma avaliação</p>
                    ) : (
                      items.map(a => (
                        <NpsCard
                          key={a.id}
                          title={a.atendimento?.nome_cliente || '-'}
                          subtitle={`${a.moto_avaliacao?.marca} ${(a.moto_avaliacao?.modelo || '').toUpperCase()}${a.moto_avaliacao?.placa ? ` - ${a.moto_avaliacao.placa.replace(/-/g, '')}` : ''}`}
                          loja={a.atendimento?.loja}
                          date={a.updated_at}
                          npsStatus={a.nps_status || 'em_aberto'}
                          onUpdateStatus={(status) => handleUpdateStatus(a.id, status)}
                          onClick={() => onNavigateToShowroom(a.atendimento_id)}
                          accentColor="#9B51E0"
                          badge={a.tipo_aquisicao === 'consignada' ? 'Consignada' : a.tipo_aquisicao === 'convertida' ? 'Convertida' : 'Própria'}
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
    </div>
  );
};

export default NpsAquisicoesTab;
