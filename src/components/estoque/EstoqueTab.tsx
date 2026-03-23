import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Bike, X, ShoppingCart, FileText, ClipboardList, Handshake, ArrowDownToLine, BookOpen, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface EstoqueItem {
  id: string;
  tipo: string;
  marca: string;
  categoria: string | null;
  modelo: string;
  cor: string | null;
  cilindrada: string | null;
  placa: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  km: string | null;
  preco: number | null;
  preco_acao: number | null;
  empresa: string | null;
  status: string;
  observacoes: string | null;
  data_entrada: string;
  created_at: string;
  atendimento_venda_id: string | null;
  avaliacao_id: string | null;
  moto_avaliacao_id: string | null;
}

interface EstoqueTabProps {
  onNavigate?: (tab: string) => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  disponivel: { label: 'Disponível', color: 'bg-success/15 text-success' },
  reservada: { label: 'Reservada', color: 'bg-warning/15 text-warning' },
  vendido: { label: 'Vendida', color: 'bg-muted text-muted-foreground' },
};

const formatCurrency = (value: number | null) => {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const EstoqueTab = ({ onNavigate }: EstoqueTabProps) => {
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarca, setFilterMarca] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('disponivel');
  const [filterEmpresa, setFilterEmpresa] = useState('todas');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [allMarcas, setAllMarcas] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<EstoqueItem | null>(null);
  const [vendaAtendimento, setVendaAtendimento] = useState<any>(null);

  useEffect(() => {
    let query = supabase.from('estoque').select('marca');
    if (filterStatus !== 'todos') query = query.eq('status', filterStatus);
    if (filterTipo !== 'todos') query = query.eq('tipo', filterTipo);
    if (filterEmpresa !== 'todas') query = query.eq('empresa', filterEmpresa);
    query.then(({ data }) => {
      const unique = [...new Set((data || []).map(d => d.marca))].sort();
      setAllMarcas(unique);
    });
  }, [filterStatus, filterTipo, filterEmpresa]);

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('estoque').select('*').order('data_entrada', { ascending: false });

      if (filterStatus !== 'todos') {
        query = query.eq('status', filterStatus);
      }
      if (filterMarca !== 'todas') {
        query = query.eq('marca', filterMarca);
      }
      if (filterTipo !== 'todos') {
        query = query.eq('tipo', filterTipo);
      }
      if (filterEmpresa !== 'todas') {
        query = query.eq('empresa', filterEmpresa);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar estoque');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMarca, filterTipo, filterEmpresa]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  // Fetch venda atendimento details when an item is selected
  useEffect(() => {
    if (!selectedItem?.atendimento_venda_id) {
      setVendaAtendimento(null);
      return;
    }
    supabase
      .from('atendimentos')
      .select('id, interesse, situacao, tipo_atendimento, pos_venda_status, intermediacao_parte1_status, intermediacao_parte2_status')
      .eq('id', selectedItem.atendimento_venda_id)
      .maybeSingle()
      .then(({ data }) => setVendaAtendimento(data));
  }, [selectedItem?.atendimento_venda_id]);

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [item.marca, item.modelo, item.placa, item.cor, item.cilindrada, item.empresa, item.observacoes]
      .some(v => v?.toLowerCase().includes(s));
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterMarca, filterTipo, filterStatus]);

  const getNavigationOptions = (item: EstoqueItem) => {
    const options: { label: string; icon: React.ReactNode; tab: string }[] = [];

    // Showroom (atendimento de venda) - when sold or reserved (sinal)
    if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'reservada')) {
      options.push({
        label: item.status === 'vendido' ? 'Atendimento (Venda)' : 'Atendimento (Sinal)',
        icon: <ShoppingCart className="h-4 w-4" />,
        tab: 'showroom',
      });
    }

    // Pós-Venda - when sold with own stock (propria)
    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'propria') {
      options.push({
        label: 'Pós-Venda',
        icon: <ClipboardList className="h-4 w-4" />,
        tab: 'pos_venda',
      });
    }

    // Intermediação - when sold with consigned stock
    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'consignada') {
      options.push({
        label: 'Intermediação',
        icon: <Handshake className="h-4 w-4" />,
        tab: 'intermediacao',
      });
    }

    // Pós-Compra - when has avaliacao (acquired bike)
    if (item.avaliacao_id) {
      options.push({
        label: 'Pós-Compra',
        icon: <ArrowDownToLine className="h-4 w-4" />,
        tab: 'pos_compra',
      });
    }

    // Consignação - when consigned type and has avaliacao
    if (item.avaliacao_id && item.tipo === 'consignada') {
      options.push({
        label: 'Consignação',
        icon: <BookOpen className="h-4 w-4" />,
        tab: 'consignacao',
      });
    }

    // Preparação - when has avaliacao
    if (item.avaliacao_id) {
      options.push({
        label: 'Preparação',
        icon: <Wrench className="h-4 w-4" />,
        tab: 'preparacao',
      });
    }

    return options;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
          <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por marca, modelo, placa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="reservada">Reservada</SelectItem>
                  <SelectItem value="vendido">Vendida</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMarca} onValueChange={setFilterMarca}>
                <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as marcas</SelectItem>
                  {allMarcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="propria">Própria</SelectItem>
                  <SelectItem value="consignada">Consignada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as empresas</SelectItem>
                  <SelectItem value="FAG">FAG</SelectItem>
                  <SelectItem value="MMATOS">MMATOS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(filterStatus !== 'disponivel' || filterMarca !== 'todas' || filterTipo !== 'todos' || filterEmpresa !== 'todas') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setFilterStatus('disponivel'); setFilterMarca('todas'); setFilterTipo('todos'); setFilterEmpresa('todas'); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <KanbanSkeleton columns={3} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bike className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma moto encontrada no estoque.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(
            paginated.reduce<Record<string, EstoqueItem[]>>((acc, item) => {
              (acc[item.marca] = acc[item.marca] || []).push(item);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([marca, motos]) => (
              <div key={marca}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-foreground">{marca}</h2>
                  <Badge variant="outline" className="text-xs">{motos.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {motos.map(item => {
                    const navOptions = getNavigationOptions(item);
                    const hasOptions = navOptions.length > 0;

                    const cardContent = (
                      <Card className={`transition-shadow ${hasOptions ? 'hover:shadow-md cursor-pointer' : ''}`}>
                        <CardContent className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-foreground">{item.modelo}</p>
                              <p className="text-xs text-muted-foreground">
                                {[item.ano_fabricacao, item.ano_modelo].filter(Boolean).join('/')}
                                {item.cilindrada ? ` · ${item.cilindrada}cc` : ''}
                              </p>
                            </div>
                            <Badge className={STATUS_MAP[item.status]?.color || 'bg-muted text-muted-foreground'}>
                              {STATUS_MAP[item.status]?.label || item.status}
                            </Badge>
                          </div>

                          {/* Details */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {item.placa && (
                              <>
                                <span className="text-muted-foreground">Placa</span>
                                <span className="font-medium text-foreground">{item.placa.replace(/-/g, '')}</span>
                              </>
                            )}
                            {item.cor && (
                              <>
                                <span className="text-muted-foreground">Cor</span>
                                <span className="text-foreground">{item.cor}</span>
                              </>
                            )}
                            {item.categoria && (
                              <>
                                <span className="text-muted-foreground">Categoria</span>
                                <span className="text-foreground">{item.categoria}</span>
                              </>
                            )}
                            {item.km && (
                              <>
                                <span className="text-muted-foreground">KM</span>
                                <span className="text-foreground">{item.km}</span>
                              </>
                            )}
                            <span className="text-muted-foreground">Tipo</span>
                            <span className="text-foreground capitalize">{item.tipo === 'propria' ? 'Própria' : 'Consignada'}</span>
                            {item.empresa && (
                              <>
                                <span className="text-muted-foreground">Empresa</span>
                                <span className="text-foreground">{item.empresa}</span>
                              </>
                            )}
                          </div>

                          {/* Price */}
                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <div>
                              <p className="text-xs text-muted-foreground">Preço</p>
                              <p className="font-semibold text-foreground">{formatCurrency(item.preco)}</p>
                            </div>
                            {item.preco_acao != null && (
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Preço Ação</p>
                                <p className="font-semibold text-success">{formatCurrency(item.preco_acao)}</p>
                              </div>
                            )}
                          </div>

                          {item.observacoes && (
                            <p className="text-xs text-muted-foreground italic line-clamp-2">{item.observacoes}</p>
                          )}
                        </CardContent>
                      </Card>
                    );

                    if (!hasOptions) return <div key={item.id}>{cardContent}</div>;

                    return (
                      <Popover key={item.id}>
                        <PopoverTrigger asChild>
                          {cardContent}
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="center">
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Acessar</p>
                          <div className="flex flex-col gap-0.5">
                            {navOptions.map(opt => (
                              <Button
                                key={opt.tab}
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2 h-9 text-sm"
                                onClick={() => onNavigate?.(opt.tab)}
                              >
                                {opt.icon}
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
};

export default EstoqueTab;
