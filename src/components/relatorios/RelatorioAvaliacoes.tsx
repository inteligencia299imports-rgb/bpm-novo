import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { flattenMarcaModelo } from '@/lib/marcaModelo';
import { BPM_PROJETO_ID } from '@/lib/projeto';
import { abbreviateName, fmtInt, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, CheckCircle, ArrowDownUp, ArrowRightLeft, XCircle, ArrowDownToLine, Repeat, Package, FileSpreadsheet, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { getPreviousPeriod } from '@/lib/reportComparison';
import { getCycleForDate } from '@/lib/reportCycle';
import { useIsMobile } from '@/hooks/use-mobile';
import { LojaFilter } from './LojaFilter';
import DeltaBadge from './DeltaBadge';
import { format } from 'date-fns';

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number | null | undefined) => {
  const raw = (v ?? 0) * 100;
  return `${(Math.round(raw * 10) / 10).toFixed(1)}%`;
};
const tipoDisplayLabel = (t: string) => {
  const map: Record<string, string> = { propria: 'Própria', consignada: 'Consignada', 'test-ride': 'Test-Ride', repasse: 'Repasse', convertida: 'Convertida' };
  return map[t] || t;
};
const lojaLabel = (loja: string | null) => {
  if (!loja) return '-';
  return loja.toLowerCase().split(/\s+/).map((p) => (['bsb', 'poa', 'fln'].includes(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
};

interface RelatorioAvaliacoesProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string) => void;
  showFilters?: boolean;
}

// -------- helpers puros --------
const stripAccents = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normTipo = (raw: string | null | undefined): 'propria' | 'consignada' | 'convertida' | 'test-ride' | 'repasse' => {
  const t = stripAccents((raw || '').trim().toLowerCase());
  if (!t || t === 'propria') return 'propria';
  if (['consignada', 'consignacao', 'consignado'].includes(t)) return 'consignada';
  if (['convertida', 'convertido'].includes(t)) return 'convertida';
  if (['test-ride', 'test ride', 'testride'].includes(t)) return 'test-ride';
  if (t === 'repasse') return 'repasse';
  return 'propria';
};

const isDucati = (loja: string | null | undefined) => (loja || '').toUpperCase().includes('DUCATI');
const normLojaGroup = (loja: string | null | undefined): '299' | 'Ducati' => (isDucati(loja) ? 'Ducati' : '299');

/** Aceita 'todos' | '299' | 'Ducati' | sub-loja exata */
const matchesLoja = (loja: string | null | undefined, filter: string) => {
  if (!filter || filter === 'todos') return true;
  if (filter === '299' || filter === 'Ducati') return normLojaGroup(loja) === filter;
  return (loja || '') === filter;
};

const inRange = (iso: string | null | undefined, from: Date | undefined, to: Date | undefined) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
};

interface AvalRow {
  id: string;
  avaliadorId: string | null;
  tipoNorm: ReturnType<typeof normTipo>;
  situacao: string | null;
  interesse: string | null;
  loja: string | null;
  createdAt: string;
  dataAquisicao: string | null;
  nomeCliente: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  quantoVende: number;
  valorFechamento: number;
  valorBonus: number;
  previsaoCusto: number;
  custosRealizados: number;
}

interface KpiSet {
  total_avaliacoes: number;
  total_aquisicoes: number;
  aquisicoes_propria: number;
  aquisicoes_consignada: number;
  aquisicoes_convertida: number;
  entrada_direta: number;
  troca: number;
  retiradas: number;
}

const emptyKpis = (): KpiSet => ({
  total_avaliacoes: 0, total_aquisicoes: 0,
  aquisicoes_propria: 0, aquisicoes_consignada: 0, aquisicoes_convertida: 0,
  entrada_direta: 0, troca: 0, retiradas: 0,
});

