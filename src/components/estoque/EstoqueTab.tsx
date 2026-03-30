import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Bike, X, ShoppingCart, ShoppingBag, Handshake, ClipboardCheck, FileText, Wrench, Calendar, User, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type EstoqueNavTarget =
  | { tab: 'showroom'; atendimentoId: string }
  | { tab: 'avaliacoes'; avaliacaoId: string }
  | { tab: 'pos_venda'; atendimentoId: string }
  | { tab: 'intermediacao'; atendimentoId: string }
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
  manutencao_em_dia?: boolean | null;
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
  reservada: { label: 'Reservada', color: 'bg-warning/15 text-warning' },
  vendido: { label: 'Vendida', color: 'bg-muted text-muted-foreground' },
  indisponivel: { label: 'Indisponível', color: 'bg-destructive/15 text-destructive' },
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
  const [reenviarObs, setReenviarObs] = useState('');
  const [reenviarSaving, setReenviarSaving] = useState(false);

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
      let query = supabase.from('estoque').select('*, motos_avaliacao(tem_manual, tem_chave_reserva, manutencao_em_dia), atendimentos:atendimento_venda_id(vendedor_id)').order('data_entrada', { ascending: false });
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
        manutencao_em_dia: d.motos_avaliacao?.manutencao_em_dia ?? null,
        venda_vendedor_id: d.atendimentos?.vendedor_id ?? null,
        vendedor_nome: d.atendimentos?.vendedor_id ? (vendedorMap[d.atendimentos.vendedor_id] || null) : null,
      }));
      setItems(mapped);
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

  const getNavigationOptions = (item: EstoqueItem) => {
    const options: { label: string; icon: React.ReactNode; action: () => void }[] = [];
    const isVendedor = role === 'vendedor';
    const isOwnSale = item.venda_vendedor_id === user?.id;

    // Vendedor: only show "Venda" if sold/reserved AND it's their sale
    if (isVendedor) {
      if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'reservada') && isOwnSale) {
        options.push({
          label: 'Venda',
          icon: <Bike className="h-4 w-4" />,
          action: () => nav({ tab: 'showroom', atendimentoId: item.atendimento_venda_id! }),
        });
      }
      return options;
    }

    if (item.atendimento_venda_id && (item.status === 'vendido' || item.status === 'reservada')) {
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
        label: 'Intermediação',
        icon: <Handshake className="h-4 w-4" />,
        action: () => nav({ tab: 'intermediacao', atendimentoId: item.atendimento_venda_id! }),
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
        action: () => setReenviarItem(item),
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
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${item.tipo === 'consignada' ? 'border-purple-500 text-purple-600' : 'border-green-500 text-green-600'}`}>
                                {item.tipo === 'propria' ? 'Própria' : 'Consignada'}
                              </Badge>
                            </span>
                            {item.empresa && (
                              <>
                                <span className="text-muted-foreground">Empresa</span>
                                <span className="text-foreground">{item.empresa}</span>
                              </>
                            )}
                          </div>

                          {(item.tem_manual != null || item.tem_chave_reserva != null || item.manutencao_em_dia != null) && (
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
                              {item.manutencao_em_dia != null && (
                                <span className="flex items-center gap-1">
                                  <span className={`inline-block w-2 h-2 rounded-full ${item.manutencao_em_dia ? 'bg-red-500' : 'bg-green-500'}`} />
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

      {/* Dialog Reenviar para Preparação */}
      <Dialog open={!!reenviarItem} onOpenChange={(open) => { if (!open) { setReenviarItem(null); setReenviarObs(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Reenviar para Preparação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A moto <strong>{reenviarItem?.modelo}</strong> {reenviarItem?.placa ? `(${reenviarItem.placa})` : ''} será marcada como <strong>Indisponível</strong> e reenviada para preparação.
            </p>
            <div>
              <label className="text-sm font-medium text-foreground">Motivo / Observação *</label>
              <Textarea
                placeholder="Descreva o motivo do reenvio para preparação..."
                value={reenviarObs}
                onChange={e => setReenviarObs(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReenviarItem(null); setReenviarObs(''); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={reenviarSaving}
              onClick={async () => {
                if (!reenviarObs.trim()) {
                  toast.error('A observação é obrigatória');
                  return;
                }
                if (!reenviarItem?.avaliacao_id) return;
                setReenviarSaving(true);
                try {
                  const { data: { user: currentUser } } = await supabase.auth.getUser();
                  let userName = 'Usuário';
                  if (currentUser) {
                    const { data: roleData } = await supabase.from('user_roles').select('nome').eq('user_id', currentUser.id).maybeSingle();
                    if (roleData?.nome) userName = roleData.nome;
                  }

                  // Update estoque status to indisponivel and save observation
                  const { error: estoqueErr } = await supabase.from('estoque').update({
                    status: 'indisponivel',
                    observacoes: reenviarObs.trim(),
                  }).eq('id', reenviarItem.id);

                  if (estoqueErr) { toast.error('Erro ao atualizar estoque'); return; }

                  // Update avaliação preparacao_status back to em_aberto
                  const { error: avalErr } = await supabase.from('avaliacoes').update({
                    preparacao_status: 'em_aberto',
                  } as any).eq('id', reenviarItem.avaliacao_id);

                  if (avalErr) { toast.error('Erro ao atualizar preparação'); return; }

                  // Record in status_history
                  if (currentUser) {
                    await supabase.from('status_history').insert({
                      entity_id: reenviarItem.avaliacao_id,
                      entity_type: 'preparacao',
                      status_from: 'estoque',
                      status_to: 'em_aberto',
                      observacoes: `REENVIO PARA PREPARAÇÃO: ${reenviarObs.trim()}`,
                      changed_by: currentUser.id,
                      changed_by_name: userName,
                    });
                  }

                  toast.success('Moto reenviada para preparação');
                  setReenviarItem(null);
                  setReenviarObs('');
                  fetchEstoque();
                } catch (err) {
                  console.error(err);
                  toast.error('Erro ao reenviar para preparação');
                } finally {
                  setReenviarSaving(false);
                }
              }}
            >
              {reenviarSaving ? 'Salvando...' : 'Confirmar Reenvio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EstoqueTab;
