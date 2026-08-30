import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fmtInt } from '@/lib/utils';
import { ESTOQUE_MOTO_SELECT, mapEstoqueMoto, fetchLojaMap } from '@/lib/estoqueMoto';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, CheckCircle, ShieldAlert, Ban, Wrench, Clock, DollarSign, TrendingDown, FileSpreadsheet, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Area } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import CidadeFilter, { CidadeFilterValue, matchesCidade } from '@/components/shared/CidadeFilter';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { getPreviousMonthDate } from '@/lib/reportComparison';
import DeltaBadge from './DeltaBadge';




const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${Math.round(v)}%`;

interface RelatorioEstoqueProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
  showFilters?: boolean;
}

type TipoFilter = 'todos' | 'propria' | 'consignada';

const RelatorioEstoque: React.FC<RelatorioEstoqueProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange, showFilters = true }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<any>({});
  const [indicadoresPrev, setIndicadoresPrev] = useState<any>({});
  const [chartByMonth, setChartByMonth] = useState<any[]>([]);
  const [motos, setMotos] = useState<any[]>([]);
  const [filterLoja, setFilterLojaState] = useState('todos');
  const [filterTipo, setFilterTipoState] = useState<TipoFilter>('todos');


  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };
  const setFilterTipo = (v: TipoFilter) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };

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
    const cutoffDate = dateTo ?? new Date();
    const prevCutoffDate = getPreviousMonthDate(cutoffDate)!;
    // Faixa expandida para cobrir cutoff atual e anterior num único fetch
    const upperCutoff = cutoffDate > prevCutoffDate ? cutoffDate : prevCutoffDate;
    const lowerCutoff = cutoffDate < prevCutoffDate ? cutoffDate : prevCutoffDate;
    const STATUSES = ['disponivel', 'servico', 'indisponivel_manual', 'bloqueio_juridico'];
    const PREP_STATUS = ['em_aberto', 'pendente', 'oficina', 'servico_externo'];

    const [estoqueRes, avaliacoesRes, lojaMap] = await Promise.all([
      fetchAllRange<any>(() => supabase
        .from('estoque_motos')
        .select(ESTOQUE_MOTO_SELECT)
        .in('status', STATUSES)
        .lte('created_at', upperCutoff.toISOString())
        .or(`data_venda.is.null,data_venda.gt.${lowerCutoff.toISOString()}`)
        .order('created_at', { ascending: false })),
      fetchAllRange(() => supabase
        .from('avaliacoes')
        .select('id, quanto_pede, created_at, situacao, preparacao_status')
        .in('situacao', ['adquirida', 'estoque'])),
      fetchLojaMap(),
    ]);

    let estoqueAll = (estoqueRes.data || []).map((r: any) => mapEstoqueMoto(r, lojaMap)) as any[];
    if (filterTipo !== 'todos') estoqueAll = estoqueAll.filter((m: any) => m.tipo === filterTipo);
    // Filtro de loja (cidade) — mesma lógica do RPC
    const estoqueFiltrado = estoqueAll.filter((m: any) => {
      const loja = (m.loja || '').toString();
      if (filterLoja === 'todos') return true;
      return matchesCidade(loja, filterLoja as CidadeFilterValue);
    });

    // Preparação (avaliacoes) — não depende de loja/tipo; média em dias varia por cutoff
    const prepRows = (avaliacoesRes.data || []).filter((a: any) => {
      const ps = a.preparacao_status || 'em_aberto';
      return PREP_STATUS.includes(ps);
    });

    const computeKpis = (cutoffMs: number) => {
      const active = estoqueFiltrado.filter((m: any) => {
        const entrada = m.data_entrada ? new Date(m.data_entrada).getTime() : 0;
        const venda = m.data_venda ? new Date(m.data_venda).getTime() : null;
        return entrada <= cutoffMs && (venda === null || venda > cutoffMs);
      });
      const total = active.length;
      const somaTotal = active.reduce((s, m) => s + (Number(m.preco) || 0), 0);
      const buildBlock = (st: string) => {
        const rows = active.filter(m => m.status === st);
        const qtd = rows.length;
        const soma = rows.reduce((s, m) => s + (Number(m.preco) || 0), 0);
        const mediaDias = qtd > 0
          ? Math.round(rows.reduce((s, m) => s + Math.max(0, (cutoffMs - new Date(m.data_entrada).getTime()) / 86400000), 0) / qtd)
          : 0;
        return {
          qtd,
          pct: total > 0 ? Math.round((qtd / total) * 1000) / 10 : 0,
          soma: Math.round(soma * 100) / 100,
          mediaDias,
        };
      };
      const mediaDiasAll = total > 0
        ? Math.round(active.reduce((s, m) => s + Math.max(0, (cutoffMs - new Date(m.data_entrada).getTime()) / 86400000), 0) / total)
        : 0;
      const disponivel = buildBlock('disponivel');
      const bloqueio = buildBlock('bloqueio_juridico');
      const servico = buildBlock('servico');
      const indisponivel = buildBlock('indisponivel_manual');
      const qtdPrep = prepRows.length;
      const somaQuantoPede = prepRows.reduce((s, a) => s + (Number(a.quanto_pede) || 0), 0);
      const mediaDiasPrep = qtdPrep > 0
        ? Math.round(prepRows.reduce((s, a) => s + Math.max(0, (cutoffMs - new Date(a.created_at).getTime()) / 86400000), 0) / qtdPrep)
        : 0;
      return {
        total,
        somaTotal: Math.round(somaTotal * 100) / 100,
        mediaDias: mediaDiasAll,
        disponivel, bloqueio, servico, indisponivel,
        qtdPreparacao: qtdPrep,
        somaQuantoPede: Math.round(somaQuantoPede * 100) / 100,
        mediaDiasPrep,
        patrimonioDisponivel: disponivel.soma,
        patrimonioParado: Math.round((bloqueio.soma + servico.soma + indisponivel.soma) * 100) / 100,
      };
    };

    setIndicadores(computeKpis(cutoffDate.getTime()));
    setIndicadoresPrev(computeKpis(prevCutoffDate.getTime()));
    setChartByMonth([]);

    // Lista de motos: apenas cutoff atual
    const cutoffMs = cutoffDate.getTime();
    const motosFiltradas = estoqueFiltrado.filter((m: any) => {
      const entrada = m.data_entrada ? new Date(m.data_entrada).getTime() : 0;
      const venda = m.data_venda ? new Date(m.data_venda).getTime() : null;
      return entrada <= cutoffMs && (venda === null || venda > cutoffMs);
    });
    setMotos(motosFiltradas);
    setLoading(false);
  }, [dateTo, filterLoja, filterTipo]);



  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    setLoading(true);
    loadData();
    const channel = supabase
      .channel('relatorio-estoque-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  // Mostrar todos os ciclos do ano (21/12 do ano anterior até o momento)
  const filteredChart = useMemo(() => chartByMonth, [chartByMonth]);

  const patrimonioGrowth = useMemo(() => {
    return filteredChart.map((m: any, idx: number) => {
      const prev = idx > 0 ? filteredChart[idx - 1].patrimonioDisp : 0;
      const crescimento = prev > 0 ? Math.round(((m.patrimonioDisp - prev) / prev) * 1000) / 10 : 0;
      return { ...m, crescimento };
    });
  }, [filteredChart]);

  const statusLabel = (s: string) => ({
    disponivel: 'Disponível', bloqueio_juridico: 'Bloqueio',
    servico: 'Serviço', indisponivel_manual: 'Indisponível',
  } as Record<string, string>)[s] || s;

  const buildRows = () => motos.map((m: any) => {
    const cutoffDate = dateTo ?? new Date();
    const entrada = m.data_entrada ? new Date(m.data_entrada) : null;
    const dias = entrada ? Math.max(0, Math.floor((cutoffDate.getTime() - entrada.getTime()) / 86400000)) : 0;
    const preco = Number(m.preco) || 0;
    const compra = Number(m.avaliacoes?.valor_fechamento) || 0;
    const margemAbs = preco - compra;
    const margemPct = compra > 0 ? (margemAbs / compra) * 100 : 0;
    const displayTipo = m.avaliacoes?.tipo_aquisicao || m.tipo;
    return {
      empresa: m.empresa || '', tipo: getTipoAquisicaoLabel(displayTipo) || '',
      patio: m.loja || '', dias, marca: m.marca || '', modelo: m.modelo || '',
      cor: m.cor || '', fabMod: [m.ano_fabricacao, m.ano_modelo].filter(Boolean).join('/'),
      placa: m.placa || '', entrada: entrada ? entrada.toLocaleDateString('pt-BR') : '',
      situacao: statusLabel(m.status), preco, compra, margemAbs, margemPct,
    };
  });

  const computeTotals = (rows: ReturnType<typeof buildRows>) => {
    const sum = (k: keyof typeof rows[number]) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const avg = (k: keyof typeof rows[number]) => rows.length ? sum(k) / rows.length : 0;
    const withCompra = rows.filter(r => (r.compra as number) > 0);
    const avgMargemPct = withCompra.length ? withCompra.reduce((s, r) => s + (r.margemPct as number), 0) / withCompra.length : 0;
    return {
      diasAvg: avg('dias'),
      precoSum: sum('preco'),
      compraSum: sum('compra'),
      margemAbsSum: sum('margemAbs'),
      margemPctAvg: avgMargemPct,
    };
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = buildRows();
    const t = computeTotals(rows);
    const aoa = [[
      'Empresa','Tipo','Pátio','Dias','Marca','Modelo','Cor','Fab/Mod','Placa','Entrada','Situação','Preço','Compra','Margem (R$)','Margem (%)',
    ], ...rows.map(r => [
      r.empresa, r.tipo, r.patio, r.dias, r.marca, r.modelo, r.cor, r.fabMod, r.placa, r.entrada, r.situacao,
      r.preco, r.compra || '', r.compra > 0 ? r.margemAbs : '', r.compra > 0 ? r.margemPct / 100 : '',
    ])];
    aoa.push([
      `TOTAL (${rows.length})`, '', '', Math.round(t.diasAvg), '', '', '', '', '', '', '',
      t.precoSum, t.compraSum, t.margemAbsSum, t.margemPctAvg / 100,
    ]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [10,12,12,6,12,22,12,10,10,11,13,14,14,14,10].map(w => ({ wch: w }));
    // Format currency and percent columns
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = 1; R <= range.e.r; R++) {
      ['L','M','N'].forEach(c => { const cell = ws[`${c}${R+1}`]; if (cell && typeof cell.v === 'number') cell.z = 'R$ #,##0.00'; });
      const pct = ws[`O${R+1}`]; if (pct && typeof pct.v === 'number') pct.z = '0.0%';
    }
    // Bold totals row
    const totalRow = range.e.r + 1;
    ['A','D','L','M','N','O'].forEach(c => { const cell = ws[`${c}${totalRow}`]; if (cell) cell.s = { font: { bold: true } }; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, `estoque_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const rows = buildRows();
    const t = computeTotals(rows);
    const cutoffStr = (dateTo ?? new Date()).toLocaleDateString('pt-BR');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`Motos em Estoque — ${rows.length} unidade(s)`, 40, 36);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Pátio: ${filterLoja === 'todos' ? 'Todos' : filterLoja}  •  Tipo: ${filterTipo === 'todos' ? 'Todos' : filterTipo}  •  Data base: ${cutoffStr}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [['Empresa','Tipo','Pátio','Dias','Marca','Modelo','Cor','Fab/Mod','Placa','Entrada','Situação','Preço','Compra','Margem']],
      body: rows.map(r => [
        r.empresa, r.tipo, r.patio, String(r.dias), r.marca, r.modelo, r.cor, r.fabMod, r.placa, r.entrada, r.situacao,
        fmtBRL(r.preco), r.compra > 0 ? fmtBRL(r.compra) : '—',
        r.compra > 0 ? `${fmtBRL(r.margemAbs)} (${r.margemPct.toFixed(1)}%)` : '—',
      ]),
      foot: [[
        `TOTAL (${rows.length})`, '', '', `Méd. ${Math.round(t.diasAvg)}`, '', '', '', '', '', '', '',
        fmtBRL(t.precoSum), fmtBRL(t.compraSum),
        `${fmtBRL(t.margemAbsSum)} (${t.margemPctAvg.toFixed(1)}%)`,
      ]],
      styles: { fontSize: 7, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [47, 111, 132], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [241, 244, 247], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        3: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' }, 13: { halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const r = rows[data.row.index];
        if (data.column.index === 13) {
          if (r.compra > 0) data.cell.styles.textColor = r.margemAbs >= 0 ? [58, 143, 106] : [220, 38, 38];
        }
        if (data.column.index === 10) {
          const map: Record<string, [number, number, number]> = {
            'Disponível': [34, 153, 84],
            'Bloqueio': [100, 116, 139],
            'Indisponível': [220, 38, 38],
            'Serviço': [234, 88, 12],
          };
          const c = map[r.situacao];
          if (c) { data.cell.styles.textColor = c; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      margin: { left: 20, right: 20 },
    });
    doc.save(`estoque_${new Date().toISOString().slice(0,10)}.pdf`);
  };



  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  const d = indicadores.disponivel || {};
  const b = indicadores.bloqueio || {};
  const s = indicadores.servico || {};
  const ind = indicadores.indisponivel || {};
  const dP = indicadoresPrev.disponivel || {};
  const bP = indicadoresPrev.bloqueio || {};
  const sP = indicadoresPrev.servico || {};
  const indP = indicadoresPrev.indisponivel || {};

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />

      {/* Filters: Loja (left) + Tipo (right) */}
      <div className={cn('flex-wrap items-start justify-between gap-3', showFilters ? 'flex' : 'hidden md:flex')}>
        <CidadeFilter value={filterLoja as CidadeFilterValue} onChange={(v) => setFilterLoja(v)} />
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          {([
            { value: 'todos', label: 'Todos' },
            { value: 'propria', label: 'Próprias' },
            { value: 'consignada', label: 'Consignadas' },
          ] as { value: TipoFilter; label: string }[]).map(b => (
            <Button key={b.value} size="sm" variant={filterTipo === b.value ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', filterTipo === b.value && 'shadow-sm')}
              onClick={() => setFilterTipo(b.value)}>
              {b.label}
            </Button>
          ))}
        </div>
      </div>


      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Motos no Estoque" value={fmtInt(indicadores.total ?? 0)} current={indicadores.total} previous={indicadoresPrev.total} subline={`Média: ${fmtInt(indicadores.mediaDias ?? 0)} dias (${fmtBRL(indicadores.somaTotal)})`} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Disponível" value={fmtInt(d.qtd ?? 0)} subtitle={`(${fmtPct(d.pct ?? 0)})`} current={d.qtd} previous={dP.qtd} subline={`Média: ${fmtInt(d.mediaDias ?? 0)} dias (${fmtBRL(d.soma)})`} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Bloqueio Jurídico" value={fmtInt(b.qtd ?? 0)} subtitle={`(${fmtPct(b.pct ?? 0)})`} current={b.qtd} previous={bP.qtd} subline={`Média: ${fmtInt(b.mediaDias ?? 0)} dias (${fmtBRL(b.soma)})`} gradient="gray" icon={<ShieldAlert className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Indisponível" value={fmtInt(ind.qtd ?? 0)} subtitle={`(${fmtPct(ind.pct ?? 0)})`} current={ind.qtd} previous={indP.qtd} subline={`Média: ${fmtInt(ind.mediaDias ?? 0)} dias (${fmtBRL(ind.soma)})`} gradient="red" icon={<Ban className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCardWithSub title="Serviço" value={fmtInt(s.qtd ?? 0)} subtitle={`(${fmtPct(s.pct ?? 0)})`} current={s.qtd} previous={sP.qtd} subline={`Média: ${fmtInt(s.mediaDias ?? 0)} dias (${fmtBRL(s.soma)})`} gradient="orange" icon={<Wrench className="h-5 w-5" />} />
        <IndicatorCardWithSub title="Em Preparação" value={fmtInt(indicadores.qtdPreparacao ?? 0)} current={indicadores.qtdPreparacao} previous={indicadoresPrev.qtdPreparacao} subline={`Média: ${fmtInt(indicadores.mediaDiasPrep ?? 0)} dias (${fmtBRL(indicadores.somaQuantoPede)})`} gradient="purple" icon={<Clock className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Disponível" value={fmtBRL(indicadores.patrimonioDisponivel)} current={indicadores.patrimonioDisponivel} previous={indicadoresPrev.patrimonioDisponivel} gradient="teal" icon={<DollarSign className="h-5 w-5" />} />
        <IndicatorCard title="Patrimônio Parado" value={fmtBRL(indicadores.patrimonioParado)} current={indicadores.patrimonioParado} previous={indicadoresPrev.patrimonioParado} gradient="red" icon={<TrendingDown className="h-5 w-5" />} />
      </div>

      {/* Section: Resultado do Ano — oculto por enquanto */}
      {false && (
        <>
          <div className="space-y-1 !mt-8">
            <h2 className="text-lg font-bold text-foreground">Resultado do Ano</h2>
            <Separator />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Card className="border shadow-sm rounded-xl">
              <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-semibold">Quantidade</CardTitle>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Disponíveis</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <ResponsiveContainer width="100%" height={isMobile ? 260 : 420}>
                  <ComposedChart data={filteredChart} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                    <defs>
                      <linearGradient id="dispGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2F6F84" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#2F6F84" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                    <Area type="monotone" dataKey="apenasDisponiveis" name="Disponíveis" stroke="#2F6F84" strokeWidth={2.5} fill="url(#dispGradient)" dot={{ r: 4, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>
        </>
      )}


      {/* Section: Lista de Motos em Estoque */}
      <div className="space-y-1 !mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Motos em Estoque ({motos.length})</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportExcel} disabled={motos.length === 0} title="Baixar Excel">
              <FileSpreadsheet className="h-4 w-4 text-[#3a8f6a]" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportPdf} disabled={motos.length === 0} title="Baixar PDF (paisagem)">
              <FileDown className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </div>
        <Separator />
      </div>
      <Card className="border shadow-sm rounded-xl">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Empresa</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Pátio</TableHead>
                <TableHead className="text-xs text-right">Dias</TableHead>
                <TableHead className="text-xs">Marca</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Cor</TableHead>
                <TableHead className="text-xs">Fab/Mod</TableHead>
                <TableHead className="text-xs">Placa</TableHead>
                <TableHead className="text-xs">Entrada</TableHead>
                <TableHead className="text-xs">Situação</TableHead>
                <TableHead className="text-xs text-right">Preço</TableHead>
                <TableHead className="text-xs text-right">Compra</TableHead>
                <TableHead className="text-xs text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {motos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground text-sm py-6">
                    Nenhuma moto encontrada com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                motos.map((m: any) => {
                  const cutoffDate = dateTo ?? new Date();
                  const entrada = m.data_entrada ? new Date(m.data_entrada) : null;
                  const dias = entrada ? Math.max(0, Math.floor((cutoffDate.getTime() - entrada.getTime()) / 86400000)) : 0;
                  const preco = Number(m.preco) || 0;
                  const compra = Number(m.avaliacoes?.valor_fechamento) || 0;
                  const margemAbs = preco - compra;
                  const margemPct = compra > 0 ? (margemAbs / compra) * 100 : 0;
                  const anoFM = [m.ano_fabricacao, m.ano_modelo].filter(Boolean).join('/');
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{m.empresa || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const displayTipo = m.avaliacoes?.tipo_aquisicao || m.tipo;
                          return displayTipo ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTipoAquisicaoBadgeClass(displayTipo)}`}>
                              {getTipoAquisicaoLabel(displayTipo)}
                            </Badge>
                          ) : '—';
                        })()}
                      </TableCell>
                      <TableCell className="text-xs">{m.loja || '—'}</TableCell>
                      <TableCell className="text-xs text-right">{dias}</TableCell>
                      <TableCell className="text-xs">{m.marca || '—'}</TableCell>
                      <TableCell className="text-xs">{m.modelo || '—'}</TableCell>
                      <TableCell className="text-xs">{m.cor || '—'}</TableCell>
                      <TableCell className="text-xs">{anoFM || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{m.placa || '—'}</TableCell>
                      <TableCell className="text-xs">{entrada ? entrada.toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const map: Record<string, { label: string; cls: string }> = {
                            disponivel: { label: 'Disponível', cls: 'border-green-500 text-green-600' },
                            bloqueio_juridico: { label: 'Bloqueio', cls: 'border-gray-500 text-gray-600' },
                            servico: { label: 'Serviço', cls: 'border-orange-500 text-orange-600' },
                            indisponivel_manual: { label: 'Indisponível', cls: 'border-red-500 text-red-600' },
                          };
                          const s = map[m.status];
                          return s ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${s.cls}`}>{s.label}</Badge>
                          ) : '—';
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-right">{fmtBRL(preco)}</TableCell>
                      <TableCell className="text-xs text-right">{compra > 0 ? fmtBRL(compra) : '—'}</TableCell>
                      <TableCell className={cn('text-xs text-right font-medium', compra > 0 ? (margemAbs >= 0 ? 'text-[#3a8f6a]' : 'text-red-500') : 'text-muted-foreground')}>
                        {compra > 0 ? `${fmtBRL(margemAbs)} (${margemPct.toFixed(1)}%)` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
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
  red: 'bg-red-500/10 text-red-500',
  orange: 'bg-orange-500/10 text-orange-500',
  gray: 'bg-gray-500/10 text-gray-500',
};

const IndicatorCard: React.FC<{ title: string; value: string | number; subline?: string; current?: number | null; previous?: number | null; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subline, current, previous, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[100px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
          {subline && <p className="text-xs text-muted-foreground truncate">{subline}</p>}
          <DeltaBadge current={current} previous={previous} className="mt-1" />
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const IndicatorCardWithSub: React.FC<{ title: string; value: string | number; subtitle?: string; subline?: string; current?: number | null; previous?: number | null; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subtitle, subline, current, previous, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[100px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1 text-base text-muted-foreground">{subtitle}</span>}</p>
          {subline && <p className="text-xs text-muted-foreground truncate">{subline}</p>}
          <DeltaBadge current={current} previous={previous} className="mt-1" />
        </div>
        {icon && <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', iconColorMap[gradient] || iconColorMap.teal)}>{icon}</div>}
      </div>
    </CardContent>
  </Card>
);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {capitalize(entry.name)}: {entry.dataKey === 'giro' ? `${entry.value}%` : entry.value}
        </p>
      ))}
    </div>
  );
};

const PatrimonioTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color, margin: 0 }}>
          {capitalize(entry.name)}: {entry.dataKey === 'crescimento' ? `${entry.value}%` : fmtBRL(entry.value)}
        </p>
      ))}
    </div>
  );
};

export default RelatorioEstoque;
