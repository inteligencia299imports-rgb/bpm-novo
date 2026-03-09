import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Filter } from 'lucide-react';
import { LOJAS, INTERESSES, SITUACOES_SHOWROOM } from '@/types/crm';
import type { Atendimento } from '@/types/crm';
import AtendimentoCard from './AtendimentoCard';
import AtendimentoForm from './AtendimentoForm';
import { toast } from 'sonner';

const ShowroomTab = () => {
  const { user, role } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterLoja, setFilterLoja] = useState('todas');
  const [filterInteresse, setFilterInteresse] = useState('todos');
  const [filterSituacao, setFilterSituacao] = useState('todas');
  const [showFilters, setShowFilters] = useState(false);

  const fetchAtendimentos = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('atendimentos').select('*').order('created_at', { ascending: false });

    if (filterLoja !== 'todas') query = query.eq('loja', filterLoja);
    if (filterInteresse !== 'todos') query = query.eq('interesse', filterInteresse);
    if (filterSituacao !== 'todas') query = query.eq('situacao', filterSituacao);
    if (search.trim()) {
      query = query.or(`nome_cliente.ilike.%${search}%,telefone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar atendimentos');
      console.error(error);
    } else {
      setAtendimentos(data || []);
    }
    setLoading(false);
  }, [filterLoja, filterInteresse, filterSituacao, search]);

  useEffect(() => { fetchAtendimentos(); }, [fetchAtendimentos]);

  const handleEdit = (id: string) => {
    setEditingId(id);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
    fetchAtendimentos();
  };

  if (showForm) {
    return <AtendimentoForm atendimentoId={editingId} onClose={handleFormClose} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-bold">Showroom</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Atendimento
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
          <Filter className="h-4 w-4" /> Filtros
        </Button>
      </div>

      {showFilters && (
        <Card className="animate-fade-in">
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={filterLoja} onValueChange={setFilterLoja}>
              <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as lojas</SelectItem>
                {LOJAS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterInteresse} onValueChange={setFilterInteresse}>
              <SelectTrigger><SelectValue placeholder="Interesse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {INTERESSES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSituacao} onValueChange={setFilterSituacao}>
              <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {SITUACOES_SHOWROOM.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : atendimentos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum atendimento encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {atendimentos.map(a => (
            <AtendimentoCard key={a.id} atendimento={a} onEdit={() => handleEdit(a.id)} role={role} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ShowroomTab;
