import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, ShoppingCart } from 'lucide-react';
import { POS_COMPRA_COLUMNS } from '@/types/crm';
import type { PosCompraStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import AvaliacaoProcessDetail from '@/components/shared/AvaliacaoProcessDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';

const PosCompraTab = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`*, atendimentos!inner(id, nome_cliente, telefone, loja), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, observacoes)`)
      .eq('tipo_aquisicao', 'propria')
      .order('updated_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar pós-compra'); } else {
      let mapped = (data || []).map((d: any) => ({ ...d, atendimento: d.atendimentos, moto: d.motos_avaliacao }));
      if (search.trim()) { const s = search.trim().toLowerCase(); mapped = mapped.filter((a: any) => [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto?.marca, a.moto?.modelo, a.moto?.placa].some(f => f && String(f).toLowerCase().includes(s))); }
      setItems(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const getColumnItems = (status: PosCompraStatus) => items.filter((a: any) => (a.pos_compra_status || 'em_aberto') === status);

  if (selectedItem) return <AvaliacaoProcessDetail item={selectedItem} entityType="pos_compra" statusColumns={POS_COMPRA_COLUMNS} statusField="pos_compra_status" title="Pós-Compra" onClose={() => setSelectedItem(null)} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><ShoppingCart className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Pós-Compra</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos adquiridas próprias</p>
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
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-4">
            {POS_COMPRA_COLUMNS.map(col => {
              const colItems = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[300px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => (
                      <ProcessCard key={a.id} clientName={a.atendimento?.nome_cliente || 'N/A'} phone={a.atendimento?.telefone}
                        motoLabel={a.moto ? [a.moto.placa?.replace(/-/g, ''), `${a.moto.marca} ${(a.moto.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined}
                        loja={a.atendimento?.loja} date={a.updated_at} statusColor={col.hex} onClick={() => setSelectedItem(a)} />
                    ))}
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

export default PosCompraTab;
