import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, Users, ShoppingCart, CreditCard, TrendingUp, DollarSign, Target, BarChart3, PieChart } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, AreaChart, Area, ComposedChart } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';

const TRANSFER_COST = 445;

// Custom month logic: month starts on 21st, ends on 20th of next month
function getCustomMonthLabel(startDate: Date): string {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);
  return `${format(startDate, 'dd/MM', { locale: ptBR })} - ${format(endDate, 'dd/MM', { locale: ptBR })}`;
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
const fmtPct = (v: number | null | undefined) => {
  const raw = (v ?? 0) * 100;
  return `${(Math.round(raw * 10) / 10).toFixed(1)}%`;
};

interface AtendimentoRow {
  id: string;
  nome_cliente: string;
  situacao: string;
  loja: string;
  interesse: string;
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

interface RelatorioShowroomProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
}

const RelatorioShowroom: React.FC<RelatorioShowroomProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const { userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [estoqueItems, setEstoqueItems] = useState<EstoqueRow[]>([]);
  const [custosOficina, setCustosOficina] = useState<CustoOficinaRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorInfo[]>([]);

  // Filters
  const [filterLoja, setFilterLojaState] = useState('todos');
  const [filterTipo, setFilterTipoState] = useState('todos');

  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };
  const setFilterTipo = (v: string) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };

  const [listTab, setListTab] = useState('vendidas');

  // Register clear function
  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLojaState('todos');
      setFilterTipoState('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    const [atRes, avRes, esRes, coRes, vdRes] = await Promise.all([
      supabase.from('atendimentos').select('id, nome_cliente, situacao, loja, interesse, vendedor_id, created_at, valor_venda, valor_sinal'),
      supabase.from('avaliacoes').select('id, atendimento_id, quanto_vende, valor_fechamento, previsao_custos_loja, previsao_custos_cliente, tipo_aquisicao, moto_avaliacao_id'),
      supabase.from('estoque').select('id, avaliacao_id, atendimento_venda_id, preco, tipo, modelo, marca, placa, data_venda, valor_venda, status'),
      supabase.from('custos_oficina').select('avaliacao_id, responsavel, valor_previsto, valor_executado'),
      supabase.from('user_roles').select('user_id, nome'),
    ]);
    setAtendimentos((atRes.data || []) as AtendimentoRow[]);
    setAvaliacoes((avRes.data || []) as AvaliacaoRow[]);
    setEstoqueItems((esRes.data || []) as EstoqueRow[]);
    setCustosOficina((coRes.data || []) as CustoOficinaRow[]);
    setVendedores((vdRes.data || []) as VendedorInfo[]);
    setLoading(false);
  }, []);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    loadData();

    const channel = supabase
      .channel('relatorio-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custos_oficina' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, debouncedLoad)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

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
      // Só considerar clientes interessados em comprar ou trocar
      if (a.interesse !== 'comprar' && a.interesse !== 'trocar') return false;
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
  // Custos de oficina (têm valor_executado) - usam lógica previsto vs realizado
  const getCustosLojaOficinaExecutado = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel.toLowerCase() === 'loja' && c.valor_executado != null).reduce((sum, c) => sum + (c.valor_executado ?? 0), 0);
  };

  const getCustosLojaOficinaPrevisto = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel.toLowerCase() === 'loja' && c.valor_executado != null).reduce((sum, c) => sum + (c.valor_previsto ?? 0), 0);
  };

  // Custos de processo (sem valor_executado) - sempre negativos, abatidos direto
  const getCustosLojaProcesso = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel.toLowerCase() === 'loja' && c.valor_executado == null).reduce((sum, c) => sum + (c.valor_previsto ?? 0), 0);
  };

  // Total de custos loja (para abatimentos na listagem)
  const getCustosLoja = (avaliacaoId: string) => {
    return getCustosLojaOficinaExecutado(avaliacaoId) + getCustosLojaProcesso(avaliacaoId);
  };

  const getCustosClientePrevisto = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel.toLowerCase() === 'cliente').reduce((sum, c) => sum + (c.valor_previsto ?? 0), 0);
  };

  const getCustosClienteReal = (avaliacaoId: string) => {
    const custos = custosByAvaliacao[avaliacaoId] || [];
    return custos.filter(c => c.responsavel.toLowerCase() === 'cliente').reduce((sum, c) => sum + (c.valor_executado ?? 0), 0);
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
        const custoOficinaLojaExec = aval ? getCustosLojaOficinaExecutado(aval.id) : 0;
        const custoOficinaLojaPrev = aval ? getCustosLojaOficinaPrevisto(aval.id) : 0;
        const custoProcessoLoja = aval ? getCustosLojaProcesso(aval.id) : 0;
        const custoRealOficinaCliente = aval ? getCustosClienteReal(aval.id) : 0;
        const custoPrevOficinaCliente = aval ? getCustosClientePrevisto(aval.id) : 0;
        const abatimentos = TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja;
        const precoEstoque = est.preco ?? 0;
        const valorVendaReal = atend.valor_venda ?? est.valor_venda ?? precoEstoque;
        const faturamentoRealizado = valorVendaReal + (custoPrevOficinaCliente - custoRealOficinaCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
        const valorFechamento = aval?.valor_fechamento ?? 0;
        const quantoVende = aval?.quanto_vende ?? 0;
        const margemPrevista = quantoVende - valorFechamento;
        const pctMargemPrevista = quantoVende > 0 ? margemPrevista / quantoVende : 0;
        const margemOficina = (custoPrevOficinaCliente - custoRealOficinaCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
        const margemRealizada = faturamentoRealizado - (valorFechamento + TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja);
        const pctMargemRealizada = faturamentoRealizado > 0 ? margemRealizada / faturamentoRealizado : 0;
        
        list.push({
          nomeCliente: atend.nome_cliente,
          vendedor: vendedorMap[atend.vendedor_id] || '-',
          tipo: est.tipo,
          modelo: `${est.marca} ${est.modelo}`,
          placa: est.placa || '-',
          situacao: atend.situacao,
          dataVenda: est.data_venda,
          quantoVende,
          valorFechamento,
          margemPrevista,
          pctMargemPrevista,
          valorVenda: atend.valor_venda ?? est.valor_venda ?? precoEstoque,
          margemOficina,
          abatimentos,
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
        const custoOficinaLojaExec = aval ? getCustosLojaOficinaExecutado(aval.id) : 0;
        const custoOficinaLojaPrev = aval ? getCustosLojaOficinaPrevisto(aval.id) : 0;
        const custoProcessoLoja = aval ? getCustosLojaProcesso(aval.id) : 0;
        const custoRealOficinaCliente = aval ? getCustosClienteReal(aval.id) : 0;
        const custoPrevOficinaCliente = aval ? getCustosClientePrevisto(aval.id) : 0;
        const abatimentos = TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja;
        const precoEstoque = est.preco ?? 0;
        const valorVendaReal = atend.valor_venda ?? est.valor_venda ?? precoEstoque;
        const faturamentoRealizado = valorVendaReal + (custoPrevOficinaCliente - custoRealOficinaCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
        const valorFechamento = aval?.valor_fechamento ?? 0;
        const quantoVende = aval?.quanto_vende ?? 0;
        const margemPrevista = quantoVende - valorFechamento;
        const pctMargemPrevista = quantoVende > 0 ? margemPrevista / quantoVende : 0;
        const margemOficina = (custoPrevOficinaCliente - custoRealOficinaCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
        const margemRealizada = faturamentoRealizado - (valorFechamento + TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja);
        const pctMargemRealizada = faturamentoRealizado > 0 ? margemRealizada / faturamentoRealizado : 0;

        list.push({
          nomeCliente: atend.nome_cliente,
          vendedor: vendedorMap[atend.vendedor_id] || '-',
          tipo: est.tipo,
          modelo: `${est.marca} ${est.modelo}`,
          placa: est.placa || '-',
          situacao: atend.situacao,
          dataSinal: atend.created_at,
          quantoVende,
          valorFechamento,
          margemPrevista,
          pctMargemPrevista,
          valorVenda: atend.valor_venda ?? est.valor_venda ?? precoEstoque,
          margemOficina,
          abatimentos,
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
        const valorVendaReal = atend.valor_venda ?? est.valor_venda ?? precoEstoque;
        const custoPrevCliente = getCustosClientePrevisto(aval.id);
        const custoRealCliente = getCustosClienteReal(aval.id);
        const custoOficinaLojaExec = getCustosLojaOficinaExecutado(aval.id);
        const custoOficinaLojaPrev = getCustosLojaOficinaPrevisto(aval.id);
        const custoProcessoLoja = getCustosLojaProcesso(aval.id);

        faturamentoPrevisto += quantoVende;
        totalQuantoVende += quantoVende;
        
        const fatReal = valorVendaReal + (custoPrevCliente - custoRealCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
        faturamentoRealizado += fatReal;
        totalPrecoEstoque += precoEstoque;

        margemPrevista += quantoVende - valorFechamento;

        margemRealizada += fatReal - (valorFechamento + TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja);
      });
    });

    const pctMargemPrevista = totalQuantoVende > 0 ? margemPrevista / totalQuantoVende : 0;
    const pctMargemRealizada = faturamentoRealizado > 0 ? margemRealizada / faturamentoRealizado : 0;

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
      // Faturamento por vendedor
      let faturamento = 0;
      vendVendas.forEach(a => {
        const estoques = estoqueByAtendimentoVenda[a.id] || [];
        estoques.forEach(e => {
          if (filterTipo !== 'todos' && e.tipo !== filterTipo) return;
          faturamento += e.preco || 0;
        });
      });
      return {
        nome: vendedorMap[vid] || 'Desconhecido',
        atendimentos: qtdAtend,
        vendas: qtdVendas,
        sinais: qtdSinais,
        conversao: qtdAtend > 0 ? qtdVendas / qtdAtend : 0,
        faturamento,
      };
    }).filter(v => v.atendimentos > 0 || v.vendas > 0 || v.sinais > 0);
  }, [filteredAtendimentos, atendimentosFiltradosPorData, vendidos, sinais, vendedorMap, estoqueByAtendimentoVenda, filterTipo]);

  // ===== Charts by custom month =====
  const chartByMonth = useMemo(() => {
    const months = generateCustomMonths();
    return months.map(m => {
      // Atendimentos in this month period (by created_at)
      const atendMonth = filteredAtendimentos.filter(a => {
        if (a.interesse !== 'comprar' && a.interesse !== 'trocar') return false;
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
          const valorVendaReal = atend.valor_venda ?? est.valor_venda ?? precoEstoque;
          const quantoVende = aval.quanto_vende ?? 0;
          const valorFechamento = aval.valor_fechamento ?? 0;
          const previsaoCustosLoja = aval.previsao_custos_loja ?? 0;
          const custoPrevCliente = getCustosClientePrevisto(aval.id);
          const custoRealCliente = getCustosClienteReal(aval.id);
          const custoOficinaLojaExec = getCustosLojaOficinaExecutado(aval.id);
          const custoOficinaLojaPrev = getCustosLojaOficinaPrevisto(aval.id);
          const custoProcessoLoja = getCustosLojaProcesso(aval.id);

          faturamento += valorVendaReal;
          totalQV += quantoVende;
          totalPE += precoEstoque;
          margemPrevista += quantoVende - valorFechamento;
          const fatReal = valorVendaReal + (custoPrevCliente - custoRealCliente) + (custoOficinaLojaPrev - custoOficinaLojaExec);
          margemRealizada += fatReal - (valorFechamento + TRANSFER_COST + custoOficinaLojaExec + custoProcessoLoja);
        });
      });

      const conversao = atendMonth.length > 0 ? vendidosMonth.length / atendMonth.length : 0;

      return {
        label: m.label,
        atendimentos: atendMonth.length,
        vendas: vendidosMonth.length,
        conversao,
        faturamento,
        pctMargemPrevista: totalQV > 0 ? margemPrevista / totalQV : 0,
        pctMargemRealizada: faturamento > 0 ? margemRealizada / faturamento : 0,
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
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      {/* Loja on left, Tipo on right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {['todos', '299', 'Ducati'].map(loja => (
            <Button
              key={loja}
              size="sm"
              variant={filterLoja === loja ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', filterLoja === loja && 'shadow-sm')}
              onClick={() => setFilterLoja(loja)}
            >
              {loja === 'todos' ? 'Todas Lojas' : loja}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Tipo:</span>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: 'todos', label: 'Todos' },
              { value: 'propria', label: 'Própria' },
              { value: 'consignada', label: 'Consignada' },
              { value: 'test-ride', label: 'Test-Ride' },
              { value: 'repasse', label: 'Repasse' },
            ].map(t => (
              <Button
                key={t.value}
                size="sm"
                variant={filterTipo === t.value ? 'default' : 'outline'}
                className={cn('rounded-full px-3 h-7 text-xs', filterTipo === t.value && 'shadow-sm')}
                onClick={() => setFilterTipo(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Atendimentos" value={indicadores.qtdAtendimentos} gradient="teal" icon={<Users className="h-5 w-5" />} />
        <IndicatorCard title="Vendas" value={indicadores.qtdVendas} gradient="teal" icon={<ShoppingCart className="h-5 w-5" />} />
        <IndicatorCard title="Sinais" value={indicadores.qtdSinais} gradient="teal" icon={<CreditCard className="h-5 w-5" />} />
        <IndicatorCard title="Taxa de Conversão" value={fmtPct(indicadores.taxaConversao)} gradient="teal" icon={<TrendingUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Faturamento Previsto" value={fmtBRL(indicadores.faturamentoPrevisto)} gradient="purple" icon={<DollarSign className="h-5 w-5" />} />
        <IndicatorCard title="Margem Prevista" value={`${fmtBRL(indicadores.margemPrevista)} (${fmtPct(indicadores.pctMargemPrevista)})`} gradient="purple" icon={<Target className="h-5 w-5" />} />
        <IndicatorCard title="Faturamento Realizado" value={fmtBRL(indicadores.faturamentoRealizado)} gradient="emerald" icon={<BarChart3 className="h-5 w-5" />} />
        <IndicatorCard title="Margem Realizada" value={`${fmtBRL(indicadores.margemRealizada)} (${fmtPct(indicadores.pctMargemRealizada)})`} gradient="emerald" icon={<PieChart className="h-5 w-5" />} />
      </div>

      {/* Section: Por Vendedor */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Vendedor</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Atendimentos" data={[...chartByVendedor].sort((a, b) => b.atendimentos - a.atendimentos)} dataKey="atendimentos" />
        <ChartCard title="Vendas" data={[...chartByVendedor].sort((a, b) => b.vendas - a.vendas)} dataKey="vendas" />
        <ChartCard title="Sinais" data={[...chartByVendedor].sort((a, b) => b.sinais - a.sinais)} dataKey="sinais" />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Taxa de Conversão (%)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={[...chartByVendedor].sort((a, b) => b.conversao - a.conversao)} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradConversao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F84" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="conversao" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradConversao)" dot={{ r: 5, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600, formatter: (v: number) => fmtPct(v) }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section: Resultado do Ano */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Resultado do Ano</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthChart title="Atendimentos" data={chartByMonth} dataKey="atendimentos" />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Vendas e Taxa de Conversão</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Vendas</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Conversão (%)</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#E8913A' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Line yAxisId="right" type="monotone" dataKey="conversao" name="Conversão (%)" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Faturamento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradFatMonth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F84" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip isCurrency />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="faturamento" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradFatMonth)" dot={{ r: 5, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 9, fill: 'hsl(var(--foreground))', fontWeight: 600, formatter: (v: number) => fmtBRL(v) }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Margem Prevista vs Realizada (%)</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Prevista</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Realizada</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                />
                <Line type="monotone" dataKey="pctMargemPrevista" name="Prevista" stroke="#7e6d9b" strokeWidth={2.5} dot={{ r: 4, fill: '#7e6d9b' }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v: number) => `${v.toFixed(1)}%` }} />
                <Line type="monotone" dataKey="pctMargemRealizada" name="Realizada" stroke="#3a8f6a" strokeWidth={2.5} dot={{ r: 4, fill: '#3a8f6a' }} label={{ position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v: number) => `${v.toFixed(1)}%` }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Listagem</h2>
        <Separator />
      </div>
      <Card>
        <CardContent className="pt-4">
          <Tabs value={listTab} onValueChange={setListTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="vendidas">Vendidas ({motosVendidas.length})</TabsTrigger>
              <TabsTrigger value="sinais">Com Sinal ({motosSinal.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="vendidas">
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <Table className="min-w-[900px]">
                  <TableHeader>
                     <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Data Venda</TableHead>
                      <TableHead className="text-right">Quanto Vende</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem Prev.</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">M. Oficina</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">Margem Real.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosVendidas.length === 0 ? (
                      <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Nenhuma moto vendida encontrada</TableCell></TableRow>
                    ) : motosVendidas.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(m.tipo)}`}>{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell className="text-xs">{m.dataVenda ? format(new Date(m.dataVenda), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.quantoVende)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemPrevista >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemPrevista)} ({((m.pctMargemPrevista ?? 0) * 100).toFixed(1)}%)</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className={`text-xs text-right ${m.margemOficina >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemOficina)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)} ({((m.pctMargemRealizada ?? 0) * 100).toFixed(1)}%)</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="sinais">
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <Table className="min-w-[900px]">
                  <TableHeader>
                     <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Data Sinal</TableHead>
                      <TableHead className="text-right">Quanto Vende</TableHead>
                      <TableHead className="text-right">V. Fechamento</TableHead>
                      <TableHead className="text-right">Margem Prev.</TableHead>
                      <TableHead className="text-right">Valor Venda</TableHead>
                      <TableHead className="text-right">M. Oficina</TableHead>
                      <TableHead className="text-right">Abatimentos</TableHead>
                      <TableHead className="text-right">Margem Real.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motosSinal.length === 0 ? (
                      <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Nenhuma moto com sinal encontrada</TableCell></TableRow>
                    ) : motosSinal.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.nomeCliente}</TableCell>
                        <TableCell className="text-xs">{m.vendedor}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(m.tipo)}`}>{tipoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell className="text-xs">{m.modelo}</TableCell>
                        <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                        <TableCell className="text-xs">{m.dataSinal ? format(new Date(m.dataSinal), 'dd/MM/yy') : '-'}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.quantoVende)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemPrevista >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemPrevista)} ({((m.pctMargemPrevista ?? 0) * 100).toFixed(1)}%)</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.valorVenda)}</TableCell>
                        <TableCell className={`text-xs text-right ${m.margemOficina >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemOficina)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(m.abatimentos)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${m.margemRealizada >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(m.margemRealizada)} ({((m.pctMargemRealizada ?? 0) * 100).toFixed(1)}%)</TableCell>
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
const iconColorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const IndicatorCard: React.FC<{ title: string; value: string | number; sub?: string; gradient?: string; icon?: React.ReactNode; subtitle?: string }> = ({ title, value, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const CustomTooltip = ({ active, payload, label, isCurrency }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {capitalize(entry.name)}: {isCurrency ? fmtBRL(entry.value) : typeof entry.value === 'number' && entry.value % 1 !== 0 ? `${entry.value.toFixed(1)}%` : entry.value}
        </p>
      ))}
    </div>
  );
};

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
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
          />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string; isCurrency?: boolean }> = ({ title, data, dataKey, isCurrency }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={isCurrency ? (v: number) => `${(v / 1000).toFixed(0)}k` : undefined} />
          <Tooltip content={<CustomTooltip isCurrency={isCurrency} />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
          />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props, isCurrency)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

export default RelatorioShowroom;
