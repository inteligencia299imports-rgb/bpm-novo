import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Handshake } from 'lucide-react';
import { POS_VENDA_COLUMNS } from '@/types/crm';
import type { PosVendaStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import ProcessDetailSheet, { ProcessDetailData } from '@/components/shared/ProcessDetailSheet';
import { toast } from 'sonner';

const IntermediacacaoTab = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ProcessDetailData | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*, motos_interesse(*), motos_avaliacao(*)')
      .eq('situacao', 'vendido')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar intermediação');
      console.error(error);
      setLoading(false);
      return;
    }

    const atIds = (data || []).map(a => a.id);
    let filtered = data || [];

    if (atIds.length > 0) {
      const { data: estoqueData } = await supabase
        .from('estoque')
        .select('atendimento_venda_id')
        .eq('tipo', 'consignada')
        .in('atendimento_venda_id', atIds);

      const validIds = new Set((estoqueData || []).map((e: any) => e.atendimento_venda_id));
      filtered = filtered.filter(a => validIds.has(a.id));
    }

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((a: any) => {
        const fields = [a.nome_cliente, a.telefone, a.loja];
        return fields.some(f => f && String(f).toLowerCase().includes(s));
      });
    }

    setItems(filtered);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const getColumnItems = (status: PosVendaStatus) => items.filter((a: any) => (a.pos_venda_status || 'em_aberto') === status);

  const openDetail = (a: any, col: typeof POS_VENDA_COLUMNS[number]) => {
    const moto = a.motos_avaliacao?.[0];
    setSelectedItem({
      clientName: a.nome_cliente,
      phone: a.telefone,
      loja: a.loja,
      date: a.updated_at,
      statusLabel: col.label,
      statusColor: col.hex,
      motoMarca: moto?.marca,
      motoModelo: moto?.modelo,
      motoPlaca: moto?.placa,
      motoCor: moto?.cor,
      motoAno: [moto?.ano_fabricacao, moto?.ano_modelo].filter(Boolean).join('/'),
      motoKm: moto?.km,
      observacoes: a.observacoes,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Handshake className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Intermediação</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos vendidas consignadas</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
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
                    {colItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p>
                    ) : (
                      colItems.map((a: any) => {
                        const moto = a.motos_avaliacao?.[0];
                        const motoLabel = moto ? [moto.placa, `${moto.marca} ${moto.modelo}`].filter(Boolean).join(' - ') : undefined;
                        return (
                          <ProcessCard
                            key={a.id}
                            clientName={a.nome_cliente}
                            phone={a.telefone}
                            motoLabel={motoLabel}
                            loja={a.loja}
                            date={a.updated_at}
                            statusColor={col.hex}
                            onClick={() => openDetail(a, col)}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ProcessDetailSheet open={!!selectedItem} onClose={() => setSelectedItem(null)} data={selectedItem} title="Intermediação" />
    </div>
  );
};

export default IntermediacacaoTab;
