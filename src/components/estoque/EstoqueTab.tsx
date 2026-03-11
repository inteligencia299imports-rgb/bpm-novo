import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORIAS_MOTO, CORES_MOTO } from '@/types/crm';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { toast } from 'sonner';

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
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  disponivel: { label: 'Disponível', color: 'bg-success/15 text-success' },
  reservada: { label: 'Reservada', color: 'bg-warning/15 text-warning' },
  vendida: { label: 'Vendida', color: 'bg-muted text-muted-foreground' },
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
  const [filterCategoria, setFilterCategoria] = useState('todas');
  const [filterStatus, setFilterStatus] = useState('disponivel');
  const [showFilters, setShowFilters] = useState(false);
  const { getMarcaNomes } = useMarcasModelos();
  const marcas = getMarcaNomes();

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
      if (filterCategoria !== 'todas') {
        query = query.eq('categoria', filterCategoria);
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
  }, [filterStatus, filterMarca, filterCategoria]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [item.marca, item.modelo, item.placa, item.cor, item.cilindrada, item.empresa, item.observacoes]
      .some(v => v?.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Estoque</h1>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="reservada">Reservada</SelectItem>
                <SelectItem value="vendida">Vendida</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMarca} onValueChange={setFilterMarca}>
              <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as marcas</SelectItem>
                {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {CATEGORIAS_MOTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bike className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma moto encontrada no estoque.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{item.marca} {item.modelo}</p>
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
                      <span className="font-medium text-foreground">{item.placa}</span>
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
          ))}
        </div>
      )}
    </div>
  );
};

export default EstoqueTab;