const computeKpis = (rows: AvalRow[], loja: string, from: Date | undefined, to: Date | undefined): KpiSet => {
  const kpi = emptyKpis();
  for (const r of rows) {
    if (!matchesLoja(r.loja, loja)) continue;

    // avaliações contadas pela created_at
    const inAval = (!from || new Date(r.createdAt) >= from) && (!to || new Date(r.createdAt) <= to);
    if (inAval) {
      kpi.total_avaliacoes += 1;
      if (r.situacao === 'retirada') kpi.retiradas += 1;
    }
    // aquisições: INNER JOIN status_history (status='adquirida') filtrado por s.created_at
    if (r.dataAquisicao && inRange(r.dataAquisicao, from, to)) {
      kpi.total_aquisicoes += 1;
      if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) kpi.aquisicoes_propria += 1;
      if (r.tipoNorm === 'consignada') kpi.aquisicoes_consignada += 1;
      if (r.tipoNorm === 'convertida') kpi.aquisicoes_convertida += 1;
      if (r.interesse === 'vender') kpi.entrada_direta += 1;
      if (r.interesse === 'trocar') kpi.troca += 1;
    }
  }
  return kpi;
};

// Ciclos "Resultado do Ano" — começam em 21/12/2025 até hoje
function getYearBuckets(): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  let cursor = new Date(2025, 11, 21); // 21/12/2025
  const now = new Date();
  let guard = 0;
  while (cursor <= now && guard++ < 120) {
    const cycle = getCycleForDate(cursor);
    buckets.push({
      label: `${format(cycle.start, 'dd/MM')} - ${format(cycle.end, 'dd/MM')}`,
      start: new Date(cycle.start),
      end: new Date(cycle.end),
    });
    cursor = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate() + 1, 0, 0, 0, 0);
  }
  return buckets;
}

