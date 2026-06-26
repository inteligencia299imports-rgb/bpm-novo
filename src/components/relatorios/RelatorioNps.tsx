import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, TrendingUp, Smile, Meh, Frown, Award } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LojaFilter } from './LojaFilter';
import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from '@/lib/reportDateRange';
import { isLojaDucati, LOJAS_299 } from '@/lib/lojaUtils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
  onRegisterClear?: (fn: () => void) => void;
  onFilterChange?: (loja: string, tipo: string) => void;
  showFilters?: boolean;
}

type Resposta = {
  id: string;
  atendimento_id: string;
  data_resposta: string | null;
  atendimento: string | null;
  outros_setores: string | null;
  produto: string | null;
  experiencia: string | null;
  nps: string | null;
  melhorias: string | null;
  espaco_livre: string | null;
  origem: string | null;
  _tipo: 'Venda' | 'Aquisição' | '—';
  _loja: string | null;
  _cliente: string | null;
};

const matchLoja = (loja: string | null | undefined, filter: string): boolean => {
  if (!loja) return filter === 'todos';
  if (filter === 'todos') return true;
  if (filter === '299') return (LOJAS_299 as readonly string[]).includes(loja);
  if (filter === 'Ducati') return isLojaDucati(loja);
  return loja === filter;
};

