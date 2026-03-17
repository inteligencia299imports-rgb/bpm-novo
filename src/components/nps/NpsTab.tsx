import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { SITUACOES_NPS } from '@/types/crm';
import type { SituacaoNps } from '@/types/crm';
import { toast } from 'sonner';
import NpsCard from './NpsCard';

const KANBAN_COLUMNS = SITUACOES_NPS;

const NpsTab = () => {
  const { role } = useAuth();
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAtendimentos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos')
      .select(`
        *,
        motos_interesse (id, marca, modelo, ano, origem, estoque_moto_id)
      `)
      .eq('situacao', 'vendido')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar NPS');
      console.error(error);
    } else {
      let mapped = data || [];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) => {
          const fields = [a.nome_cliente, a.telefone, a.loja];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setAtendimentos(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchAtendimentos(); }, [fetchAtendimentos]);

  const getColumnItems = (status: SituacaoNps) =>
    atendimentos.filter(a => (a.nps_status || 'em_aberto') === status);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NPS</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pesquisa de satisfação dos clientes</p>
      </div>

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
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-3">
            {KANBAN_COLUMNS.map(col => {
              const items = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
                        {items.length}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum atendimento</p>
                    ) : (
                      items.map(a => (
                        <NpsCard key={a.id} atendimento={a} onRefresh={fetchAtendimentos} />
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

export default NpsTab;
