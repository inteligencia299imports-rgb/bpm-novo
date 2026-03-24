import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Bike, X, ShoppingCart, ClipboardList, Handshake, ArrowDownToLine, BookOpen, Wrench, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Detail views
import AtendimentoDetail from '@/components/showroom/AtendimentoDetail';
import PosVendaDetail from '@/components/pos-venda/PosVendaDetail';
import AvaliacaoProcessDetail from '@/components/shared/AvaliacaoProcessDetail';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';
import AvaliacaoForm from '@/components/avaliacoes/AvaliacaoForm';

// Configs
import {
  POS_VENDA_COLUMNS,
  POS_COMPRA_COLUMNS,
  CONSIGNACAO_COLUMNS,
  INTERMEDIACAO_PARTE1_COLUMNS,
  INTERMEDIACAO_PARTE1_ETAPAS,
  INTERMEDIACAO_PARTE2_COLUMNS,
  INTERMEDIACAO_PARTE2_ETAPAS,
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
}

type DetailView =
  | { type: 'showroom'; data: any }
  | { type: 'pos_venda'; data: any }
  | { type: 'intermediacao'; data: any; parte: 'parte1' | 'parte2' }
  | { type: 'pos_compra'; data: any }
  | { type: 'consignacao'; data: any }
  | { type: 'preparacao'; data: any };

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  disponivel: { label: 'Disponível', color: 'bg-success/15 text-success' },
  reservada: { label: 'Reservada', color: 'bg-warning/15 text-warning' },
  vendido: { label: 'Vendida', color: 'bg-muted text-muted-foreground' },
};

