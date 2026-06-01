import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, CheckCircle, Clock, Package, FileSpreadsheet, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass, isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import { Badge } from '@/components/ui/badge';
import { PREPARACAO_COLUMNS } from '@/types/crm';
import CidadeFilter, { CidadeFilterValue, matchesCidade } from '@/components/shared/CidadeFilter';
import { getPreviousPeriod } from '@/lib/reportComparison';
import DeltaBadge from './DeltaBadge';

interface Props {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
}

const matchesLoja = (loja: string, filter: string) =>
  matchesCidade(loja, (filter || 'todos') as CidadeFilterValue);

type TipoFilter = 'todos' | 'propria' | 'consignada';

const fmtDate = (iso: string | null | undefined) => iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '-';
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
// Diferença em ms entre duas datas, desconsiderando os domingos (00:00 a 23:59:59)
const diffExcludingSundays = (startMs: number, endMs: number): number => {
  if (endMs <= startMs) return 0;
  let total = endMs - startMs;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < endMs) {
    if (cursor.getDay() === 0) {
      const dayStart = cursor.getTime();
      const dayEnd = dayStart + 86400000;
      const overlapStart = Math.max(startMs, dayStart);
      const overlapEnd = Math.min(endMs, dayEnd);
      if (overlapEnd > overlapStart) total -= (overlapEnd - overlapStart);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, total);
};

const fmtDuration = (ms: number | null) => {
  if (ms == null || !isFinite(ms) || ms < 0) return '-';
  const hours = ms / 3600000;
  const days = hours / 24;
  return `${fmtInt(hours)}h (${fmtInt(days)} Dias)`;
};

const STATUS_LABELS: Record<string, { label: string; hex: string }> = {
  em_aberto: { label: 'Em Aberto', hex: '#2EC5FF' },
  pendente: { label: 'Pendente', hex: '#da6220' },
  oficina: { label: 'Oficina', hex: '#b376c4' },
  servico_externo: { label: 'Serviço Externo', hex: '#E91E63' },
  aguardando_aceite: { label: 'Aguardando Aceite', hex: '#FF8C00' },
  aguardando_liberacao_estoque: { label: 'Aguardando Liberação', hex: '#607D8B' },
  estoque: { label: 'Em Estoque', hex: '#169d53' },
};

function getCycleBuckets(): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  let cur = new Date(2026, 2, 21); // 21/03/2026
  const now = new Date();
  while (cur <= now) {
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 20, 23, 59, 59, 999);
    const label = `${format(cur, 'dd/MM')} - ${format(end, 'dd/MM')}`;
    buckets.push({ label, start: new Date(cur), end });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 21);
  }
  return buckets;
}

