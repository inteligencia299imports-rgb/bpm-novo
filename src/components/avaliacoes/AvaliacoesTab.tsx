import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { Avaliacao } from '@/types/crm';
import AvaliacaoCard from './AvaliacaoCard';
import AvaliacaoForm from './AvaliacaoForm';
import { toast } from 'sonner';

const AvaliacoesTab = () => {
  const { role } = useAuth();
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSituacao, setFilterSituacao] = useState('todas');
  const [showFilters, setShowFilters] = useState(false);

  const fetchAvaliacoes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos!inner (id, nome_cliente, telefone, loja, vendedor_id, interesse),
        motos_avaliacao!inner (id, marca, modelo, ano_fabricacao, ano_modelo, placa, km, cor, categoria)
      `)
      .order('created_at', { ascending: false });

    if (filterSituacao !== 'todas') query = query.eq('situacao', filterSituacao);

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar avaliações');
      console.error(error);
    } else {
      const mapped = (data || []).map((d: any) => ({
        ...d,
        atendimento: d.atendimentos,
        moto_avaliacao: d.motos_avaliacao,
      }));
      // client-side search
      const filtered = search.trim()
        ? mapped.filter((a: any) =>
          a.atendimento?.nome_cliente?.toLowerCase().includes(search.toLowerCase()) ||
          a.moto_avaliacao?.marca?.toLowerCase().includes(search.toLowerCase()) ||
          a.moto_avaliacao?.modelo?.toLowerCase().includes(search.toLowerCase()) ||
          a.moto_avaliacao?.placa?.toLowerCase().includes(search.toLowerCase())
        )
        : mapped;
      setAvaliacoes(filtered);
    }
    setLoading(false);
  }, [filterSituacao, search]);

  useEffect(() => { fetchAvaliacoes(); }, [fetchAvaliacoes]);

  const handleClose = () => {
    setSelectedId(null);
    fetchAvaliacoes();
  };

  if (selectedId) {
    return <AvaliacaoForm avaliacaoId={selectedId} onClose={handleClose} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Avaliações</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, marca, modelo ou placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
          <Filter className="h-4 w-4" /> Filtros
        </Button>
      </div>

      {showFilters && (
        <Card className="animate-fade-in">
          <CardContent className="pt-4">
            <Select value={filterSituacao} onValueChange={setFilterSituacao}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {SITUACOES_AVALIACAO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : avaliacoes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma avaliação encontrada</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {avaliacoes.map(a => (
            <AvaliacaoCard key={a.id} avaliacao={a} onOpen={() => setSelectedId(a.id)} role={role} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AvaliacoesTab;
