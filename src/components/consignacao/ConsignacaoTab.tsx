import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, FileText } from 'lucide-react';
import { CONSIGNACAO_COLUMNS } from '@/types/crm';
import type { ConsignacaoStatus } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import ProcessDetailSheet, { ProcessDetailData } from '@/components/shared/ProcessDetailSheet';
import { toast } from 'sonner';

const ConsignacaoTab = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ProcessDetailData | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('avaliacoes')
      .select(`*, atendimentos!inner(id, nome_cliente, telefone, loja), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria)`)
      .eq('tipo_aquisicao', 'consignada')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar consignações');
      console.error(error);
    } else {
      let mapped = (data || []).map((d: any) => ({ ...d, atendimento: d.atendimentos, moto: d.motos_avaliacao }));
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) => {
          const fields = [a.atendimento?.nome_cliente, a.atendimento?.telefone, a.moto?.marca, a.moto?.modelo, a.moto?.placa];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setItems(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const getColumnItems = (status: ConsignacaoStatus) => items.filter((a: any) => (a.consignacao_status || 'em_aberto') === status);

  const openDetail = (a: any, col: typeof CONSIGNACAO_COLUMNS[number]) => {
    setSelectedItem({
      clientName: a.atendimento?.nome_cliente || 'N/A',
      phone: a.atendimento?.telefone,
      loja: a.atendimento?.loja,
      date: a.updated_at,
      statusLabel: col.label,
      statusColor: col.hex,
      motoMarca: a.moto?.marca,
      motoModelo: a.moto?.modelo,
      motoPlaca: a.moto?.placa,
      motoCor: a.moto?.cor,
      motoAno: [a.moto?.ano_fabricacao, a.moto?.ano_modelo].filter(Boolean).join('/'),
      motoKm: a.moto?.km,
      motoCategoria: a.moto?.categoria,
      valorFipe: a.valor_fipe,
      avaliacaoCompra: a.avaliacao_compra,
      avaliacaoConsignacao: a.avaliacao_consignacao,
      quantoPede: a.quanto_pede,
      quantoVende: a.quanto_vende,
      valorFechamento: a.valor_fechamento,
      previsaoCustosLoja: a.previsao_custos_loja,
      previsaoCustosCliente: a.previsao_custos_cliente,
      tipoAquisicao: a.tipo_aquisicao,
      negociacao: a.negociacao,
      observacaoAvaliador: a.observacao_avaliador,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Consignação</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos adquiridas consignadas</p>
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
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-4">
            {CONSIGNACAO_COLUMNS.map(col => {
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
                    {colItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p>
                    ) : (
                      colItems.map((a: any) => (
                        <ProcessCard
                          key={a.id}
                          clientName={a.atendimento?.nome_cliente || 'N/A'}
                          phone={a.atendimento?.telefone}
                          motoLabel={a.moto ? [a.moto.placa, `${a.moto.marca} ${a.moto.modelo}`].filter(Boolean).join(' - ') : undefined}
                          loja={a.atendimento?.loja}
                          date={a.updated_at}
                          statusColor={col.hex}
                          onClick={() => openDetail(a, col)}
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
      <ProcessDetailSheet open={!!selectedItem} onClose={() => setSelectedItem(null)} data={selectedItem} title="Consignação" />
    </div>
  );
};

export default ConsignacaoTab;
