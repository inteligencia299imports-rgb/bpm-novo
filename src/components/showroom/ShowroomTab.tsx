import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Filter, CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LOJAS, INTERESSES, SITUACOES_SHOWROOM } from '@/types/crm';
import type { Atendimento, SituacaoShowroom } from '@/types/crm';
import AtendimentoCard from './AtendimentoCard';
import AtendimentoDetail from './AtendimentoDetail';
import AtendimentoForm from './AtendimentoForm';
import { toast } from 'sonner';

const KANBAN_COLUMNS = SITUACOES_SHOWROOM;

const ShowroomTab = () => {
  const { user, role } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAtendimento, setSelectedAtendimento] = useState<Atendimento | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLoja, setFilterLoja] = useState('todas');
  const [filterInteresse, setFilterInteresse] = useState('todos');
  const [showFilters, setShowFilters] = useState(false);

  const fetchAtendimentos = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').order('created_at', { ascending: false });

    if (filterLoja !== 'todas') query = query.eq('loja', filterLoja);
    if (filterInteresse !== 'todos') query = query.eq('interesse', filterInteresse);
    if (search.trim()) {
      query = query.or(`nome_cliente.ilike.%${search}%,telefone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar atendimentos');
      console.error(error);
    } else {
      setAtendimentos((data as unknown as Atendimento[]) || []);
    }
    setLoading(false);
  }, [filterLoja, filterInteresse, search]);

  useEffect(() => { fetchAtendimentos(); }, [fetchAtendimentos]);

  const handleEdit = (id: string) => {
    setDetailOpen(false);
    setSelectedAtendimento(null);
    setEditingId(id);
    setShowForm(true);
  };

  const handleCardClick = (atendimento: Atendimento) => {
    setSelectedAtendimento(atendimento);
    setDetailOpen(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
    fetchAtendimentos();
  };

  const handleDeleted = () => {
    setDetailOpen(false);
    setSelectedAtendimento(null);
    fetchAtendimentos();
  };

  if (detailOpen && selectedAtendimento) {
    return (
      <AtendimentoDetail
        atendimento={selectedAtendimento}
        onClose={() => { setDetailOpen(false); setSelectedAtendimento(null); }}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
      />
    );
  }

  if (showForm) {
    return <AtendimentoForm atendimentoId={editingId} onClose={handleFormClose} />;
  }

  const getColumnAtendimentos = (situacao: SituacaoShowroom) =>
    atendimentos.filter(a => a.situacao === situacao);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Showroom</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline de atendimentos</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-primary hover:bg-primary-dark text-primary-foreground shadow-soft">
          <Plus className="h-4 w-4" /> Novo Atendimento
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2 border-border text-foreground hover:bg-surface-hover">
          <Filter className="h-4 w-4" /> Filtros
        </Button>
      </div>

      {showFilters && (
        <Card className="animate-fade-in border-border shadow-soft">
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select value={filterLoja} onValueChange={setFilterLoja}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as lojas</SelectItem>
                {LOJAS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterInteresse} onValueChange={setFilterInteresse}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Interesse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {INTERESSES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-4 min-w-max">
            {KANBAN_COLUMNS.map(col => {
              const items = getColumnAtendimentos(col.value);
              return (
                <div key={col.value} className="w-[280px] shrink-0 flex flex-col">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {/* Column body */}
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhum atendimento</p>
                    ) : (
                      items.map(a => (
                        <AtendimentoCard
                          key={a.id}
                          atendimento={a}
                          onClick={() => handleCardClick(a)}
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

export default ShowroomTab;
