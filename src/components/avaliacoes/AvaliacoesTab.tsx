import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, X, ClipboardCheck } from 'lucide-react';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { Avaliacao, SituacaoAvaliacao } from '@/types/crm';
import AvaliacaoCard from './AvaliacaoCard';
import AvaliacaoForm from './AvaliacaoForm';
import { toast } from 'sonner';

const KANBAN_COLUMNS = SITUACOES_AVALIACAO;

const AvaliacoesTab = () => {
  const { role } = useAuth();
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchAvaliacoes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos!inner (id, nome_cliente, telefone, loja, vendedor_id, interesse),
        motos_avaliacao!inner (id, marca, modelo, ano_fabricacao, ano_modelo, placa, km, cor, categoria)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar avaliações');
      console.error(error);
    } else {
      let mapped = (data || []).map((d: any) => ({
        ...d,
        atendimento: d.atendimentos,
        moto_avaliacao: d.motos_avaliacao,
      }));
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) => {
          const fields = [
            a.atendimento?.nome_cliente,
            a.atendimento?.telefone,
            a.atendimento?.loja,
            a.moto_avaliacao?.marca,
            a.moto_avaliacao?.modelo,
            a.moto_avaliacao?.placa,
            a.moto_avaliacao?.cor,
          ];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setAvaliacoes(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchAvaliacoes(); }, [fetchAvaliacoes]);

  const handleClose = () => {
    setSelectedId(null);
    fetchAvaliacoes();
  };

  if (selectedId) {
    return <AvaliacaoForm avaliacaoId={selectedId} onClose={handleClose} />;
  }

  const getColumnAvaliacoes = (situacao: SituacaoAvaliacao) =>
    avaliacoes.filter(a => a.situacao === situacao);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Avaliações</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Pipeline de avaliações de motos</p>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, marca, modelo ou placa..."
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

      {/* Kanban Board */}
      {loading ? (
        <KanbanSkeleton columns={4} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-5">
            {KANBAN_COLUMNS.map(col => {
              const items = getColumnAvaliacoes(col.value);
              const colHexMap: Record<string, string> = { sem_avaliar: '#6B7280', em_aberto: '#F2C94C', adquirida: '#27AE60', dispensada: '#FF3B30', perdido: '#FF8C00' };
              const colHex = colHexMap[col.value] || '#6B7280';
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colHex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {/* Column body */}
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma avaliação</p>
                    ) : (
                      items.map(a => (
                        <AvaliacaoCard key={a.id} avaliacao={a} onOpen={() => setSelectedId(a.id)} role={role} />
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

export default AvaliacoesTab;
