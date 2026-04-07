import React, { useState, useEffect, useCallback } from 'react';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Bike, X, ShoppingCart, ShoppingBag, Handshake, ClipboardCheck, FileText, Wrench, Calendar, User, AlertTriangle, ShieldAlert, RefreshCw, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';
import StatusChangeDialog from '@/components/estoque/StatusChangeDialog';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type EstoqueNavTarget =
  | { tab: 'showroom'; atendimentoId: string }
  | { tab: 'avaliacoes'; avaliacaoId: string }
  | { tab: 'pos_venda'; atendimentoId: string }
  | { tab: 'intermediacao'; atendimentoId: string; parte?: 'parte1' | 'parte2' }
  | { tab: 'pos_compra'; avaliacaoId: string }
  | { tab: 'consignacao'; avaliacaoId: string }
  | { tab: 'preparacao'; avaliacaoId: string };

interface EstoqueTabProps {
  onNavigateToTab?: (target: EstoqueNavTarget) => void;
}

// Configs
import {
  POS_VENDA_COLUMNS,
  POS_COMPRA_COLUMNS,
  CONSIGNACAO_COLUMNS,
} from '@/types/crm';

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
  // From motos_avaliacao join
  tem_manual?: boolean | null;
  tem_chave_reserva?: boolean | null;
  manutencao_vencida?: boolean | null;
  classificacao?: string | null;
  data_venda?: string | null;
  valor_venda?: number | null;
  valor_sinal?: number | null;
  vendedor_nome?: string | null;
  // From atendimentos join (for ownership check)
  venda_vendedor_id?: string | null;
}

// Navigation target type removed - using EstoqueNavTarget from props

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  disponivel: { label: 'Disponível', color: 'bg-success/15 text-success' },
  sinal: { label: 'Sinal', color: 'bg-[#b734db]/15 text-[#b734db]' },
  vendido: { label: 'Vendida', color: 'bg-muted text-muted-foreground' },
  indisponivel: { label: 'Serviço', color: 'bg-orange-500/15 text-orange-600' },
  indisponivel_manual: { label: 'Indisponível', color: 'bg-destructive/15 text-destructive' },
  bloqueio_juridico: { label: 'Bloqueio Jurídico', color: 'bg-muted text-muted-foreground' },
};