const RelatorioNps: React.FC<Props> = ({ dateFrom, dateTo, setDateFrom, setDateTo, onRegisterClear, onFilterChange, showFilters = true }) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [filterLoja, setFilterLoja] = useState('todos');
  const [filterTipo, setFilterTipo] = useState<'todos' | 'venda' | 'aquisicao'>('todos');
  const [listTab, setListTab] = useState('todas');

  const [sentVendas, setSentVendas] = useState(0);
  const [sentAquisicoes, setSentAquisicoes] = useState(0);
  const [respVendas, setRespVendas] = useState(0);
  const [respAquisicoes, setRespAquisicoes] = useState(0);
  const [respostas, setRespostas] = useState<Resposta[]>([]);

  useEffect(() => {
    onRegisterClear?.(() => {
      setFilterLoja('todos');
      setFilterTipo('todos');
      onFilterChange?.('todos', 'todos');
      setDateFrom(undefined);
      setDateTo(undefined);
    });
  }, [onRegisterClear, setDateFrom, setDateTo, onFilterChange]);

  const handleLoja = (v: string) => { setFilterLoja(v); onFilterChange?.(v, filterTipo); };
  const handleTipo = (v: 'todos' | 'venda' | 'aquisicao') => { setFilterTipo(v); onFilterChange?.(filterLoja, v); };

  const loadData = useCallback(async () => {
    setLoading(true);
    const dfIso = toSaoPauloStartOfDayIso(dateFrom);
    const dtIso = toSaoPauloEndOfDayIso(dateTo);

    // Atendimentos vendidos (universo Vendas)
    let qAt = supabase
      .from('atendimentos')
      .select('id, nome_cliente, loja, nps_status, nps_enviado_at, nps_respondido_at, data_venda')
      .eq('situacao', 'vendido');
    if (dfIso) qAt = qAt.gte('data_venda', dfIso);
    if (dtIso) qAt = qAt.lte('data_venda', dtIso);

    // Avaliações com NPS (universo Aquisições) — filtramos por nps_enviado_at quando houver
    let qAv = supabase
      .from('avaliacoes')
      .select('id, nps_status, nps_enviado_at, nps_respondido_at, atendimento_id, atendimentos:atendimento_id(nome_cliente, loja)');

    const [atRes, avRes] = await Promise.all([qAt, qAv]);
    const atens = (atRes.data || []) as any[];
    const avals = (avRes.data || []) as any[];

    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      if (dfIso && iso < dfIso) return false;
      if (dtIso && iso > dtIso) return false;
      return true;
    };

    const atFiltered = atens.filter(a => matchLoja(a.loja, filterLoja));
    const avFiltered = avals.filter(a => matchLoja(a.atendimentos?.loja, filterLoja));

    const sentV = atFiltered.filter(a => ['enviado', 'respondido'].includes(a.nps_status || '')).length;
    const respV = atFiltered.filter(a => a.nps_status === 'respondido' || (a.nps_respondido_at && (!dfIso || a.nps_respondido_at >= dfIso) && (!dtIso || a.nps_respondido_at <= dtIso))).length;
    const sentA = avFiltered.filter(a => ['enviado', 'respondido'].includes(a.nps_status || '') && (!dfIso || (a.nps_enviado_at && a.nps_enviado_at >= dfIso)) && (!dtIso || (a.nps_enviado_at && a.nps_enviado_at <= dtIso))).length;
    const respA = avFiltered.filter(a => a.nps_status === 'respondido' && inRange(a.nps_respondido_at)).length;

    setSentVendas(sentV);
    setSentAquisicoes(sentA);
    setRespVendas(respV);
    setRespAquisicoes(respA);

    // Respostas detalhadas
    let qResp = supabase.from('respostas_nps').select('*').order('data_resposta', { ascending: false });
    if (dfIso) qResp = qResp.gte('data_resposta', dfIso);
    if (dtIso) qResp = qResp.lte('data_resposta', dtIso);
    const { data: respData } = await qResp;
    const rows = (respData || []) as any[];

    const atById = new Map(atens.map(a => [a.id, a]));
    const avById = new Map(avals.map(a => [a.id, a]));

    const enriched: Resposta[] = rows.map(r => {
      const at = atById.get(r.atendimento_id);
      const av = avById.get(r.atendimento_id);
      if (at) return { ...r, _tipo: 'Venda', _loja: at.loja, _cliente: at.nome_cliente };
      if (av) return { ...r, _tipo: 'Aquisição', _loja: av.atendimentos?.loja || null, _cliente: av.atendimentos?.nome_cliente || null };
      return { ...r, _tipo: '—', _loja: null, _cliente: null };
    }).filter(r => matchLoja(r._loja, filterLoja))
      .filter(r => filterTipo === 'todos' || (filterTipo === 'venda' && r._tipo === 'Venda') || (filterTipo === 'aquisicao' && r._tipo === 'Aquisição'));

    setRespostas(enriched);
    setLoading(false);
  }, [dateFrom, dateTo, filterLoja, filterTipo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregates
  const sentTotal = sentVendas + sentAquisicoes;
  const respTotal = respVendas + respAquisicoes;
  const taxaResposta = sentTotal > 0 ? respTotal / sentTotal : 0;

  const notas = respostas.map(r => Number(r.nps)).filter(n => Number.isFinite(n) && n >= 0 && n <= 10);
  const promotores = notas.filter(n => n >= 9).length;
  const neutros = notas.filter(n => n >= 7 && n <= 8).length;
  const detratores = notas.filter(n => n <= 6).length;
  const npsScore = notas.length > 0 ? Math.round(((promotores - detratores) / notas.length) * 100) : 0;
  const npsColor = npsScore >= 75 ? '#3a8f6a' : npsScore >= 50 ? '#7e9b6d' : npsScore >= 0 ? '#E8913A' : '#dc2626';

  const distribuicao = [
    { label: 'Promotores (9-10)', value: promotores, pct: notas.length ? promotores / notas.length : 0, color: '#3a8f6a' },
    { label: 'Neutros (7-8)', value: neutros, pct: notas.length ? neutros / notas.length : 0, color: '#E8913A' },
    { label: 'Detratores (0-6)', value: detratores, pct: notas.length ? detratores / notas.length : 0, color: '#dc2626' },
  ];

  const notasHist = Array.from({ length: 11 }, (_, i) => ({
    nota: String(i),
    total: notas.filter(n => n === i).length,
    color: i <= 6 ? '#dc2626' : i <= 8 ? '#E8913A' : '#3a8f6a',
  }));

  const filteredRespostas = listTab === 'todas' ? respostas : listTab === 'venda' ? respostas.filter(r => r._tipo === 'Venda') : respostas.filter(r => r._tipo === 'Aquisição');

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando dados...</div>;
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <Separator className="my-2" />
      <div className={cn('flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', showFilters ? 'flex' : 'hidden md:flex')}>
        <LojaFilter value={filterLoja} onChange={handleLoja} />
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Tipo:</span>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'venda', label: 'Vendas' },
              { value: 'aquisicao', label: 'Aquisições' },
            ] as const).map(t => (
              <button
                key={t.value}
                onClick={() => handleTipo(t.value)}
                className={cn('rounded-full px-3 h-7 text-xs border transition-colors', filterTipo === t.value ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background border-border hover:bg-muted')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi title="Pesquisas Enviadas" value={sentTotal} hint={`${sentVendas} vendas • ${sentAquisicoes} aquisições`} icon={<Send className="h-5 w-5" />} color="teal" />
        <Kpi title="Pesquisas Respondidas" value={respTotal} hint={`${respVendas} vendas • ${respAquisicoes} aquisições`} icon={<MessageSquare className="h-5 w-5" />} color="purple" />
        <Kpi title="Taxa de Resposta" value={`${Math.round(taxaResposta * 100)}%`} hint={`${respTotal} de ${sentTotal}`} icon={<TrendingUp className="h-5 w-5" />} color="emerald" />
        <Kpi title="NPS Score" value={notas.length ? String(npsScore) : '—'} hint={notas.length ? `Baseado em ${notas.length} respostas` : 'Sem respostas no período'} icon={<Award className="h-5 w-5" />} customColor={npsColor} />
      </div>

      {/* Distribuição */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi title="Promotores" value={promotores} hint={`${Math.round((distribuicao[0].pct) * 100)}% das respostas`} icon={<Smile className="h-5 w-5" />} customColor="#3a8f6a" />
        <Kpi title="Neutros" value={neutros} hint={`${Math.round((distribuicao[1].pct) * 100)}% das respostas`} icon={<Meh className="h-5 w-5" />} customColor="#E8913A" />
        <Kpi title="Detratores" value={detratores} hint={`${Math.round((distribuicao[2].pct) * 100)}% das respostas`} icon={<Frown className="h-5 w-5" />} customColor="#dc2626" />
      </div>

      {/* Histograma */}
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-4 pt-4 px-4"><CardTitle className="text-sm font-semibold">Distribuição de Notas (0 a 10)</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
            <BarChart data={notasHist} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="nota" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="total" radius={[8, 8, 0, 0]} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: 'hsl(var(--foreground))' }}>
                {notasHist.map((e, i) => (<Cell key={i} fill={e.color} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lista de respostas */}
      <div className="space-y-1 !mt-8">
        <h2 className="text-lg font-bold text-foreground">Respostas</h2>
        <Separator />
      </div>
      <Card className="overflow-hidden">
        <CardContent className="pt-4">
          <Tabs value={listTab} onValueChange={setListTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="todas">Todas ({respostas.length})</TabsTrigger>
              <TabsTrigger value="venda">Vendas ({respostas.filter(r => r._tipo === 'Venda').length})</TabsTrigger>
              <TabsTrigger value="aquisicao">Aquisições ({respostas.filter(r => r._tipo === 'Aquisição').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={listTab}>
              <div className="overflow-x-auto pb-2">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Nota</TableHead>
                      <TableHead>Comentário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRespostas.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Nenhuma resposta no período</TableCell></TableRow>
                    ) : filteredRespostas.map(r => {
                      const nota = Number(r.nps);
                      const notaBadge = !Number.isFinite(nota) ? '—' : nota >= 9 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : nota >= 7 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-700 border-red-200';
                      const comentario = [r.experiencia, r.melhorias, r.espaco_livre].filter(Boolean).join(' • ');
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs whitespace-nowrap">{r.data_resposta ? format(new Date(r.data_resposta), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</TableCell>
                          <TableCell className="text-sm">{r._cliente || '—'}</TableCell>
                          <TableCell className="text-xs">{r._loja || '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{r._tipo}</Badge></TableCell>
                          <TableCell className="text-center">
                            <span className={cn('inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md border text-xs font-semibold', notaBadge)}>{Number.isFinite(nota) ? nota : '—'}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[420px] truncate" title={comentario}>{comentario || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
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

const colorMap: Record<string, string> = {
  teal: 'bg-[#2F6F84]/10 text-[#2F6F84]',
  purple: 'bg-[#7e6d9b]/10 text-[#7e6d9b]',
  emerald: 'bg-[#3a8f6a]/10 text-[#3a8f6a]',
};

const Kpi: React.FC<{ title: string; value: string | number; hint?: string; icon?: React.ReactNode; color?: string; customColor?: string }> = ({ title, value, hint, icon, color = 'teal', customColor }) => (
  <Card className="border shadow-sm rounded-xl">
    <CardContent className="px-4 min-h-[100px] flex items-center justify-center py-0">
      <div className="flex items-center justify-between w-full">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
          <p className="text-xl font-semibold text-foreground/80 truncate" style={customColor ? { color: customColor } : undefined}>{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn('ml-2 p-2 rounded-lg flex-shrink-0', !customColor && (colorMap[color] || colorMap.teal))}
            style={customColor ? { backgroundColor: `${customColor}1A`, color: customColor } : undefined}
          >
            {icon}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

export default RelatorioNps;
