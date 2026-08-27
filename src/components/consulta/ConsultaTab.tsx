import React, { useState, useEffect, useCallback } from 'react';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { supabase } from '@/lib/supabase';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Input } from '@/components/ui/input';
import { Search, X, FileSearch } from 'lucide-react';
import ProcessCard from '@/components/shared/ProcessCard';
import ConsultaDetail from './ConsultaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';

const PENDING_COLOR = '#da6220';

const ConsultaTab = () => {
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMoto, setSelectedMoto] = useState<any | null>(null);

  const fetchMotos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchAllRange(() =>
      supabase
        .from('avaliacoes')
        .select('*, atendimentos_motos!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro)))')
        .eq('consulta_solicitada', true)
        .order('created_at', { ascending: false })
    );

    if (error) {
      toast.error('Erro ao carregar consultas');
      console.error(error);
    } else {
      let results = (data || [])
        .map((d: any) => ({
          ...d,
          atendimento: { ...d.atendimentos_motos, loja: d.atendimentos_motos?.loja_empresas?.loja },
        }));
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        results = results.filter((m: any) => {
          const fields = [m.marca, m.modelo, m.placa, m.cor, m.atendimento?.cliente?.nome_razao_social, m.atendimento?.cliente?.telefone];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setMotos(results);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchMotos(); }, [fetchMotos]);

  const pendingMotos = motos.filter(m => !(m.consulta_realizada ?? false));

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
        <KanbanSkeleton columns={1} />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PENDING_COLOR }} />
              <span className="text-sm font-semibold text-foreground">Pendente</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{pendingMotos.length}</span>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 min-h-[200px] space-y-2.5 border border-border/50">
            {pendingMotos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhuma consulta pendente</p>
            ) : (
              pendingMotos.map(m => (
                <ProcessCard
                  key={m.id}
                  clientName={m.atendimento?.cliente?.nome_razao_social || 'N/A'}
                  phone={m.atendimento?.cliente?.telefone}
                  motoLabel={[m.placa?.replace(/-/g, ''), `${m.marca} ${(m.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ')}
                  loja={m.atendimento?.loja}
                  date={m.created_at}
                  statusColor={PENDING_COLOR}
                  extraBadge={m.tipo_aquisicao ? { label: getTipoAquisicaoLabel(m.tipo_aquisicao) || '', className: getTipoAquisicaoBadgeClass(m.tipo_aquisicao) } : undefined}
                  onClick={() => setSelectedMoto(m)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsultaTab;