const formatCurrency = (value: number | null) => {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const EstoqueTab = () => {
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
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
      if (filterStatus !== 'todos') query = query.eq('status', filterStatus);
      if (filterMarca !== 'todas') query = query.eq('marca', filterMarca);
      if (filterTipo !== 'todos') query = query.eq('tipo', filterTipo);
      if (filterEmpresa !== 'todas') query = query.eq('empresa', filterEmpresa);
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

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [item.marca, item.modelo, item.placa, item.cor, item.cilindrada, item.empresa, item.observacoes]
      .some(v => v?.toLowerCase().includes(s));
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterMarca, filterTipo, filterStatus]);

  // --- Open detail handlers ---

  const openShowroom = async (atendimentoVendaId: string) => {
    setLoadingDetail(true);
    const { data } = await supabase.from('atendimentos').select('*').eq('id', atendimentoVendaId).maybeSingle();
    if (data) {
      setDetailView({ type: 'showroom', data });
    } else {
      toast.error('Atendimento não encontrado');
    }
    setLoadingDetail(false);
  };

  const openPosVendaOrIntermediacao = async (item: EstoqueItem, target: 'pos_venda' | 'intermediacao') => {
    if (!item.atendimento_venda_id) return;
    setLoadingDetail(true);
    const { data } = await supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').eq('id', item.atendimento_venda_id).maybeSingle();
    if (data) {
      // Attach _estoqueMoto
      const enriched = { ...data, _estoqueMoto: { marca: item.marca, modelo: item.modelo, placa: item.placa } };
      if (target === 'intermediacao') {
        setDetailView({ type: 'intermediacao', data: enriched, parte: 'parte1' });
      } else {
        setDetailView({ type: 'pos_venda', data: enriched });
      }
    } else {
      toast.error('Atendimento não encontrado');
    }
    setLoadingDetail(false);
  };

  const openAvaliacaoDetail = async (avaliacaoId: string, target: 'pos_compra' | 'consignacao') => {
    setLoadingDetail(true);
    const { data } = await supabase
      .from('avaliacoes')
      .select('*, atendimentos!inner(id, nome_cliente, telefone, loja), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes)')
      .eq('id', avaliacaoId)
      .maybeSingle();
    if (data) {
      const mapped = { ...data, atendimento: (data as any).atendimentos, moto: (data as any).motos_avaliacao };
      setDetailView({ type: target, data: mapped });
    } else {
      toast.error('Avaliação não encontrada');
    }
    setLoadingDetail(false);
  };

  const openPreparacao = async (avaliacaoId: string, item: EstoqueItem) => {
    setLoadingDetail(true);
    const { data } = await supabase
      .from('avaliacoes')
      .select('*, atendimentos!inner(id, nome_cliente, telefone, loja), motos_avaliacao!inner(id, marca, modelo, placa, cor, ano_fabricacao, ano_modelo, km, categoria, cilindrada, observacoes)')
      .eq('id', avaliacaoId)
      .maybeSingle();
    if (data) {
      const mapped = { ...data, atendimento: (data as any).atendimentos, moto: (data as any).motos_avaliacao };
      setDetailView({ type: 'preparacao', data: mapped });
    } else {
      toast.error('Avaliação não encontrada');
    }
    setLoadingDetail(false);
  };

  const getNavigationOptions = (item: EstoqueItem) => {
    const options: { label: string; icon: React.ReactNode; action: () => void }[] = [];

    if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'reservada')) {
      options.push({
        label: item.status === 'vendido' ? 'Atendimento (Venda)' : 'Atendimento (Sinal)',
        icon: <ShoppingCart className="h-4 w-4" />,
        action: () => openShowroom(item.atendimento_venda_id!),
      });
    }

    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'propria') {
      options.push({
        label: 'Pós-Venda',
        icon: <ClipboardList className="h-4 w-4" />,
        action: () => openPosVendaOrIntermediacao(item, 'pos_venda'),
      });
    }

    if (item.atendimento_venda_id && item.status === 'vendido' && item.tipo === 'consignada') {
      options.push({
        label: 'Intermediação',
        icon: <Handshake className="h-4 w-4" />,
        action: () => openPosVendaOrIntermediacao(item, 'intermediacao'),
      });
    }

    if (item.avaliacao_id && item.tipo === 'propria') {
      options.push({
        label: 'Pós-Compra',
        icon: <ArrowDownToLine className="h-4 w-4" />,
        action: () => openAvaliacaoDetail(item.avaliacao_id!, 'pos_compra'),
      });
    }

    if (item.avaliacao_id && item.tipo === 'consignada') {
      options.push({
        label: 'Consignação',
        icon: <BookOpen className="h-4 w-4" />,
        action: () => openAvaliacaoDetail(item.avaliacao_id!, 'consignacao'),
      });
    }

    if (item.avaliacao_id) {
      options.push({
        label: 'Avaliação',
        icon: <FileSearch className="h-4 w-4" />,
        action: () => setDetailView({ type: 'avaliacao', data: { avaliacaoId: item.avaliacao_id } }),
      });
      options.push({
        label: 'Preparação',
        icon: <Wrench className="h-4 w-4" />,
        action: () => openPreparacao(item.avaliacao_id!, item),
      });
    }

    return options;
  };

  // --- Render detail views ---

  if (detailView) {
    switch (detailView.type) {
      case 'showroom':
        return (
          <AtendimentoDetail
            atendimento={detailView.data}
            onClose={() => setDetailView(null)}
            onEdit={() => {}}
            onDeleted={() => { setDetailView(null); fetchEstoque(); }}
            onStatusUpdated={() => fetchEstoque()}
          />
        );
      case 'pos_venda':
        return (
          <PosVendaDetail
            item={detailView.data}
            onClose={() => setDetailView(null)}
          />
        );
      case 'intermediacao':
        const intConfig = detailView.parte === 'parte1'
          ? {
              columns: INTERMEDIACAO_PARTE1_COLUMNS,
              statusField: 'intermediacao_parte1_status',
              etapas: INTERMEDIACAO_PARTE1_ETAPAS,
              observacoesField: 'pos_venda_observacoes',
              statusRules: { concluded: 'AUTORIZAÇÃO DE PAGAMENTO', default: 'em_andamento' },
            }
          : {
              columns: INTERMEDIACAO_PARTE2_COLUMNS,
              statusField: 'intermediacao_parte2_status',
              etapas: INTERMEDIACAO_PARTE2_ETAPAS,
              observacoesField: 'pos_venda_observacoes',
              statusRules: { concluded: 'TRANSFERÊNCIA FINALIZADA', special: { etapa: 'DOCUMENTAÇÃO COM DESPACHANTE', status: 'doc_despachante' }, default: 'em_andamento' },
            };
        return (
          <PosVendaDetail
            item={detailView.data}
            onClose={() => setDetailView(null)}
            statusColumns={intConfig.columns as any}
            statusField={intConfig.statusField}
            processoProps={{
              customEtapas: intConfig.etapas,
              statusField: intConfig.statusField,
              observacoesField: intConfig.observacoesField,
              statusRules: intConfig.statusRules,
              showContratoConsignante: detailView.parte === 'parte1',
            }}
          />
        );
      case 'pos_compra':
        return (
          <AvaliacaoProcessDetail
            item={detailView.data}
            entityType="pos_compra"
            statusColumns={POS_COMPRA_COLUMNS}
            statusField="pos_compra_status"
            title="Pós-Compra"
            onClose={() => setDetailView(null)}
          />
        );
      case 'consignacao':
        return (
          <AvaliacaoProcessDetail
            item={detailView.data}
            entityType="consignacao"
            statusColumns={CONSIGNACAO_COLUMNS}
            statusField="consignacao_status"
            title="Consignação"
            onClose={() => setDetailView(null)}
          />
        );
      case 'preparacao':
        return (
          <PreparacaoProcessoDialog
            open={true}
            onOpenChange={(open) => { if (!open) setDetailView(null); }}
            avaliacaoId={detailView.data.id}
            currentStatus={detailView.data.preparacao_status || 'em_aberto'}
            avaliacaoData={detailView.data}
            onStatusChanged={() => { setDetailView(null); fetchEstoque(); }}
          />
        );
      case 'avaliacao':
        return (
          <AvaliacaoForm
            avaliacaoId={detailView.data.avaliacaoId}
            onClose={() => setDetailView(null)}
          />
        );
    }
  }

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

      {loadingDetail && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

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
  );
};

export default EstoqueTab;