const formatCurrency = (value: number | null) => {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const EstoqueTab = ({ onNavigateToTab }: EstoqueTabProps = {}) => {
  const { role, user } = useAuth();
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarca, setFilterMarca] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('disponivel');
  const [filterEmpresa, setFilterEmpresa] = useState('todas');
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [allMarcas, setAllMarcas] = useState<string[]>([]);
  const [reenviarItem, setReenviarItem] = useState<EstoqueItem | null>(null);
  const [reenviarAvaliacaoData, setReenviarAvaliacaoData] = useState<any>(null);
  const [reenviarLoading, setReenviarLoading] = useState(false);
  const [idsWithHistory, setIdsWithHistory] = useState<Set<string>>(new Set());
  const [statusChangeItem, setStatusChangeItem] = useState<EstoqueItem | null>(null);
  const [historyItem, setHistoryItem] = useState<EstoqueItem | null>(null);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleOpenHistory = async (item: EstoqueItem) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('status_history')
        .select('*')
        .eq('entity_id', item.id)
        .eq('entity_type', 'estoque')
        .order('created_at', { ascending: false });
      setHistoryEntries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

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
      let query = supabase.from('estoque').select('*, motos_avaliacao(tem_manual, tem_chave_reserva, manutencao_vencida), atendimentos:atendimento_venda_id(vendedor_id)').order('data_entrada', { ascending: false }).limit(200);
      if (filterStatus !== 'todos') query = query.eq('status', filterStatus);
      if (filterMarca !== 'todas') query = query.eq('marca', filterMarca);
      if (filterTipo !== 'todos') query = query.eq('tipo', filterTipo);
      if (filterEmpresa !== 'todas') query = query.eq('empresa', filterEmpresa);
      const { data, error } = await query;
      if (error) throw error;
      // Get vendedor names for items with atendimento_venda_id
      const vendedorIds = [...new Set((data || []).map((d: any) => d.atendimentos?.vendedor_id).filter(Boolean))];
      let vendedorMap: Record<string, string> = {};
      if (vendedorIds.length > 0) {
        const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', vendedorIds);
        if (roles) {
          for (const r of roles) vendedorMap[r.user_id] = r.nome;
        }
      }
      const mapped = (data || []).map((d: any) => ({
        ...d,
        tem_manual: d.motos_avaliacao?.tem_manual ?? null,
        tem_chave_reserva: d.motos_avaliacao?.tem_chave_reserva ?? null,
        manutencao_vencida: d.motos_avaliacao?.manutencao_vencida ?? null,
        venda_vendedor_id: d.atendimentos?.vendedor_id ?? null,
        vendedor_nome: d.atendimentos?.vendedor_id ? (vendedorMap[d.atendimentos.vendedor_id] || null) : null,
      }));
      setItems(mapped);

      // Fetch which items have history
      const estoqueIds = (data || []).map((d: any) => d.id);
      if (estoqueIds.length > 0) {
        const { data: histData } = await supabase
          .from('status_history')
          .select('entity_id')
          .eq('entity_type', 'estoque')
          .in('entity_id', estoqueIds);
        setIdsWithHistory(new Set((histData || []).map((h: any) => h.entity_id)));
      } else {
        setIdsWithHistory(new Set());
      }
    } catch (err: any) {
      toast.error('Erro ao carregar estoque');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMarca, filterTipo, filterEmpresa]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [item.marca, item.modelo, item.placa, item.cor, item.cilindrada, item.empresa, item.observacoes]
      .some(v => v?.toLowerCase().includes(s));
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterMarca, filterTipo, filterStatus]);

  // --- Navigation handlers (delegate to parent tab) ---

  const nav = (target: EstoqueNavTarget) => {
    if (onNavigateToTab) onNavigateToTab(target);
  };

  const handleOpenReenviar = async (item: EstoqueItem) => {
    setReenviarLoading(true);
    try {
      const { data: avaliacao } = await supabase
        .from('avaliacoes')
        .select('*, motos_avaliacao(*), atendimentos:atendimento_id(nome_cliente, loja)')
        .eq('id', item.avaliacao_id!)
        .single();
      if (avaliacao) {
        setReenviarAvaliacaoData({
          ...avaliacao,
          moto: avaliacao.motos_avaliacao,
          atendimento: avaliacao.atendimentos,
          moto_avaliacao_id: avaliacao.moto_avaliacao_id,
        });
      }
      // Only open dialog after data is ready
      setReenviarItem(item);
    } catch (err) {
      console.error(err);
    } finally {
      setReenviarLoading(false);
    }
  };

  const getNavigationOptions = (item: EstoqueItem) => {
    const options: { label: string; icon: React.ReactNode; action: () => void }[] = [];
    const isVendedor = role === 'vendedor';
    const isOwnSale = item.venda_vendedor_id === user?.id;

    // Vendedor: only show "Venda" if sold/reserved AND it's their sale
    if (isVendedor) {
      if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'sinal') && isOwnSale) {
        options.push({
          label: 'Venda',
          icon: <Bike className="h-4 w-4" />,
          action: () => nav({ tab: 'showroom', atendimentoId: item.atendimento_venda_id! }),
        });
      }
      return options;
    }

    if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'sinal')) {
      options.push({
        label: 'Venda',
        icon: <Bike className="h-4 w-4" />,
        action: () => nav({ tab: 'showroom', atendimentoId: item.atendimento_venda_id! }),
      });
    }

    if (item.avaliacao_id) {
      options.push({
        label: 'Avaliação',
        icon: <ClipboardCheck className="h-4 w-4" />,
        action: () => nav({ tab: 'avaliacoes', avaliacaoId: item.avaliacao_id! }),
      });
    }

    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'propria') {
      options.push({
        label: 'Pós-Venda',
        icon: <ShoppingBag className="h-4 w-4" />,
        action: () => nav({ tab: 'pos_venda', atendimentoId: item.atendimento_venda_id! }),
      });
    }

    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'consignada') {
      options.push({
        label: 'Intermediação 1',
        icon: <Handshake className="h-4 w-4" />,
        action: () => nav({ tab: 'intermediacao', atendimentoId: item.atendimento_venda_id!, parte: 'parte1' }),
      });
      options.push({
        label: 'Intermediação 2',
        icon: <Handshake className="h-4 w-4" />,
        action: () => nav({ tab: 'intermediacao', atendimentoId: item.atendimento_venda_id!, parte: 'parte2' }),
      });
    }

    if (item.avaliacao_id && item.tipo === 'propria') {
      options.push({
        label: 'Pós-Compra',
        icon: <ShoppingCart className="h-4 w-4" />,
        action: () => nav({ tab: 'pos_compra', avaliacaoId: item.avaliacao_id! }),
      });
    }

    if (item.avaliacao_id && item.tipo === 'consignada') {
      options.push({
        label: 'Consignação',
        icon: <FileText className="h-4 w-4" />,
        action: () => nav({ tab: 'consignacao', avaliacaoId: item.avaliacao_id! }),
      });
    }

    if (item.avaliacao_id && item.status === 'disponivel') {
      options.push({
        label: 'Preparação',
        icon: <Wrench className="h-4 w-4" />,
        action: () => handleOpenReenviar(item),
      });
    } else if (item.avaliacao_id && item.status === 'indisponivel') {
      options.push({
        label: 'Preparação',
        icon: <Wrench className="h-4 w-4" />,
        action: () => nav({ tab: 'preparacao', avaliacaoId: item.avaliacao_id! }),
      });
    }

    // Option to change status
    if (['disponivel', 'indisponivel_manual', 'bloqueio_juridico'].includes(item.status)) {
      options.push({
        label: 'Alterar Status',
        icon: <RefreshCw className="h-4 w-4" />,
        action: () => setStatusChangeItem(item),
      });
    }

    // History option only if there's history
    if (idsWithHistory.has(item.id)) {
      options.push({
        label: 'Histórico',
        icon: <History className="h-4 w-4" />,
        action: () => handleOpenHistory(item),
      });
    }

    return options;
  };

  return (
    <>
    <div className="space-y-4">
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
                  <SelectItem value="indisponivel">Serviço</SelectItem>
                  <SelectItem value="indisponivel_manual">Indisponível</SelectItem>
                  <SelectItem value="bloqueio_juridico">Bloqueio Jurídico</SelectItem>
                  <SelectItem value="sinal">Sinal</SelectItem>
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

                    const cardEl = (
                      <Card className={`transition-shadow ${hasOptions ? 'hover:shadow-md cursor-pointer' : ''}`}>
                        <CardContent className="p-4 space-y-3">
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
                            {item.classificacao && (
                              <>
                                <span className="text-muted-foreground">Classificação</span>
                                <span className="text-foreground">{item.classificacao}</span>
                              </>
                            )}
                            {item.km && (
                              <>
                                <span className="text-muted-foreground">Km</span>
                                <span className="text-foreground">{item.km}</span>
                              </>
                            )}
                            <span className="text-muted-foreground">Tipo</span>
                            <span className="text-foreground capitalize">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTipoAquisicaoBadgeClass(item.tipo)}`}>
                                {getTipoAquisicaoLabel(item.tipo) || item.tipo}
                              </Badge>
                            </span>
                            {item.empresa && (
                              <>
                                <span className="text-muted-foreground">Empresa</span>
                                <span className="text-foreground">{item.empresa}</span>
                              </>
                            )}
                          </div>

                          {(item.tem_manual != null || item.tem_chave_reserva != null || item.manutencao_vencida != null) && (
                            <div className="flex items-center gap-3 text-xs">
                              {item.tem_manual != null && (
                                <span className="flex items-center gap-1">
                                  <span className={`inline-block w-2 h-2 rounded-full ${item.tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                                  Manual
                                </span>
                              )}
                              {item.tem_chave_reserva != null && (
                                <span className="flex items-center gap-1">
                                  <span className={`inline-block w-2 h-2 rounded-full ${item.tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                                  Chave Reserva
                                </span>
                              )}
                              {item.manutencao_vencida != null && (
                                <span className="flex items-center gap-1">
                                  <span className={`inline-block w-2 h-2 rounded-full ${item.manutencao_vencida ? 'bg-red-500' : 'bg-green-500'}`} />
                                  Revisão
                                </span>
                              )}
                            </div>
                          )}

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

                          {/* Datas e Vendedor */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Entrada: {format(new Date(item.data_entrada), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                            {item.data_venda && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {item.status === 'sinal' ? 'Sinal' : 'Venda'}: {format(new Date(item.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                              </span>
                            )}
                            {item.vendedor_nome && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {item.vendedor_nome}
                              </span>
                            )}
                          </div>

                          {item.observacoes && (
                            <div className={`text-xs italic line-clamp-2 ${
                              item.status === 'indisponivel' ? 'flex items-start gap-1.5 text-orange-600 font-medium bg-orange-500/10 rounded p-2' :
                              item.status === 'indisponivel_manual' ? 'flex items-start gap-1.5 text-destructive font-medium bg-destructive/10 rounded p-2' :
                              item.status === 'bloqueio_juridico' ? 'flex items-start gap-1.5 text-muted-foreground font-medium bg-muted rounded p-2' :
                              'text-muted-foreground'
                            }`}>
                              {item.status === 'indisponivel' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                              {item.status === 'indisponivel_manual' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                              {item.status === 'bloqueio_juridico' && <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                              {item.observacoes}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );

                    if (!hasOptions) return <div key={item.id}>{cardEl}</div>;

                    return (
                      <Popover key={item.id}>
                        <PopoverTrigger asChild>
                          {cardEl}
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="center">
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Acessar</p>
                          <div className="flex flex-col gap-0.5">
                            {navOptions.map((opt, i) => (
                              <Button
                                key={i}
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2 h-9 text-sm"
                                onClick={opt.action}
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
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">{page} de {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Próxima
          </Button>
        </div>
      )}
    </div>

      {/* Dialog Reenviar para Preparação via PreparacaoProcessoDialog */}
      {reenviarItem?.avaliacao_id && (
        <PreparacaoProcessoDialog
          open={!!reenviarItem}
          onOpenChange={(open) => { if (!open) { setReenviarItem(null); setReenviarAvaliacaoData(null); } }}
          avaliacaoId={reenviarItem.avaliacao_id}
          currentStatus="estoque"
          avaliacaoData={reenviarAvaliacaoData}
          reenviarFromEstoque={{
            estoqueItemId: reenviarItem.id,
            modelo: reenviarItem.modelo,
            placa: reenviarItem.placa,
          }}
          onReenviarSuccess={() => {
            setReenviarItem(null);
            setReenviarAvaliacaoData(null);
            fetchEstoque();
          }}
        />
      )}

      <StatusChangeDialog
        open={!!statusChangeItem}
        onOpenChange={(open) => { if (!open) setStatusChangeItem(null); }}
        estoqueItem={statusChangeItem}
        onSuccess={() => {
          setStatusChangeItem(null);
          fetchEstoque();
        }}
      />

      <Dialog open={!!historyItem} onOpenChange={(open) => { if (!open) setHistoryItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Histórico - {historyItem?.modelo}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto px-2">
              <StatusTimeline
                history={historyEntries}
                renderPopupExtra={(entry) => entry.observacoes ? (
                  <div>
                    <span className="text-xs text-muted-foreground">Observação</span>
                    <p className="text-sm">{entry.observacoes}</p>
                  </div>
                ) : null}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EstoqueTab;