const RelatorioPreparacao: React.FC<Props> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 280;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipoState] = useState<TipoFilter>('todos');
  const [filterLoja, setFilterLojaState] = useState<string>('todos');
  const [rows, setRows] = useState<any[]>([]);

  const setFilterTipo = (v: TipoFilter) => { setFilterTipoState(v); onFilterChange?.(filterLoja, v); };
  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v, filterTipo); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterTipoState('todos');
      setFilterLojaState('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    // Fetch avaliacoes that reached preparation flow (situacao adquirida or estoque)
    const avalRes = await fetchAllRange<any>(() => supabase
      .from('avaliacoes')
      .select('id, moto_avaliacao_id, atendimento_id, tipo_aquisicao, situacao, preparacao_status, atendimentos!inner(id, nome_cliente, loja), motos_avaliacao!inner(id, marca, modelo, placa)')
      .in('situacao', ['adquirida', 'estoque', 'perdido'])
    );
    const avals = (avalRes.data || []);

    const avalIds = avals.map((a: any) => a.id);
    const motoIds = avals.map((a: any) => a.moto_avaliacao_id).filter(Boolean);
    const atendimentoIds = avals.map((a: any) => a.atendimento_id).filter(Boolean);
    const allEntityIds = Array.from(new Set([...avalIds, ...motoIds, ...atendimentoIds]));

    if (allEntityIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // status_history in chunks (in() can be heavy)
    const chunks: string[][] = [];
    for (let i = 0; i < allEntityIds.length; i += 200) chunks.push(allEntityIds.slice(i, i + 200));
    const histResults = await Promise.all(chunks.map(chunk =>
      fetchAllRange<any>(() => supabase.from('status_history')
        .select('entity_id, entity_type, status, created_at')
        .in('entity_type', ['avaliacao', 'preparacao', 'showroom'])
        .in('entity_id', chunk))
    ));
    const allHist = histResults.flatMap(r => r.data || []);

    // Group history by entity_id
    const histByEntity: Record<string, any[]> = {};
    allHist.forEach((h: any) => {
      (histByEntity[h.entity_id] ||= []).push(h);
    });

    const result = avals.map((a: any) => {
      const histAval = histByEntity[a.id] || [];
      const histMoto = a.moto_avaliacao_id ? (histByEntity[a.moto_avaliacao_id] || []) : [];
      const histAtendimento = a.atendimento_id ? (histByEntity[a.atendimento_id] || []) : [];

      // Data de aquisição: avaliações usam 'adquirida'; parte de pagamento/troca herda o 'vendido' do Showroom
      const adquiridas = [...histAval, ...histMoto, ...histAtendimento]
        .filter(h =>
          (h.entity_type === 'avaliacao' && h.status === 'adquirida') ||
          (h.entity_type === 'showroom' && h.status === 'vendido')
        )
        .map(h => h.created_at).sort();
      const dataAquisicao = adquiridas.length ? adquiridas[adquiridas.length - 1] : null;

      // Preparação history (entity_type='preparacao' em avaliacao_id OU moto_avaliacao_id)
      const prepHist = [...histAval, ...histMoto]
        .filter(h => h.entity_type === 'preparacao')
        .sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());

      // Última despausa = último 'pendencia_concluida' (reenviada_preparacao NÃO conta)
      const resets = prepHist
        .filter(h => h.status === 'pendencia_concluida')
        .map(h => h.created_at);
      const ultimaDespausa = resets.length ? resets[resets.length - 1] : null;

      // Data Entrada Preparação = última despausa OU data de aquisição
      const dataEntradaPrep = ultimaDespausa || dataAquisicao;

      // Data de preparação = última 'repreparacao_concluida' (se houver, independente de despausa) OU primeira 'aguardando_aceite' após dataEntradaPrep
      const repreps = prepHist.filter(h => h.status === 'repreparacao_concluida').map(h => h.created_at);
      const aceites = prepHist.filter(h => h.status === 'aguardando_aceite' &&
        (!dataEntradaPrep || new Date(h.created_at) >= new Date(dataEntradaPrep))).map(h => h.created_at);
      const dataPreparacao = repreps.length ? repreps[repreps.length - 1] : (aceites.length ? aceites[0] : null);

      // Data de liberação = primeira 'estoque' após dataEntradaPrep
      const liberacoes = prepHist.filter(h => h.status === 'estoque' &&
        (!dataEntradaPrep || new Date(h.created_at) >= new Date(dataEntradaPrep))).map(h => h.created_at);
      const dataLiberacao = liberacoes.length ? liberacoes[0] : null;

      const tempoPrepMs = dataPreparacao && dataEntradaPrep ? diffExcludingSundays(new Date(dataEntradaPrep).getTime(), new Date(dataPreparacao).getTime()) : null;
      const tempoLibMs = dataLiberacao && dataEntradaPrep ? diffExcludingSundays(new Date(dataEntradaPrep).getTime(), new Date(dataLiberacao).getTime()) : null;

      const tipoNorm = (a.tipo_aquisicao || '').toLowerCase();
      const tipoCat: 'propria' | 'consignada' = ['consignada', 'consignacao'].includes(tipoNorm) ? 'consignada' : 'propria';

      return {
        id: a.id,
        nomeCliente: a.atendimentos?.nome_cliente || '-',
        loja: a.atendimentos?.loja || '-',
        modelo: [a.motos_avaliacao?.marca, a.motos_avaliacao?.modelo].filter(Boolean).join(' '),
        placa: a.motos_avaliacao?.placa || '-',
        tipo: a.tipo_aquisicao,
        tipoCat,
        statusPrep: a.preparacao_status || 'em_aberto',
        situacao: a.situacao,
        dataAquisicao,
        dataEntradaPrep,
        dataPreparacao,
        dataLiberacao,
        tempoPrepMs,
        tempoLibMs,
      };
    });

    // Para perdidos (retiradas), só inclui se houve preparação concluída
    setRows(result.filter(r => r.situacao !== 'perdido' || !!r.dataPreparacao));
    setLoading(false);
  }, []);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 500);
  }, [loadData]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('relatorio-preparacao-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  // Apply filters: loja + tipo + period (data de preparação dentro do range)
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (!matchesLoja(r.loja, filterLoja)) return false;
      if (filterTipo !== 'todos' && r.tipoCat !== filterTipo) return false;
      if (dateFrom && r.dataPreparacao && new Date(r.dataPreparacao) < dateFrom) return false;
      if (dateTo && r.dataPreparacao && new Date(r.dataPreparacao) > dateTo) return false;
      // If no dataPreparacao, only include when no period is set
      if (!r.dataPreparacao && (dateFrom || dateTo)) return false;
      return true;
    }).sort((a, b) => {
      const ta = a.dataPreparacao ? new Date(a.dataPreparacao).getTime() : Infinity;
      const tb = b.dataPreparacao ? new Date(b.dataPreparacao).getTime() : Infinity;
      return ta - tb;
    });
  }, [rows, filterLoja, filterTipo, dateFrom, dateTo]);

  const computeKpis = (df: Date | undefined, dt: Date | undefined) => {
    const filtered = rows.filter(r => {
      if (!matchesLoja(r.loja, filterLoja)) return false;
      if (filterTipo !== 'todos' && r.tipoCat !== filterTipo) return false;
      if (df && r.dataPreparacao && new Date(r.dataPreparacao) < df) return false;
      if (dt && r.dataPreparacao && new Date(r.dataPreparacao) > dt) return false;
      if (!r.dataPreparacao && (df || dt)) return false;
      return true;
    });
    const preparadas = filtered.filter(r => r.dataPreparacao);
    const liberadas = filtered.filter(r => r.dataLiberacao);
    const tempoPrepValid = preparadas.map(r => r.tempoPrepMs).filter((v): v is number => v != null && v >= 0);
    const tempoLibValid = liberadas.map(r => r.tempoLibMs).filter((v): v is number => v != null && v >= 0);
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    return {
      qtdPreparadas: preparadas.length,
      tempoMedioPrep: avg(tempoPrepValid),
      qtdLiberadas: liberadas.length,
      tempoMedioLib: avg(tempoLibValid),
    };
  };

  const kpis = useMemo(() => {
    const base = computeKpis(dateFrom, dateTo);
    const emPreparacao = rows.filter(r =>
      matchesLoja(r.loja, filterLoja) &&
      (filterTipo === 'todos' || r.tipoCat === filterTipo) &&
      r.situacao !== 'perdido' &&
      r.statusPrep !== 'estoque'
    ).length;
    return { emPreparacao, ...base };
  }, [filteredRows, rows, filterLoja, filterTipo, dateFrom, dateTo]);

  const kpisPrev = useMemo(() => {
    const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
    if (!prevFrom || !prevTo) return null;
    return computeKpis(prevFrom, prevTo);
  }, [rows, filterLoja, filterTipo, dateFrom, dateTo]);

  // Charts: ciclos a partir de 21/03
  const chartData = useMemo(() => {
    // Use rows filtered by loja + tipo (not by period) for monthly chart
    const baseFiltered = rows.filter(r => matchesLoja(r.loja, filterLoja) && (filterTipo === 'todos' || r.tipoCat === filterTipo));
    const buckets = getCycleBuckets();
    return buckets.map(b => {
      const prep = baseFiltered.filter(r => r.dataPreparacao && new Date(r.dataPreparacao) >= b.start && new Date(r.dataPreparacao) <= b.end);
      const lib = baseFiltered.filter(r => r.dataLiberacao && new Date(r.dataLiberacao) >= b.start && new Date(r.dataLiberacao) <= b.end);
      const tempoPrep = prep.map(r => r.tempoPrepMs).filter((v): v is number => v != null && v >= 0);
      const tempoLib = lib.map(r => r.tempoLibMs).filter((v): v is number => v != null && v >= 0);
      const avgMs = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const msPrep = avgMs(tempoPrep);
      const msLib = avgMs(tempoLib);
      return {
        label: b.label,
        qtdPrep: prep.length,
        diasPrep: Math.round(msPrep / 86400000),
        horasPrep: Math.round(msPrep / 3600000),
        qtdLib: lib.length,
        diasLib: Math.round(msLib / 86400000),
        horasLib: Math.round(msLib / 3600000),
      };
    });
  }, [rows, filterLoja, filterTipo]);

  const buildExportRows = () => filteredRows.map(r => {
    const statusLabel = r.dataLiberacao ? 'Estoque' : 'Ag. Liberar';
    const tipoExport = r.situacao === 'perdido' ? 'Retirada' : (r.tipo ? getTipoAquisicaoLabel(r.tipo) : '-');
    return {
      cliente: r.nomeCliente, modelo: r.modelo, placa: (r.placa || '').replace(/-/g, ''),
      tipo: tipoExport,
      entrada: r.dataEntradaPrep ? format(new Date(r.dataEntradaPrep), 'dd/MM/yyyy HH:mm') : '-',
      status: statusLabel,
      preparacao: r.dataPreparacao ? format(new Date(r.dataPreparacao), 'dd/MM/yyyy HH:mm') : '-',
      tempoPrep: fmtDuration(r.tempoPrepMs),
      liberacao: r.dataLiberacao ? format(new Date(r.dataLiberacao), 'dd/MM/yyyy HH:mm') : '-',
      tempoLib: fmtDuration(r.tempoLibMs),
    };
  });

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = buildExportRows();
    const aoa = [[
      'Cliente','Modelo','Placa','Tipo','Entrada','Status','Preparação','Tempo Prep.','Liberação','Tempo Lib.',
    ], ...rows.map(r => [r.cliente, r.modelo, r.placa, r.tipo, r.entrada, r.status, r.preparacao, r.tempoPrep, r.liberacao, r.tempoLib])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [22,26,10,12,18,12,18,16,18,16].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Preparação');
    XLSX.writeFile(wb, `preparacao_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const rows = buildExportRows();
    const periodo = (dateFrom || dateTo)
      ? `${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : '...'} a ${dateTo ? format(dateTo, 'dd/MM/yyyy') : '...'}`
      : 'Todos';
    doc.setFontSize(14); doc.setTextColor(30, 41, 59);
    doc.text(`Motos Preparadas — ${rows.length} registro(s)`, 40, 36);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Loja: ${filterLoja === 'todos' ? 'Todas' : filterLoja}  •  Tipo: ${filterTipo === 'todos' ? 'Todos' : filterTipo}  •  Período: ${periodo}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [['Cliente','Modelo','Placa','Tipo','Entrada','Status','Preparação','Tempo Prep.','Liberação','Tempo Lib.']],
      body: rows.map(r => [r.cliente, r.modelo, r.placa, r.tipo, r.entrada, r.status, r.preparacao, r.tempoPrep, r.liberacao, r.tempoLib]),
      styles: { fontSize: 7, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [47, 111, 132], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index === 5) {
          const r = rows[data.row.index];
          const c: [number, number, number] = r.status === 'Estoque' ? [22, 157, 83] : [96, 125, 139];
          data.cell.styles.textColor = c;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 20, right: 20 },
    });
    doc.save(`preparacao_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;

  const tipoBtns: { value: TipoFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'propria', label: 'Próprias' },
    { value: 'consignada', label: 'Consignadas' },
  ];

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />

      {/* Filters: Loja (left) + Tipo (right) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CidadeFilter value={filterLoja as CidadeFilterValue} onChange={(v) => setFilterLoja(v)} />
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          {tipoBtns.map(b => (
            <Button key={b.value} size="sm" variant={filterTipo === b.value ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', filterTipo === b.value && 'shadow-sm')}
              onClick={() => setFilterTipo(b.value)}>
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Em Preparação" value={fmtInt(kpis.emPreparacao)} icon={<Wrench className="h-5 w-5" />} color="orange" />
        <KpiCard title="Motos Preparadas" value={fmtInt(kpis.qtdPreparadas)} current={kpis.qtdPreparadas} previous={kpisPrev?.qtdPreparadas} icon={<CheckCircle className="h-5 w-5" />} color="teal" />
        <KpiCard title="Tempo Preparação" value={fmtDuration(kpis.tempoMedioPrep)} current={kpis.tempoMedioPrep ?? 0} previous={kpisPrev?.tempoMedioPrep ?? undefined} invert icon={<Clock className="h-5 w-5" />} color="teal" />
        <KpiCard title="Motos Liberadas" value={fmtInt(kpis.qtdLiberadas)} current={kpis.qtdLiberadas} previous={kpisPrev?.qtdLiberadas} icon={<CheckCircle className="h-5 w-5" />} color="emerald" />
        <KpiCard title="Tempo Liberação" value={fmtDuration(kpis.tempoMedioLib)} current={kpis.tempoMedioLib ?? 0} previous={kpisPrev?.tempoMedioLib ?? undefined} invert icon={<Clock className="h-5 w-5" />} color="emerald" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 !mt-6">
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Preparação</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Tempo de Preparação</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={chartData} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradPrep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F6F84" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#2F6F84" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="diasPrep" name="Tempo de Preparação" stroke="#2F6F84" strokeWidth={2.5} fill="url(#gradPrep)" dot={{ r: 3, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Liberadas</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#3a8f6a' }} />Tempo de Liberação</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <AreaChart data={chartData} margin={{ top: 16, right: 10, left: -10, bottom: chartMarginBottom }}>
                <defs>
                  <linearGradient id="gradLib" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3a8f6a" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#3a8f6a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="diasLib" name="Tempo de Liberação" stroke="#3a8f6a" strokeWidth={2.5} fill="url(#gradLib)" dot={{ r: 3, fill: '#3a8f6a', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="space-y-1 !mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Motos Preparadas</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportExcel} disabled={filteredRows.length === 0} title="Baixar Excel">
              <FileSpreadsheet className="h-4 w-4 text-[#3a8f6a]" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportPdf} disabled={filteredRows.length === 0} title="Baixar PDF (paisagem)">
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
                <TableHead>Cliente</TableHead>
                <TableHead className="max-w-[220px]">Modelo</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Preparação</TableHead>
                <TableHead>Tempo Prep.</TableHead>
                <TableHead>Liberação</TableHead>
                <TableHead>Tempo Lib.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
              ) : filteredRows.map(r => {
                const status = r.dataLiberacao
                  ? { label: 'Estoque', hex: '#169d53' }
                  : { label: 'Ag. Liberar', hex: '#607D8B' };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.nomeCliente}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={r.modelo}>{r.modelo}</TableCell>
                    <TableCell className="text-xs font-mono">{(r.placa || '').replace(/-/g, '')}</TableCell>
                    <TableCell>
                      {r.situacao === 'perdido' ? (
                        <Badge variant="outline" className="text-[10px] border-red-400 text-red-600 bg-transparent">Retirada</Badge>
                      ) : (
                        r.tipo && <Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(r.tipo)}`}>{getTipoAquisicaoLabel(r.tipo)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataEntradaPrep)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] whitespace-nowrap" style={{ borderColor: status.hex, color: status.hex }}>{status.label}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataPreparacao)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDuration(r.tempoPrepMs)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.dataLiberacao)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDuration(r.tempoLibMs)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const colorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
  orange: 'bg-orange-500/10 text-orange-500',
};

const KpiCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; current?: number; previous?: number; invert?: boolean }> = ({ title, value, icon, color, current, previous, invert }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[80px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}</p>
          {current !== undefined && previous !== undefined && (
            <DeltaBadge current={current} previous={previous} invert={invert} />
          )}
        </div>
        <div className={cn('ml-2 p-2 rounded-lg flex-shrink-0', colorMap[color] || colorMap.teal)}>{icon}</div>
      </div>
    </CardContent>
  </Card>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Período: {label}</p>
      {payload.map((entry: any, i: number) => {
        const dk = entry.dataKey;
        if (dk === 'diasPrep' || dk === 'diasLib') {
          const isPrep = dk === 'diasPrep';
          const hours = entry.payload?.[isPrep ? 'horasPrep' : 'horasLib'] ?? 0;
          const qtd = entry.payload?.[isPrep ? 'qtdPrep' : 'qtdLib'] ?? 0;
          const qtdLabel = isPrep ? 'Preparadas' : 'Liberadas';
          return (
            <div key={i} style={{ color: entry.color }}>
              <p style={{ margin: 0 }}>{qtdLabel}: {fmtInt(qtd)}</p>
              <p style={{ margin: 0 }}>Tempo: {fmtInt(hours)}h ({fmtInt(entry.value)} Dias)</p>
            </div>
          );
        }
        return (
          <p key={i} style={{ color: entry.color, margin: 0 }}>
            {entry.name}: {String(entry.value)}
          </p>
        );
      })}
    </div>
  );
};

export default RelatorioPreparacao;
