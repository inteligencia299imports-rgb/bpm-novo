import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Filter, CalendarIcon, X, Bike } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LOJAS, INTERESSES, SITUACOES_SHOWROOM } from '@/types/crm';
import type { Atendimento, SituacaoShowroom } from '@/types/crm';
import AtendimentoCard from './AtendimentoCard';
import AtendimentoDetail from './AtendimentoDetail';
import AtendimentoForm from './AtendimentoForm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';

const KANBAN_COLUMNS = SITUACOES_SHOWROOM;

interface ShowroomTabProps {
  initialAtendimentoId?: string | null;
  onInitialAtendimentoHandled?: () => void;
}

const ShowroomTab = ({ initialAtendimentoId, onInitialAtendimentoHandled }: ShowroomTabProps = {}) => {
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
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [vendedores, setVendedores] = useState<{ user_id: string; nome: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFromRaw] = useState<Date | undefined>(undefined);
  const [dateTo, setDateToRaw] = useState<Date | undefined>(undefined);

  const setDateFrom = (d: Date | undefined) => {
    if (d) { d.setHours(0, 0, 0, 0); }
    setDateFromRaw(d);
  };
  const setDateTo = (d: Date | undefined) => {
    if (d) { d.setHours(23, 59, 59, 999); }
    setDateToRaw(d);
  };

  useEffect(() => {
    supabase.from('user_roles').select('user_id, nome').order('nome').then(({ data }) => {
      if (data) setVendedores(data);
    });
  }, []);

  // Open detail from external navigation (e.g. NPS, Estoque)
  useEffect(() => {
    if (initialAtendimentoId) {
      supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').eq('id', initialAtendimentoId).single().then(({ data }) => {
        if (data) {
          setSelectedAtendimento(data as unknown as Atendimento);
          setDetailOpen(true);
        }
      });
      onInitialAtendimentoHandled?.();
    }
  }, [initialAtendimentoId]);

  const fetchAtendimentos = useCallback(async () => {
    setLoading(true);

    const PER_STATUS_LIMIT = 50;
    const isSearching = search.trim().length > 0;
    const statuses = KANBAN_COLUMNS.map(c => c.value);

    const buildQuery = (status?: string) => {
      let q = supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)');
      if (status) q = q.eq('situacao', status);
      q = q.order('created_at', { ascending: false });
      if (!isSearching && status) q = q.limit(PER_STATUS_LIMIT);
      if (filterLoja === 'Ducati') q = q.in('loja', ['Ducati BSB', 'Ducati FLN', 'Ducati POA']);
      else if (filterLoja === '299') q = q.in('loja', ['299i', '299s', '299f', '299p', 'Aventura']);
      // Vendedores sempre veem apenas seus próprios atendimentos
      if (role === 'vendedor') {
        q = q.eq('vendedor_id', user!.id);
      } else if (filterVendedor !== 'todos') {
        q = q.eq('vendedor_id', filterVendedor);
      }
      if (dateFrom) q = q.gte('created_at', dateFrom.toISOString());
      if (dateTo) q = q.lte('created_at', dateTo.toISOString());
      return q;
    };

    let data: any[];
    let error: any;
    if (isSearching) {
      const result = await buildQuery();
      error = result.error;
      data = result.data || [];
    } else {
      const results = await Promise.all(statuses.map(s => buildQuery(s)));
      error = results.find(r => r.error)?.error;
      data = results.flatMap(r => r.data || []);
    }
    if (error) {
      toast.error('Erro ao carregar atendimentos');
      console.error(error);
    } else {
      let results = (data as unknown as Atendimento[]) || [];

      // Fetch estoque data for motos_interesse with estoque origin
      const estoqueIds = results.flatMap((a: any) =>
        (a.motos_interesse || [])
          .filter((m: any) => m.origem === 'estoque' && m.estoque_moto_id)
          .map((m: any) => m.estoque_moto_id)
      ).filter(Boolean);

      if (estoqueIds.length > 0) {
        const { data: estoqueData } = await supabase
          .from('estoque')
          .select('id, modelo, marca, cor, placa, preco, preco_acao, status, observacoes')
          .in('id', [...new Set(estoqueIds)]);
        if (estoqueData) {
          const estoqueMap: Record<string, any> = {};
          for (const e of estoqueData) estoqueMap[e.id] = e;
          for (const a of results as any[]) {
            for (const mi of (a.motos_interesse || [])) {
              if (mi.estoque_moto_id && estoqueMap[mi.estoque_moto_id]) {
                mi._estoque = estoqueMap[mi.estoque_moto_id];
              }
            }
          }
        }
      }

      // Fetch avaliacoes to check for adquirida status
      const atendimentoIds = results.map(a => a.id);
      let adquiridaSet = new Set<string>();
      if (atendimentoIds.length > 0) {
        const { data: avalData } = await supabase
          .from('avaliacoes')
          .select('atendimento_id, situacao')
          .in('atendimento_id', atendimentoIds);
        if (avalData) {
          const avalMap: Record<string, string[]> = {};
          for (const av of avalData) {
            const atId = (av as any).atendimento_id;
            if (!avalMap[atId]) avalMap[atId] = [];
            avalMap[atId].push((av as any).situacao);
          }
          for (const [atId, situacoes] of Object.entries(avalMap)) {
            if (situacoes.length > 0 && situacoes.every(s => ['adquirida', 'estoque'].includes(s))) {
              adquiridaSet.add(atId);
            }
          }
        }
      }

      // Filter out atendimentos with interesse 'vender' where all motos were acquired
      results = results.filter(a => !(a.interesse === 'vender' && adquiridaSet.has(a.id)));

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        results = results.filter(a => {
          const fields = [
            a.nome_cliente, a.telefone, a.loja, a.interesse, a.situacao,
            a.observacoes, a.origem, a.temperatura, a.tipo_atendimento, a.uf
          ];
          const motos = (a as any).motos_interesse || [];
          const motosAv = (a as any).motos_avaliacao || [];
          const motoFields = motos.flatMap((m: any) => [m.modelo, m.marca, m.ano, m._estoque?.modelo, m._estoque?.marca]);
          const motoAvFields = motosAv.flatMap((m: any) => [m.modelo, m.marca, m.placa, m.cor, m.ano_fabricacao, m.ano_modelo, m.km]);
          const all = [...fields, ...motoFields, ...motoAvFields];
          return all.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setAtendimentos(results);
    }
    setLoading(false);
  }, [filterLoja, filterInteresse, filterVendedor, search, dateFrom, dateTo]);

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

  const handleStatusUpdated = async () => {
    await fetchAtendimentos();
    if (selectedAtendimento) {
      const { data } = await supabase
        .from('atendimentos')
        .select('*')
        .eq('id', selectedAtendimento.id)
        .single();
      if (data) {
        setSelectedAtendimento(data as Atendimento);
      }
    }
  };

  const handleStatusChange = async (id: string, status: SituacaoShowroom) => {
    const { error } = await supabase.from('atendimentos').update({ situacao: status }).eq('id', id);
    if (error) {
      toast.error('Erro ao alterar status');
      console.error(error);
    } else {
      toast.success(`Status alterado para ${SITUACOES_SHOWROOM.find(s => s.value === status)?.label}`);
      fetchAtendimentos();
    }
  };

  if (detailOpen && selectedAtendimento) {
    return (
      <AtendimentoDetail
        atendimento={selectedAtendimento}
        onClose={() => { setDetailOpen(false); setSelectedAtendimento(null); }}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
        onStatusUpdated={handleStatusUpdated}
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
          <div className="flex items-center gap-2">
            <Bike className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Showroom</h1>
          </div>
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
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={filterLoja} onValueChange={setFilterLoja}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as lojas</SelectItem>
                <SelectItem value="299">299</SelectItem>
                <SelectItem value="Ducati">Ducati</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterInteresse} onValueChange={setFilterInteresse}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Interesse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {INTERESSES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map(v => <SelectItem key={v.user_id} value={v.user_id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal bg-card border-border", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "Data início"}
                  {dateFrom && (
                    <X className="ml-auto h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setDateFrom(undefined); }} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {/* Date To */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal bg-card border-border", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Data fim"}
                  {dateTo && (
                    <X className="ml-auto h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setDateTo(undefined); }} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  locale={ptBR}
                  disabled={(date) => dateFrom ? date < dateFrom : false}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            </div>
            {(filterLoja !== 'todas' || filterInteresse !== 'todos' || filterVendedor !== 'todos' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setFilterLoja('todas'); setFilterInteresse('todos'); setFilterVendedor('todos'); setDateFrom(undefined); setDateTo(undefined); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      {loading ? (
        <KanbanSkeleton columns={5} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-5">
            {KANBAN_COLUMNS.map(col => {
              const items = getColumnAtendimentos(col.value);
              return (
                <div key={col.value} className="w-[280px] shrink-0 md:w-auto md:shrink flex flex-col">
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