const RelatorioAvaliacoes: React.FC<RelatorioAvaliacoesProps> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange, showFilters = true }) => {
  const isMobile = useIsMobile();
  const chartH = isMobile ? 220 : 300;
  const xTickProps = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 9, fill: 'hsl(var(--foreground))' };
  const xTickPropsName = isMobile ? { fontSize: 8, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end' as const, dy: 5 } : { fontSize: 10, fill: 'hsl(var(--foreground))' };
  const chartMarginBottom = isMobile ? 40 : 0;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AvalRow[]>([]);
  const [nomeById, setNomeById] = useState<Map<string, string>>(new Map());
  const [filterLoja, setFilterLojaState] = useState('todos');

  const setFilterLoja = (v: string) => { setFilterLojaState(v); onFilterChange?.(v); };

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLojaState('todos');
      onFilterChange?.('todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo]);

  const loadData = useCallback(async () => {
    const [avalRes, histRes, rolesRes, coRes] = await Promise.all([
      fetchAllRange<any>(() => supabase
        .from('avaliacoes')
        .select('id, marca:marca_id(nome), modelo:modelo_id(nome), placa, avaliador_id, tipo_aquisicao, situacao, quanto_vende, valor_fechamento, trade_in, created_at, updated_at, atendimentos_motos!inner(interesse, loja_id, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(nome_razao_social))')
        .neq('situacao', 'sem_avaliar')
        .in('atendimentos.interesse', ['trocar', 'vender'])
      ),
      fetchAllRange<any>(() => supabase
        .from('status_history')
        .select('entity_id, created_at')
        .eq('status', 'adquirida')
      ),
      (supabase as any).from('user_roles').select('user_id, nome').eq('projeto_id', BPM_PROJETO_ID),
      fetchAllRange<any>(() => supabase.from('custos_oficina').select('avaliacao_id, responsavel, valor_previsto, valor_executado')),
    ]);

    const avals = ((avalRes.data || []) as any[]).map((a) => flattenMarcaModelo(a));
    const avalIdSet = new Set<string>(avals.map((a) => a.id));

    // menor created_at por avaliação
    const aquisicaoByAval = new Map<string, string>();
    for (const h of (histRes.data || []) as any[]) {
      const avalId = avalIdSet.has(h.entity_id) ? h.entity_id : undefined;
      if (!avalId) continue;
      const cur = aquisicaoByAval.get(avalId);
      if (!cur || h.created_at < cur) aquisicaoByAval.set(avalId, h.created_at);
    }

    // Agregação de custos por avaliação — considera apenas responsável = cliente para o realizado (executado)
    const custosByAval = new Map<string, { previsto: number; executado: number }>();
    for (const c of (coRes.data || []) as any[]) {
      if (!c.avaliacao_id) continue;
      const resp = (c.responsavel || '').toLowerCase();
      if (resp !== 'cliente') continue;
      const cur = custosByAval.get(c.avaliacao_id) || { previsto: 0, executado: 0 };
      cur.previsto += Number(c.valor_previsto || 0);
      if (c.valor_executado != null) cur.executado += Number(c.valor_executado);
      custosByAval.set(c.avaliacao_id, cur);
    }

    const parsed: AvalRow[] = avals.map((a) => {
      const custos = custosByAval.get(a.id) || { previsto: 0, executado: 0 };
      return {
        id: a.id,
        avaliadorId: a.avaliador_id || null,
        tipoNorm: normTipo(a.tipo_aquisicao),
        situacao: a.situacao,
        interesse: a.atendimentos_motos?.interesse || null,
        loja: a.atendimentos_motos?.loja_empresas?.loja || null,
        createdAt: a.created_at,
        dataAquisicao: aquisicaoByAval.get(a.id) || null,
        nomeCliente: a.atendimentos_motos?.cliente?.nome_razao_social || null,
        marca: a.marca || null,
        modelo: a.modelo || null,
        placa: a.placa || null,
        quantoVende: Number(a.quanto_vende || 0),
        valorFechamento: Number(a.valor_fechamento || 0),
        valorBonus: Number(a.trade_in || 0),
        previsaoCusto: custos.previsto,
        custosRealizados: custos.executado,
      };
    });

    setRows(parsed);
    setNomeById(new Map(((rolesRes.data || []) as any[]).map((r: any) => [r.user_id, r.nome || 'Desconhecido'])));
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
      .channel('relatorio-avaliacoes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, debouncedLoad)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadData, debouncedLoad]);

  // ---------- KPIs ----------
  const indicadores = useMemo(() => computeKpis(rows, filterLoja, dateFrom, dateTo), [rows, filterLoja, dateFrom, dateTo]);
  const indicadoresPrev = useMemo(() => {
    const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
    if (!prevFrom || !prevTo) return emptyKpis();
    return computeKpis(rows, filterLoja, prevFrom, prevTo);
  }, [rows, filterLoja, dateFrom, dateTo]);

  // ---------- Por Avaliador ----------
  const chartByAvaliador = useMemo(() => {
    const map = new Map<string, { nomeCompleto: string; avaliacoes: number; aqTrocar: number; aqVender: number; aqPropria: number; aqConsignada: number }>();
    for (const r of rows) {
      if (!r.avaliadorId) continue;
      if (!matchesLoja(r.loja, filterLoja)) continue;
      const entry = map.get(r.avaliadorId) || {
        nomeCompleto: nomeById.get(r.avaliadorId) || 'Desconhecido',
        avaliacoes: 0, aqTrocar: 0, aqVender: 0, aqPropria: 0, aqConsignada: 0,
      };
      const inAval = (!dateFrom || new Date(r.createdAt) >= dateFrom) && (!dateTo || new Date(r.createdAt) <= dateTo);
      if (inAval) entry.avaliacoes += 1;

      if (r.dataAquisicao && inRange(r.dataAquisicao, dateFrom, dateTo)) {
        if (r.interesse === 'trocar') entry.aqTrocar += 1;
        if (r.interesse === 'vender') entry.aqVender += 1;
        if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) entry.aqPropria += 1;
        if (r.tipoNorm === 'consignada') entry.aqConsignada += 1;
      }
      map.set(r.avaliadorId, entry);
    }
    return Array.from(map.values()).map((v) => ({
      ...v,
      nome: abbreviateName(v.nomeCompleto),
      total: v.aqTrocar + v.aqVender,
    }));
  }, [rows, nomeById, filterLoja, dateFrom, dateTo]);

  // ---------- Resultado do Ano ----------
  const chartByMonth = useMemo(() => {
    const buckets = getYearBuckets();
    return buckets.map((b) => {
      let avaliacoes = 0, aquisicoes = 0, proprias = 0, consignadas = 0, negTrocar = 0, negVender = 0;
      for (const r of rows) {
        if (!matchesLoja(r.loja, filterLoja)) continue;
        if (inRange(r.createdAt, b.start, b.end)) avaliacoes += 1;
        if (r.dataAquisicao && inRange(r.dataAquisicao, b.start, b.end)) {
          aquisicoes += 1;
          if (['propria', 'convertida', 'repasse', 'test-ride'].includes(r.tipoNorm)) proprias += 1;
          if (r.tipoNorm === 'consignada') consignadas += 1;
          if (r.interesse === 'trocar') negTrocar += 1;
          if (r.interesse === 'vender') negVender += 1;
        }
      }
      return { mes: b.label, label: b.label, avaliacoes, aquisicoes, proprias, consignadas, negTrocar, negVender };
    });
  }, [rows, filterLoja]);

  // ---------- Motos Adquiridas (list) ----------
  const motosAdquiridas = useMemo(() => {
    return rows
      .filter((r) => r.dataAquisicao && matchesLoja(r.loja, filterLoja) && inRange(r.dataAquisicao, dateFrom, dateTo))
      .sort((a, b) => new Date(b.dataAquisicao!).getTime() - new Date(a.dataAquisicao!).getTime())
      .map((r) => {
        const modelo = [r.marca, r.modelo].filter(Boolean).join(' ') || '-';
        const assertividade = r.previsaoCusto > 0 ? r.custosRealizados / r.previsaoCusto : 0;
        const margemPrevista = r.quantoVende - r.valorFechamento - r.valorBonus - r.previsaoCusto;
        const margemExecutada = r.quantoVende - r.valorFechamento - r.valorBonus - r.custosRealizados;
        return {
          id: r.id,
          cliente: r.nomeCliente || '-',
          avaliador: r.avaliadorId ? (nomeById.get(r.avaliadorId) || '-') : '-',
          loja: r.loja,
          tipo: r.tipoNorm,
          modelo,
          placa: r.placa || '-',
          dataAquisicao: r.dataAquisicao,
          valorFechamento: r.valorFechamento,
          bonus: r.valorBonus,
          previsaoCusto: r.previsaoCusto,
          custosRealizados: r.custosRealizados,
          assertividade,
          quantoVende: r.quantoVende,
          margemPrevista,
          margemExecutada,
        };
      });
  }, [rows, nomeById, filterLoja, dateFrom, dateTo]);

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [[
      'Cliente','Avaliador','Loja','Tipo','Modelo','Placa','Data Aquisição',
      'V. Fechamento','Trade-in','Previsão Custo','Custos Realizados','Δ Custo','Quanto Vende','Margem Prev.','Margem %',
    ], ...motosAdquiridas.map(m => [
      m.cliente, abbreviateName(m.avaliador), lojaLabel(m.loja), tipoDisplayLabel(m.tipo), m.modelo, m.placa,
      m.dataAquisicao ? format(new Date(m.dataAquisicao), 'dd/MM/yyyy') : '-',
      m.valorFechamento, m.bonus, m.previsaoCusto, m.custosRealizados,
      m.previsaoCusto > 0 ? (m.custosRealizados - m.previsaoCusto) / m.previsaoCusto : null,
      m.quantoVende, m.margemPrevista, m.quantoVende > 0 ? m.margemPrevista / m.quantoVende : null,
    ])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [22,18,10,12,22,10,12,14,12,14,14,10,14,14,10].map(w => ({ wch: w }));
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = 1; R <= range.e.r; R++) {
      ['H','I','J','K','M','N'].forEach(c => { const cell = ws[`${c}${R+1}`]; if (cell && typeof cell.v === 'number') cell.z = 'R$ #,##0.00'; });
      const cellL = ws[`L${R+1}`]; if (cellL && typeof cellL.v === 'number') cellL.z = '0.0%';
      const cellO = ws[`O${R+1}`]; if (cellO && typeof cellO.v === 'number') cellO.z = '0.0%';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Motos Adquiridas');
    XLSX.writeFile(wb, `avaliacoes_motos_adquiridas_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const periodo = (dateFrom || dateTo)
      ? `${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : '...'} a ${dateTo ? format(dateTo, 'dd/MM/yyyy') : '...'}`
      : 'Todos';
    doc.setFontSize(14); doc.setTextColor(30, 41, 59);
    doc.text(`Avaliações — Motos Adquiridas — ${motosAdquiridas.length} registro(s)`, 40, 36);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Loja: ${filterLoja === 'todos' ? 'Todas' : filterLoja}  •  Período: ${periodo}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [['Cliente','Avaliador','Loja','Tipo','Modelo','Placa','Data Aquis.','V. Fechamento','Trade-in','Previsão Custo','Custos Real.','Quanto Vende','Margem Prev.']],
      body: motosAdquiridas.map(m => {
        const diff = m.previsaoCusto > 0 ? (m.custosRealizados - m.previsaoCusto) / m.previsaoCusto : null;
        const custoStr = diff !== null
          ? `${fmtBRL(m.custosRealizados)} (${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1).replace('.', ',')}%)`
          : fmtBRL(m.custosRealizados);
        const margemStr = m.quantoVende > 0
          ? `${fmtBRL(m.margemPrevista)} (${(m.margemPrevista / m.quantoVende * 100).toFixed(1).replace('.', ',')}%)`
          : fmtBRL(m.margemPrevista);
        return [
          m.cliente, abbreviateName(m.avaliador), lojaLabel(m.loja), tipoDisplayLabel(m.tipo), m.modelo, m.placa,
          m.dataAquisicao ? format(new Date(m.dataAquisicao), 'dd/MM/yy') : '-',
          fmtBRL(m.valorFechamento), fmtBRL(m.bonus), fmtBRL(m.previsaoCusto),
          custoStr, fmtBRL(m.quantoVende), margemStr,
        ];
      }),
      styles: { fontSize: 7, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [47, 111, 132], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const m = motosAdquiridas[data.row.index];
        if (data.column.index === 12 && m.margemPrevista !== 0) data.cell.styles.textColor = m.margemPrevista >= 0 ? [58, 143, 106] : [220, 38, 38];
        if (data.column.index === 10 && m.previsaoCusto > 0 && m.custosRealizados !== m.previsaoCusto) {
          data.cell.styles.textColor = m.custosRealizados > m.previsaoCusto ? [220, 38, 38] : [58, 143, 106];
        }
      },
      margin: { left: 20, right: 20 },
    });
    doc.save(`avaliacoes_motos_adquiridas_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <div className={showFilters ? '' : 'hidden md:block'}><LojaFilter value={filterLoja} onChange={setFilterLoja} /></div>

      {/* Indicators - Line 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Avaliações" value={fmtInt(indicadores.total_avaliacoes)} current={indicadores.total_avaliacoes} previous={indicadoresPrev.total_avaliacoes} gradient="teal" icon={<ClipboardCheck className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições" value={fmtInt(indicadores.total_aquisicoes)} subtitle={`(${indicadores.total_avaliacoes > 0 ? Math.floor((indicadores.total_aquisicoes / indicadores.total_avaliacoes) * 100) : 0}%)`} current={indicadores.total_aquisicoes} previous={indicadoresPrev.total_aquisicoes} gradient="teal" icon={<CheckCircle className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Próprias" value={fmtInt(indicadores.aquisicoes_propria)} current={indicadores.aquisicoes_propria} previous={indicadoresPrev.aquisicoes_propria} gradient="teal" icon={<Package className="h-5 w-5" />} />
        <IndicatorCard title="Aquisições Consignadas" value={fmtInt(indicadores.aquisicoes_consignada)} current={indicadores.aquisicoes_consignada} previous={indicadoresPrev.aquisicoes_consignada} gradient="teal" icon={<ArrowDownUp className="h-5 w-5" />} />
      </div>
      {/* Indicators - Line 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorCard title="Convertidas" value={fmtInt(indicadores.aquisicoes_convertida)} current={indicadores.aquisicoes_convertida} previous={indicadoresPrev.aquisicoes_convertida} gradient="purple" icon={<Repeat className="h-5 w-5" />} />
        <IndicatorCard title="Retiradas" value={fmtInt(indicadores.retiradas)} current={indicadores.retiradas} previous={indicadoresPrev.retiradas} gradient="red" icon={<XCircle className="h-5 w-5" />} />
        <IndicatorCard title="Entrada Direta" value={fmtInt(indicadores.entrada_direta)} current={indicadores.entrada_direta} previous={indicadoresPrev.entrada_direta} gradient="emerald" icon={<ArrowDownToLine className="h-5 w-5" />} />
        <IndicatorCard title="Troca" value={fmtInt(indicadores.troca)} current={indicadores.troca} previous={indicadoresPrev.troca} gradient="emerald" icon={<ArrowRightLeft className="h-5 w-5" />} />
      </div>

      {/* Section: Por Avaliador */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Por Avaliador</h2>
        <Separator />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Qtd de Avaliações" data={[...chartByAvaliador].filter(v => (v.avaliacoes || 0) > 0).sort((a, b) => b.avaliacoes - a.avaliacoes)} dataKey="avaliacoes" chartH={chartH} xTickProps={xTickPropsName} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Qtd Aquisições</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Aquisições</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Conversão (%)</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <ComposedChart
                data={[...chartByAvaliador]
                  .map((v: any) => {
                    const total = (v.aqTrocar || 0) + (v.aqVender || 0);
                    const taxa = v.avaliacoes > 0 ? Math.round((total / v.avaliacoes) * 100) : 0;
                    return { ...v, totalAquisicoes: total, taxaConversao: taxa };
                  })
                  .filter(v => v.totalAquisicoes > 0)
                  .sort((a, b) => b.totalAquisicoes - a.totalAquisicoes)}
                barCategoryGap="25%"
                margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" tick={xTickPropsName} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<AquisicoesAvaliadorTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar yAxisId="left" dataKey="totalAquisicoes" name="Aquisições" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Line yAxisId="right" type="monotone" dataKey="taxaConversao" name="Conversão" stroke="#E8913A" strokeWidth={2.5} dot={{ r: 4, fill: '#E8913A', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
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
        <MonthChart title="Avaliações" data={chartByMonth} dataKey="avaliacoes" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <MonthChart title="Aquisições" data={chartByMonth} dataKey="aquisicoes" chartH={chartH} xTickProps={xTickProps} chartMarginBottom={chartMarginBottom} />
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Próprias e Consignadas</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Próprias</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#7e6d9b' }} />Consignadas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <LineChart data={chartByMonth} margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }} />
                <Line type="monotone" dataKey="proprias" name="Próprias" stroke="#2F6F84" strokeWidth={2.5} dot={{ r: 4, fill: '#2F6F84', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }} />
                <Line type="monotone" dataKey="consignadas" name="Consignadas" stroke="#7e6d9b" strokeWidth={2.5} dot={{ r: 4, fill: '#7e6d9b', stroke: '#fff', strokeWidth: 2 }} label={{ position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-4 pt-4 px-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Negociação</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#2F6F84' }} />Trocar</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8913A' }} />Vender</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartByMonth} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Bar dataKey="negTrocar" name="Trocar" fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
                <Bar dataKey="negVender" name="Vender" fill="#E8913A" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
          </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section: Motos Adquiridas */}
      <div className="space-y-1 !mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Motos Adquiridas</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportExcel} disabled={motosAdquiridas.length === 0} title="Baixar Excel">
              <FileSpreadsheet className="h-4 w-4 text-[#3a8f6a]" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExportPdf} disabled={motosAdquiridas.length === 0} title="Baixar PDF (paisagem)">
              <FileDown className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </div>
        <Separator />
      </div>
      <Card className="overflow-hidden">
        <CardContent className="pt-4">
          <div className="overflow-x-auto pb-2">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Avaliador</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Data Aquisição</TableHead>
                  <TableHead className="text-right">V. Fechamento</TableHead>
                  <TableHead className="text-right">Trade-in</TableHead>
                  <TableHead className="text-right">Previsão Custo</TableHead>
                  <TableHead className="text-right">Custos Realizados</TableHead>
                  <TableHead className="text-right">Quanto Vende</TableHead>
                  <TableHead className="text-right">Margem Prev.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motosAdquiridas.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Nenhuma moto adquirida encontrada</TableCell></TableRow>
                ) : motosAdquiridas.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{m.cliente}</TableCell>
                    <TableCell className="text-xs">{abbreviateName(m.avaliador)}</TableCell>
                    <TableCell className="text-xs font-medium">{lojaLabel(m.loja)}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(m.tipo)}`}>{tipoDisplayLabel(m.tipo)}</Badge></TableCell>
                    <TableCell className="text-xs">{m.modelo}</TableCell>
                    <TableCell className="text-xs font-mono">{m.placa}</TableCell>
                    <TableCell className="text-xs">{m.dataAquisicao ? format(new Date(m.dataAquisicao), 'dd/MM/yy') : '-'}</TableCell>
                    <TableCell className="text-xs text-right">{fmtBRL(m.valorFechamento)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtBRL(m.bonus)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtBRL(m.previsaoCusto)}</TableCell>
                    <TableCell className="text-xs text-right">
                      {fmtBRL(m.custosRealizados)}
                      {m.previsaoCusto > 0 && (() => {
                        const diff = (m.custosRealizados - m.previsaoCusto) / m.previsaoCusto;
                        const sign = diff > 0 ? '+' : '';
                        const cls = diff > 0 ? 'text-red-600' : 'text-green-600';
                        return <span className={`ml-1 ${cls}`}>({sign}{(diff * 100).toFixed(1).replace('.', ',')}%)</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-right">{fmtBRL(m.quantoVende)}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${m.margemPrevista >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtBRL(m.margemPrevista)}
                      {m.quantoVende > 0 && <span className="ml-1">({(m.margemPrevista / m.quantoVende * 100).toFixed(1).replace('.', ',')}%)</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
};

const IndicatorCard: React.FC<{ title: string; value: string | number; subtitle?: string; current?: number | null; previous?: number | null; gradient?: string; icon?: React.ReactNode }> = ({ title, value, subtitle, current, previous, gradient = 'teal', icon }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[100px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate">{value}{subtitle && <span className="ml-1">{subtitle}</span>}</p>
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
          {capitalize(entry.name)}: {entry.value}
        </p>
      ))}
    </div>
  );
};

const AquisicoesAvaliadorTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload || {};
  const propria = d.aqPropria ?? 0;
  const consignada = d.aqConsignada ?? 0;
  const total = d.totalAquisicoes ?? (propria + consignada);
  const taxa = d.taxaConversao ?? 0;
  return (
    <div style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, background: 'hsl(var(--background))', padding: '8px 12px' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <p style={{ margin: 0, color: '#2F6F84' }}>Próprias: {propria}</p>
      <p style={{ margin: 0, color: '#7e6d9b' }}>Consignadas: {consignada}</p>
      <p style={{ margin: '4px 0 0', fontWeight: 600 }}>Total: {total}</p>
      <p style={{ margin: 0, color: '#E8913A', fontWeight: 600 }}>Conversão: {taxa}%</p>
    </div>
  );
};

const renderBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value == null || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 6} fill="hsl(var(--foreground))" fontSize={10} fontWeight={600} textAnchor="middle">
      {value}
    </text>
  );
};

const ChartCard: React.FC<{ title: string; data: any[]; dataKey: string; chartH?: number; xTickProps?: any; chartMarginBottom?: number }> = ({ title, data, dataKey, chartH = 300, xTickProps = { fontSize: 10, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0 }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="nome" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

const MonthChart: React.FC<{ title: string; data: any[]; dataKey: string; chartH?: number; xTickProps?: any; chartMarginBottom?: number }> = ({ title, data, dataKey, chartH = 300, xTickProps = { fontSize: 9, fill: 'hsl(var(--foreground))' }, chartMarginBottom = 0 }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="px-4 pb-3 pt-0">
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 16, right: 10, left: -20, bottom: chartMarginBottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={xTickProps} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey={dataKey} fill="#2F6F84" radius={[8, 8, 0, 0]} label={(props: any) => renderBarLabel(props)} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

export default RelatorioAvaliacoes;
