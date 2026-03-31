import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Users, ShoppingCart, CreditCard, TrendingUp, DollarSign, Target, BarChart3, PieChart } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

const TRANSFER_COST = 445;

// Custom month logic: month starts on 21st, ends on 20th of next month
function getCustomMonthLabel(startDate: Date): string {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);
  return `${format(startDate, 'dd/MM', { locale: ptBR })} - ${format(endDate, 'dd/MM/yy', { locale: ptBR })}`;
}

function generateCustomMonths(): { start: Date; end: Date; label: string }[] {
  const months: { start: Date; end: Date; label: string }[] = [];
  const now = new Date();
  let current = new Date(2025, 11, 21); // 21/12/2025

  while (current <= now) {
    const end = new Date(current);
    end.setMonth(end.getMonth() + 1);
    end.setDate(20);
    end.setHours(23, 59, 59, 999);
    months.push({
      start: new Date(current),
      end,
      label: getCustomMonthLabel(current),
    });
    current = new Date(current);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null | undefined) =>
  `${((v ?? 0) * 100).toFixed(1)}%`;

interface AtendimentoRow {
  id: string;
  nome_cliente: string;
  situacao: string;
  loja: string;
  vendedor_id: string;
  created_at: string;
  valor_venda: number | null;
  valor_sinal: number | null;
}

interface AvaliacaoRow {
  id: string;
  atendimento_id: string;
  quanto_vende: number | null;
  valor_fechamento: number | null;
  previsao_custos_loja: number | null;
  previsao_custos_cliente: number | null;
  tipo_aquisicao: string | null;
  moto_avaliacao_id: string;
}

interface EstoqueRow {
  id: string;
  avaliacao_id: string | null;
  atendimento_venda_id: string | null;
  preco: number | null;
  tipo: string;
  modelo: string;
  marca: string;
  placa: string | null;
  data_venda: string | null;
  valor_venda: number | null;
  status: string;
}

interface CustoOficinaRow {
  avaliacao_id: string;
  responsavel: string;
  valor_previsto: number | null;
  valor_executado: number | null;
}

interface VendedorInfo {
  user_id: string;
  nome: string;
}

const RelatorioShowroom: React.FC = () => {
  const { userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [estoqueItems, setEstoqueItems] = useState<EstoqueRow[]>([]);
  const [custosOficina, setCustosOficina] = useState<CustoOficinaRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorInfo[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [filterLoja, setFilterLoja] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');

  const [listTab, setListTab] = useState('vendidas');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [atRes, avRes, esRes, coRes, vdRes] = await Promise.all([
      supabase.from('atendimentos').select('id, nome_cliente, situacao, loja, vendedor_id, created_at, valor_venda, valor_sinal'),
      supabase.from('avaliacoes').select('id, atendimento_id, quanto_vende, valor_fechamento, previsao_custos_loja, previsao_custos_cliente, tipo_aquisicao, moto_avaliacao_id'),
      supabase.from('estoque').select('id, avaliacao_id, atendimento_venda_id, preco, tipo, modelo, marca, placa, data_venda, valor_venda, status'),
      supabase.from('custos_oficina').select('avaliacao_id, responsavel, valor_previsto, valor_executado'),
      supabase.from('user_roles').select('user_id, nome').eq('role', 'vendedor'),
    ]);
    setAtendimentos((atRes.data || []) as AtendimentoRow[]);
    setAvaliacoes((avRes.data || []) as AvaliacaoRow[]);
    setEstoqueItems((esRes.data || []) as EstoqueRow[]);
    setCustosOficina((coRes.data || []) as CustoOficinaRow[]);
    setVendedores((vdRes.data || []) as VendedorInfo[]);
    setLoading(false);
  };

  // Helper maps
  const avaliacaoByAtendimento = useMemo(() => {
    const map: Record<string, AvaliacaoRow[]> = {};
    avaliacoes.forEach(a => {
      if (!map[a.atendimento_id]) map[a.atendimento_id] = [];
      map[a.atendimento_id].push(a);
    });
    return map;
  }, [avaliacoes]);

  const estoqueByAvaliacao = useMemo(() => {
    const map: Record<string, EstoqueRow> = {};
    estoqueItems.forEach(e => { if (e.avaliacao_id) map[e.avaliacao_id] = e; });
    return map;
  }, [estoqueItems]);

  const estoqueByAtendimentoVenda = useMemo(() => {
    const map: Record<string, EstoqueRow[]> = {};
    estoqueItems.forEach(e => {
      if (e.atendimento_venda_id) {
        if (!map[e.atendimento_venda_id]) map[e.atendimento_venda_id] = [];
        map[e.atendimento_venda_id].push(e);
      }
    });
    return map;
  }, [estoqueItems]);

  const custosByAvaliacao = useMemo(() => {
    const map: Record<string, CustoOficinaRow[]> = {};
    custosOficina.forEach(c => {
      if (!map[c.avaliacao_id]) map[c.avaliacao_id] = [];
      map[c.avaliacao_id].push(c);
    });
    return map;
  }, [custosOficina]);

  const vendedorMap = useMemo(() => {
    const map: Record<string, string> = {};
    vendedores.forEach(v => { map[v.user_id] = v.nome; });
    return map;
  }, [vendedores]);

  // Normalize loja
  const normLoja = (loja: string) => loja?.toUpperCase().includes('DUCATI') ? 'Ducati' : '299';

  // Filter atendimentos
  const filteredAtendimentos = useMemo(() => {
    return atendimentos.filter(a => {
      if (filterLoja !== 'todos' && normLoja(a.loja) !== filterLoja) return false;
      return true;
    });
  }, [atendimentos, filterLoja]);

  // Vendidos filtered by date and tipo
  const vendidos = useMemo(() => {
    return filteredAtendimentos.filter(a => {
      if (a.situacao !== 'vendido') return false;
      // Find estoque with data_venda
      const estoques = estoqueByAtendimentoVenda[a.id] || [];
      const hasMatchingEstoque = estoques.some(e => {
        if (filterTipo !== 'todos' && e.tipo !== filterTipo) return false;
        if (dateFrom && e.data_venda) {
          const dv = new Date(e.data_venda);
          if (dv < dateFrom) return false;
        }
        if (dateTo && e.data_venda) {
          const dv = new Date(e.data_venda);
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (dv > endOfDay) return false;
        }
        return true;
      });
      return estoques.length === 0 || hasMatchingEstoque;
    });
  }, [filteredAtendimentos, estoqueByAtendimentoVenda, dateFrom, dateTo, filterTipo]);

  // Sinais filtered only by loja (no date filter, no tipo filter for counts)
  const sinais = useMemo(() => {
    return filteredAtendimentos.filter(a => a.situacao === 'sinal');
  }, [filteredAtendimentos]);

  // Atendimentos filtered by date (created_at in same period)
  const atendimentosFiltradosPorData = useMemo(() => {
    return filteredAtendimentos.filter(a => {
      if (dateFrom) {
        const d = new Date(a.created_at);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(a.created_at);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      return true;
    });
  }, [filteredAtendimentos, dateFrom, dateTo]);

  // Helper: get custos for an avaliacao
  const getCustosLoja = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel === 'loja').reduce((sum, c) => sum + (c.valor_executado ?? 0), 0);
  };

  const getCustosLojaPrevistos = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel === 'loja').reduce((sum, c) => sum + (c.valor_previsto ?? 0), 0);
  };

  const getCustosClientePrevisto = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel === 'cliente').reduce((sum, c) => sum + (c.valor_previsto ?? 0), 0);
  };

  const getCustosClienteReal = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel === 'cliente').reduce((sum, c) => sum + (c.valor_executado ?? 0), 0);
  };

  // Build moto list for vendidas
  const motosVendidas = useMemo(() => {
    const list: any[] = [];
    vendidos.forEach(atend => {
      const estoques = estoqueByAtendimentoVenda[atend.id] || [];
      estoques.forEach(est => {
        if (filterTipo !== 'todos' && est.tipo !== filterTipo) return;
        if (dateFrom && est.data_venda) {
          const dv = new Date(est.data_venda);
          if (dv < dateFrom) return;
        }
        if (dateTo && est.data_venda) {
          const dv = new Date(est.data_venda);
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (dv > endOfDay) return;
        }
        // Find avaliacao linked to this estoque
        const aval = avaliacoes.find(av => av.id === est.avaliacao_id);
        const custoRealOficinaLoja = aval ? getCustosLoja(aval.id) : 0;
        const custoRealOficinaCliente = aval ? getCustosClienteReal(aval.id) : 0;
        const custoPrevOficinaCliente = aval ? getCustosClientePrevisto(aval.id) : 0;
        const abatimentos = TRANSFER_COST + custoRealOficinaLoja;
        const precoEstoque = est.preco ?? 0;
        const faturamentoRealizado = precoEstoque + (custoPrevOficinaCliente - custoRealOficinaCliente);
        const valorFechamento = aval?.valor_fechamento ?? 0;
        const margemRealizada = faturamentoRealizado - (valorFechamento + TRANSFER_COST + custoRealOficinaLoja);
        const pctMargemRealizada = precoEstoque > 0 ? margemRealizada / precoEstoque : 0;
        
        list.push({
          nomeCliente: atend.nome_cliente,
          vendedor: vendedorMap[atend.vendedor_id] || '-',
          tipo: est.tipo,
          modelo: `${est.marca} ${est.modelo}`,
          placa: est.placa || '-',
          situacao: atend.situacao,
          dataVenda: est.data_venda,
          valorVenda: est.valor_venda ?? precoEstoque,
          abatimentos,
          valorFechamento,
          margemRealizada,
          pctMargemRealizada,
        });
      });
    });
    return list;
  }, [vendidos, estoqueByAtendimentoVenda, avaliacoes, custosByAvaliacao, vendedorMap, filterTipo, dateFrom, dateTo]);

  // Build moto list for sinais
  const motosSinal = useMemo(() => {
    const list: any[] = [];
    sinais.forEach(atend => {
      const estoques = estoqueByAtendimentoVenda[atend.id] || [];
      estoques.forEach(est => {
        if (filterTipo !== 'todos' && est.tipo !== filterTipo) return;
        const aval = avaliacoes.find(av => av.id === est.avaliacao_id);
        const custoRealOficinaLoja = aval ? getCustosLoja(aval.id) : 0;
        const custoRealOficinaCliente = aval ? getCustosClienteReal(aval.id) : 0;
        const custoPrevOficinaCliente = aval ? getCustosClientePrevisto(aval.id) : 0;
        const abatimentos = TRANSFER_COST + custoRealOficinaLoja;
        const precoEstoque = est.preco ?? 0;
        const faturamentoRealizado = precoEstoque + (custoPrevOficinaCliente - custoRealOficinaCliente);
        const valorFechamento = aval?.valor_fechamento ?? 0;
        const margemRealizada = faturamentoRealizado - (valorFechamento + TRANSFER_COST + custoRealOficinaLoja);
        const pctMargemRealizada = precoEstoque > 0 ? margemRealizada / precoEstoque : 0;

        list.push({
          nomeCliente: atend.nome_cliente,
          vendedor: vendedorMap[atend.vendedor_id] || '-',
          tipo: est.tipo,
          modelo: `${est.marca} ${est.modelo}`,
          placa: est.placa || '-',
          situacao: atend.situacao,
          dataSinal: atend.created_at,
          valorVenda: est.valor_venda ?? precoEstoque,
          abatimentos,
          valorFechamento,
          margemRealizada,
          pctMargemRealizada,
        });
      });
    });
    return list;
  }, [sinais, estoqueByAtendimentoVenda, avaliacoes, custosByAvaliacao, vendedorMap, filterTipo]);

  // ===== Indicadores =====
  const indicadores = useMemo(() => {
    const qtdAtendimentos = atendimentosFiltradosPorData.length;
    const qtdVendas = vendidos.length;
    const qtdSinais = sinais.length;
    const taxaConversao = qtdAtendimentos > 0 ? qtdVendas / qtdAtendimentos : 0;

    // For financial metrics, iterate vendidos with their avaliacoes
    let faturamentoPrevisto = 0;
    let faturamentoRealizado = 0;
    let margemPrevista = 0;
    let margemRealizada = 0;
    let totalQuantoVende = 0;
    let totalPrecoEstoque = 0;

    vendidos.forEach(atend => {
      const estoques = estoqueByAtendimentoVenda[atend.id] || [];
      estoques.forEach(est => {
        if (filterTipo !== 'todos' && est.tipo !== filterTipo) return;
        const aval = avaliacoes.find(av => av.id === est.avaliacao_id);
        if (!aval) return;

        const quantoVende = aval.quanto_vende ?? 0;
        const valorFechamento = aval.valor_fechamento ?? 0;
        const previsaoCustosLoja = aval.previsao_custos_loja ?? 0;
        const precoEstoque = est.preco ?? 0;
        const custoPrevCliente = getCustosClientePrevisto(aval.id);
        const custoRealCliente = getCustosClienteReal(aval.id);
        const custoRealLoja = getCustosLoja(aval.id);

        faturamentoPrevisto += quantoVende;
        totalQuantoVende += quantoVende;
        
        const fatReal = precoEstoque + (custoPrevCliente - custoRealCliente);
        faturamentoRealizado += fatReal;
        totalPrecoEstoque += precoEstoque;

        margemPrevista += quantoVende - (valorFechamento + previsaoCustosLoja);

        margemRealizada += fatReal - (valorFechamento + TRANSFER_COST + custoRealLoja);
      });
    });

    const pctMargemPrevista = totalQuantoVende > 0 ? margemPrevista / totalQuantoVende : 0;
    const pctMargemRealizada = totalPrecoEstoque > 0 ? margemRealizada / totalPrecoEstoque : 0;

    return {
      qtdAtendimentos, qtdVendas, qtdSinais, taxaConversao,
      faturamentoPrevisto, faturamentoRealizado,
      margemPrevista, pctMargemPrevista,
      margemRealizada, pctMargemRealizada,
    };
  }, [atendimentosFiltradosPorData, vendidos, sinais, estoqueByAtendimentoVenda, avaliacoes, custosByAvaliacao, filterTipo]);

  // ===== Charts by vendedor =====
  const chartByVendedor = useMemo(() => {
    const vendedorIds = [...new Set(filteredAtendimentos.map(a => a.vendedor_id))];
    return vendedorIds.map(vid => {
      const vendAtend = atendimentosFiltradosPorData.filter(a => a.vendedor_id === vid);
      const vendVendas = vendidos.filter(a => a.vendedor_id === vid);
      const vendSinais = sinais.filter(a => a.vendedor_id === vid);
      const qtdAtend = vendAtend.length;
      const qtdVendas = vendVendas.length;
      const qtdSinais = vendSinais.length;
      return {
        nome: vendedorMap[vid] || 'Desconhecido',
        atendimentos: qtdAtend,
        vendas: qtdVendas,
        sinais: qtdSinais,
        conversao: qtdAtend > 0 ? +(qtdVendas / qtdAtend * 100).toFixed(1) : 0,
      };
    }).filter(v => v.atendimentos > 0 || v.vendas > 0 || v.sinais > 0);
  }, [filteredAtendimentos, atendimentosFiltradosPorData, vendidos, sinais, vendedorMap]);

  // ===== Charts by custom month =====
  const chartByMonth = useMemo(() => {
    const months = generateCustomMonths();
    return months.map(m => {
      // Atendimentos in this month period (by created_at)
      const atendMonth = filteredAtendimentos.filter(a => {
        const d = new Date(a.created_at);
        return d >= m.start && d <= m.end;
      });
      // Vendidos in this month period (by data_venda from estoque)
      const vendidosMonth = filteredAtendimentos.filter(a => {
        if (a.situacao !== 'vendido') return false;
        const estoques = estoqueByAtendimentoVenda[a.id] || [];
        return estoques.some(e => {
          if (filterTipo !== 'todos' && e.tipo !== filterTipo) return false;
          if (!e.data_venda) return false;
          const dv = new Date(e.data_venda);
          return dv >= m.start && dv <= m.end;
        });
      });

      let faturamento = 0;
      let margemPrevista = 0;
      let margemRealizada = 0;
      let totalQV = 0;
      let totalPE = 0;

      vendidosMonth.forEach(atend => {
        const estoques = estoqueByAtendimentoVenda[atend.id] || [];
        estoques.forEach(est => {
          if (filterTipo !== 'todos' && est.tipo !== filterTipo) return;
          if (!est.data_venda) return;
          const dv = new Date(est.data_venda);
          if (dv < m.start || dv > m.end) return;

          const aval = avaliacoes.find(av => av.id === est.avaliacao_id);
          if (!aval) return;
          const precoEstoque = est.preco ?? 0;
          const quantoVende = aval.quanto_vende ?? 0;
          const valorFechamento = aval.valor_fechamento ?? 0;
          const previsaoCustosLoja = aval.previsao_custos_loja ?? 0;
          const custoPrevCliente = getCustosClientePrevisto(aval.id);
          const custoRealCliente = getCustosClienteReal(aval.id);
          const custoRealLoja = getCustosLoja(aval.id);

          faturamento += precoEstoque;
          totalQV += quantoVende;
          totalPE += precoEstoque;
          margemPrevista += quantoVende - (valorFechamento + previsaoCustosLoja);
          const fatReal = precoEstoque + (custoPrevCliente - custoRealCliente);
          margemRealizada += fatReal - (valorFechamento + TRANSFER_COST + custoRealLoja);
        });
      });

      return {
        label: m.label,
        atendimentos: atendMonth.length,
        vendas: vendidosMonth.length,
        faturamento,
        pctMargemPrevista: totalQV > 0 ? +(margemPrevista / totalQV * 100).toFixed(1) : 0,
        pctMargemRealizada: totalPE > 0 ? +(margemRealizada / totalPE * 100).toFixed(1) : 0,
      };
    });
  }, [filteredAtendimentos, estoqueByAtendimentoVenda, avaliacoes, custosByAvaliacao, filterTipo]);

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterLoja('todos');
    setFilterTipo('todos');
  };

  const tipoLabel = (t: string) => {
    const map: Record<string, string> = { propria: 'Própria', consignada: 'Consignada', 'test-ride': 'Test-Ride', repasse: 'Repasse', convertida: 'Convertida' };
    return map[t] || t;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-36 justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-36 justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loja</Label>
              <Select value={filterLoja} onValueChange={setFilterLoja}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="299">299</SelectItem>
                  <SelectItem value="Ducati">Ducati</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="propria">Própria</SelectItem>
                  <SelectItem value="consignada">Consignada</SelectItem>
                  <SelectItem value="test-ride">Test-Ride</SelectItem>
                  <SelectItem value="repasse">Repasse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <IndicatorCard title="Atendimentos" value={indicadores.qtdAtendimentos} gradient="teal" />
        <IndicatorCard title="Vendas" value={indicadores.qtdVendas} gradient="teal" />
        <IndicatorCard title="Sinais" value={indicadores.qtdSinais} gradient="teal" />
        <IndicatorCard title="Taxa de Conversão" value={fmtPct(indicadores.taxaConversao)} gradient="teal" />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <IndicatorCard title="Faturamento Previsto" value={fmtBRL(indicadores.faturamentoPrevisto)} gradient="purple" />
        <IndicatorCard title="Margem Prevista" value={`${fmtBRL(indicadores.margemPrevista)} (${fmtPct(indicadores.pctMargemPrevista)})`} gradient="purple" />
        <IndicatorCard title="Faturamento Realizado" value={fmtBRL(indicadores.faturamentoRealizado)} gradient="emerald" />
        <IndicatorCard title="Margem Realizada" value={`${fmtBRL(indicadores.margemRealizada)} (${fmtPct(indicadores.pctMargemRealizada)})`} gradient="emerald" />
      </div>

      {/* Charts by Vendedor */}
      <Card>
        <CardHeader><CardTitle className="text-base">Por Vendedor</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartCard title="Atendimentos" data={[...chartByVendedor].sort((a, b) => b.atendimentos - a.atendimentos)} dataKey="atendimentos" />
            <ChartCard title="Vendas" data={[...chartByVendedor].sort((a, b) => b.vendas - a.vendas)} dataKey="vendas" />
            <ChartCard title="Sinais" data={[...chartByVendedor].sort((a, b) => b.sinais - a.sinais)} dataKey="sinais" />
            <ChartCard title="Taxa Conversão (%)" data={[...chartByVendedor].sort((a, b) => b.conversao - a.conversao)} dataKey="conversao" />
          </div>
        </CardContent>
      </Card>

      {/* Charts by Month */}
      <Card>
        <CardHeader><CardTitle className="text-base">Por Mês (a partir de 21/12/2025)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MonthChart title="Atendimentos" data={chartByMonth} dataKey="atendimentos" />
            <MonthChart title="Vendas" data={chartByMonth} dataKey="vendas" />
            <MonthChart title="Faturamento" data={chartByMonth} dataKey="faturamento" isCurrency />
            <div>
              <p className="text-sm font-medium mb-2">Margem Prevista vs Realizada (%)</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartByMonth} barGap={4}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Legend />
                  <Bar dataKey="pctMargemPrevista" name="Prevista" fill="#7e6597" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}%` }} />
                  <Bar dataKey="pctMargemRealizada" name="Realizada" fill="#169d53" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}%` }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lists */}
      <Card>
        <CardHeader><CardTitle className="text-base">Listagem</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={listTab} onValueChange={setListTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="vendidas">Vendidas ({motosVendidas.length})</TabsTrigger>
              <TabsTrigger value="sinais">Com Sinal ({motosSinal.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="vendidas">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Venda</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead className="text-right">% Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosVendidas.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhuma moto vendida encontrada</TableCell></TableRow>
                    ) : motosVendidas.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{m.situacao}</Badge></TableCell>
                        <TableCell className="text-xs">{m.dataVenda ? format(new Date(m.dataVenda), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.pctMargemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(m.pctMargemRealizada)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="sinais">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Sinal</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead className="text-right">% Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosSinal.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhuma moto com sinal encontrada</TableCell></TableRow>
                    ) : motosSinal.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{m.situacao}</Badge></TableCell>
                        <TableCell className="text-xs">{m.dataSinal ? format(new Date(m.dataSinal), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.pctMargemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(m.pctMargemRealizada)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

// Sub-components
const indicatorGradients: Record<string, string> = {
  teal: 'bg-gradient-to-br from-[#2F6F84] to-[#3F8DA6]',
  green: 'bg-gradient-to-br from-[#169d53] to-[#20c76a]',
  purple: 'bg-gradient-to-br from-[#4a2d6b] to-[#7e6597]',
  amber: 'bg-gradient-to-br from-[#da6220] to-[#f59e0b]',
  blue: 'bg-gradient-to-br from-[#2563eb] to-[#2EC5FF]',
  slate: 'bg-gradient-to-br from-[#475569] to-[#64748b]',
  emerald: 'bg-gradient-to-br from-[#115e3a] to-[#169d53]',
  rose: 'bg-gradient-to-br from-[#e11d48] to-[#fb7185]',
};

const IndicatorCard: React.FC<{ title: string; value: string | number; sub?: string; gradient?: string }> = ({ title, value, sub, gradient = 'teal' }) => (
  <Card className={cn(indicatorGradients[gradient], 'border-0 text-white shadow-md')}>
    <CardContent className="pt-4 pb-3 px-4">
      <p className="text-xs text-white/80 mb-1">{title}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-white/70">{sub}</p>}
    </CardContent>
  </Card>
);

const renderBarLabel = (props: any, isCurrency?: boolean) => {
  const { x, y, width, value } = props;
  if (value == null || value === 0) return null;
  const formatted = isCurrency ? fmtBRL(value) : typeof value === 'number' && value % 1 !== 0 ? `${value.toFixed(1)}%` : String(value);
  return (
    <text x={x + width / 2} y={y - 6} fill="hsl(var(--foreground))" fontSize={10} fontWeight={600} textAnchor="middle">
      {formatted}
    </text>
  );
};

const ChartCard: React.FC<{ title: string; data: any[]; dataKey: string }> = ({ title, data, dataKey }) => (
  <div>
    <p className="text-sm font-medium mb-2">{title}</p>
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} barCategoryGap="20%">
        <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} label={(props: any) => renderBarLabel(props)} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string; isCurrency?: boolean }> = ({ title, data, dataKey, isCurrency }) => (
  <div>
    <p className="text-sm font-medium mb-2">{title}</p>
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} barCategoryGap="20%">
        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={isCurrency ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined} />
        <Tooltip formatter={isCurrency ? (v: number) => fmtBRL(v) : undefined} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey={dataKey} fill="#3F8DA6" radius={[6, 6, 0, 0]} label={(props: any) => renderBarLabel(props, isCurrency)} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default RelatorioShowroom;
