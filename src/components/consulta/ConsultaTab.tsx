import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, FileSearch } from 'lucide-react';
import ProcessCard from '@/components/shared/ProcessCard';
import ConsultaDetail from './ConsultaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';

const COLUMNS = [
  { value: false, label: 'Pendente', hex: '#da6220' },
  { value: true, label: 'Realizada', hex: '#169d53' },
];

const ConsultaTab = () => {
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMoto, setSelectedMoto] = useState<any | null>(null);

  const fetchMotos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('motos_avaliacao')
      .select('*, atendimentos!inner(id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco), avaliacoes(tipo_aquisicao, situacao)')
      .eq('consulta_solicitada', true)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar consultas');
      console.error(error);
    } else {
      let results = (data || [])
        .filter((d: any) => !d.avaliacoes?.some((av: any) => ['estoque', 'adquirida', 'perdido', 'dispensada'].includes(av.situacao)))
        .map((d: any) => ({
          ...d,
          atendimento: d.atendimentos,
          tipo_aquisicao: d.avaliacoes?.[0]?.tipo_aquisicao || null,
        }));
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        results = results.filter((m: any) => {
          const fields = [m.marca, m.modelo, m.placa, m.cor, m.atendimento?.nome_cliente, m.atendimento?.telefone];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setMotos(results);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchMotos(); }, [fetchMotos]);

  const getColumnMotos = (val: boolean) => motos.filter(m => (m.consulta_realizada ?? false) === val);

  if (selectedMoto) {
    return <ConsultaDetail moto={selectedMoto} onClose={() => setSelectedMoto(null)} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <FileSearch className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Consulta</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Consulta documental de motos avaliadas</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por marca, modelo, placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <KanbanSkeleton columns={2} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-2">
            {COLUMNS.map(col => {
              const items = getColumnMotos(col.value);
              return (
                <div key={String(col.value)} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{items.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma moto</p>
                    ) : (
                      items.map(m => (
                        <ProcessCard
                          key={m.id}
                          clientName={m.atendimento?.nome_cliente || 'N/A'}
                          phone={m.atendimento?.telefone}
                          motoLabel={[m.placa?.replace(/-/g, ''), `${m.marca} ${(m.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ')}
                          loja={m.atendimento?.loja}
                          date={m.created_at}
                          statusColor={col.hex}
                          extraBadge={m.tipo_aquisicao ? { label: m.tipo_aquisicao === 'consignada' ? 'Consignada' : m.tipo_aquisicao === 'convertida' ? 'Convertida' : 'Própria', className: m.tipo_aquisicao === 'consignada' ? 'border-purple-500 text-purple-600' : m.tipo_aquisicao === 'convertida' ? 'border-blue-800 text-blue-800' : 'border-green-500 text-green-600' } : undefined}
                          onClick={() => setSelectedMoto(m)}
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

export default ConsultaTab;
