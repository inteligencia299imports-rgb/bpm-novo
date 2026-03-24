import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, ShoppingBag } from 'lucide-react';
import { POS_VENDA_COLUMNS } from '@/types/crm';
import type { PosVendaStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import PosVendaDetail from './PosVendaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';

const PosVendaTab = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    // Fetch atendimentos and all estoque for vendidos in parallel
    const [atRes, estRes] = await Promise.all([
      supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').eq('situacao', 'vendido').order('updated_at', { ascending: false }),
      supabase.from('estoque').select('atendimento_venda_id, marca, modelo, placa').eq('tipo', 'propria'),
    ]);

    if (atRes.error) { toast.error('Erro ao carregar pós-venda'); setLoading(false); return; }

    const estoqueMap: Record<string, any> = {};
    (estRes.data || []).forEach((e: any) => { estoqueMap[e.atendimento_venda_id] = e; });

    let filtered = (atRes.data || []).filter(a => estoqueMap[a.id]).map(a => ({ ...a, _estoqueMoto: estoqueMap[a.id] }));

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((a: any) => [a.nome_cliente, a.telefone, a.loja].some(f => f && String(f).toLowerCase().includes(s)));
    }
    setItems(filtered);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const getColumnItems = (status: PosVendaStatus) => items.filter((a: any) => (a.pos_venda_status || 'em_aberto') === status);

  const handleStatusChanged = useCallback((itemId: string, newStatus: string, field: string) => {
    setItems(prev => prev.map(a => a.id === itemId ? { ...a, [field]: newStatus } : a));
    setSelectedItem((prev: any) => prev && prev.id === itemId ? { ...prev, [field]: newStatus } : prev);
  }, []);

  if (selectedItem) return <PosVendaDetail item={selectedItem} onClose={() => setSelectedItem(null)} onStatusChanged={handleStatusChanged} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><ShoppingBag className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Pós-Venda</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos vendidas próprias</p>
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
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-3">
            {POS_VENDA_COLUMNS.map(col => {
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
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => {
                      const est = a._estoqueMoto;
                      return (
                        <ProcessCard key={a.id} clientName={a.nome_cliente} phone={a.telefone}
                          motoLabel={est ? [est.placa?.replace(/-/g, ''), `${est.marca} ${(est.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined}
                          loja={a.loja} date={a.updated_at} statusColor={col.hex} onClick={() => setSelectedItem(a)} />
                      );
                    })}
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

export default PosVendaTab;
