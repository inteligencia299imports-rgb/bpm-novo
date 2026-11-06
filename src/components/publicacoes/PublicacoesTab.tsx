import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, Filter, CalendarIcon, X, Camera, Package, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { MARCA_MODELO_SELECT, flattenMarcaModeloList } from '@/lib/marcaModelo';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { ETAPAS_PUBLICACAO, type EtapaPublicacao } from '@/lib/siteMoto';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ProcessCard from '@/components/shared/ProcessCard';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import PublicacaoDetalhe, { type ItemPublicacao } from './PublicacaoDetalhe';

// Status do estoque em que a moto sai do kanban (já não está à venda).
const FORA_DO_KANBAN = new Set(['vendido', 'retirada']);

// Colunas do kanban: Em Aberto, Fotos Tiradas, Sinal (status do estoque; cor do Showroom), Publicadas e Desativadas.
const etapaCol = (v: EtapaPublicacao) => ETAPAS_PUBLICACAO.find((e) => e.value === v)!;
const COLUNAS = [
  etapaCol('em_aberto'),
  etapaCol('fotos_tiradas'),
  { value: 'sinal', label: 'Sinal', hex: '#b376c4' },
  etapaCol('publicada'),
  etapaCol('desativada'),
];

const SITUACOES = [
  { value: 'preparacao', label: 'Em preparação' },
  { value: 'estoque', label: 'Em estoque' },
  { value: 'sinal', label: 'Com sinal' },
];

const DataFiltro = ({ valor, setValor, rotulo, min }: { valor?: Date; setValor: (d?: Date) => void; rotulo: string; min?: Date }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className={cn('justify-start text-left font-normal bg-card border-border', !valor && 'text-muted-foreground')}>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {valor ? format(valor, 'dd/MM/yyyy', { locale: ptBR }) : rotulo}
        {valor && <X className="ml-auto h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setValor(undefined); }} />}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={valor} onSelect={setValor} initialFocus locale={ptBR}
        disabled={(date) => (min ? date < min : false)} className="p-3 pointer-events-auto" />
    </PopoverContent>
  </Popover>
);


interface Props {
  /** Aberto a partir de outra aba (ex.: menu do card no Estoque): abre direto a moto. */
  initialAvaliacaoId?: string | null;
  onInitialHandled?: () => void;
}

const PublicacoesTab: React.FC<Props> = ({ initialAvaliacaoId, onInitialHandled }) => {
  const [items, setItems] = useState<ItemPublicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterSituacao, setFilterSituacao] = useState('todos');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selected, setSelected] = useState<ItemPublicacao | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const [avRes, estRes, siteRes, lojasRes] = await Promise.all([
      fetchAllRange(() =>
        supabase
          .from('avaliacoes')
          .select(`id, placa, ano_fabricacao, ano_modelo, km, cor, cilindrada, categoria, valor_fipe, quanto_vende, tem_manual, tem_chave_reserva, manutencao_vencida, tipo_aquisicao, situacao, created_at, ${MARCA_MODELO_SELECT}, atendimentos_motos!avaliacoes_atendimento_id_fkey(loja_empresas:loja_id(loja))`)
          .in('situacao', ['adquirida', 'estoque', 'oficina'])
          .order('created_at', { ascending: false }),
      ),
      fetchAllRange(() => supabase.from('estoque_motos').select('avaliacao_id, status, preco_acao, loja_id, created_at').not('avaliacao_id', 'is', null)),
      fetchAllRange(() => (supabase as any).from('site_motos').select('*')),
      supabase.from('loja_empresas').select('id, loja').eq('sistema', 'motos'),
    ]);
    if (avRes.error || siteRes.error) {
      toast.error('Erro ao carregar as publicações');
      setLoading(false);
      return;
    }
    const lojaNome = new Map(((lojasRes.data as any[]) || []).map((l) => [l.id, l.loja]));
    // Moto com mais de uma linha de estoque (histórico): vale a mais recente.
    const estPorAv = new Map<string, any>();
    for (const e of (estRes.data as any[]) || []) {
      const atual = estPorAv.get(e.avaliacao_id);
      if (!atual || String(e.created_at) > String(atual.created_at)) estPorAv.set(e.avaliacao_id, e);
    }
    const sitePorAv = new Map(((siteRes.data as any[]) || []).map((s) => [s.avaliacao_id, s]));
    const lista: ItemPublicacao[] = [];
    for (const av of flattenMarcaModeloList(avRes.data as any[])) {
      const tipo = String(av.tipo_aquisicao || '');
      if (tipo === 'test-ride' || tipo === 'test_ride') continue;
      const est = estPorAv.get(av.id) || null;
      if (est && FORA_DO_KANBAN.has(est.status)) continue;
      const site = sitePorAv.get(av.id) || null;
      lista.push({
        avaliacao: av,
        estoque: est,
        site,
        etapa: (site?.etapa as EtapaPublicacao) || 'em_aberto',
        // Em estoque: o pátio onde está; em preparação: a loja da aquisição.
        lojaBpm: (est?.loja_id ? (lojaNome.get(est.loja_id) as string) : null) || av.atendimentos_motos?.loja_empresas?.loja || null,
        dataAquisicao: est?.created_at || av.created_at,
      });
    }
    setItems(lista);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Vindo do Estoque: abre a moto assim que a lista carregar.
  useEffect(() => {
    if (!initialAvaliacaoId || loading) return;
    const it = items.find((x) => x.avaliacao.id === initialAvaliacaoId);
    if (it) setSelected(it);
    else toast.error('Esta moto não está na aba Publicações');
    onInitialHandled?.();
  }, [initialAvaliacaoId, loading, items, onInitialHandled]);

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return items.filter((it) => {
      const av = it.avaliacao;
      if (termo) {
        const alvo = [av.marca, av.modelo, av.placa, it.lojaBpm].filter(Boolean).join(' ').toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (!matchesCidade(it.lojaBpm, filterCidade)) return false;
      if (filterTipo !== 'todos') {
        const tipo = String(av.tipo_aquisicao || '');
        if (filterTipo === 'propria' ? !['propria', 'repasse', 'convertida'].includes(tipo) : tipo !== filterTipo) return false;
      }
      if (filterSituacao !== 'todos') {
        const st = it.estoque?.status;
        const sit = st === 'sinal' ? 'sinal' : it.estoque ? 'estoque' : 'preparacao';
        if (sit !== filterSituacao) return false;
      }
      const d = new Date(it.dataAquisicao);
      if (dateFrom && d < new Date(new Date(dateFrom).setHours(0, 0, 0, 0))) return false;
      if (dateTo && d > new Date(new Date(dateTo).setHours(23, 59, 59, 999))) return false;
      return true;
    });
  }, [items, search, filterCidade, filterTipo, filterSituacao, dateFrom, dateTo]);

  if (selected) return <PublicacaoDetalhe item={selected} onClose={() => { setSelected(null); fetchItems(); }} />;

  const temFiltro = filterCidade !== 'todos' || filterTipo !== 'todos' || filterSituacao !== 'todos' || !!dateFrom || !!dateTo;
  const limpar = () => { setFilterCidade('todos'); setFilterTipo('todos'); setFilterSituacao('todos'); setDateFrom(undefined); setDateTo(undefined); };

  return (
    <div className="space-y-5">
      <div className="flex flex-row gap-3 items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Camera className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Publicações</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por marca, modelo ou placa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2 border-border text-foreground hover:bg-surface-hover shrink-0">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
        </Button>
      </div>

      <CidadeFilter value={filterCidade} onChange={setFilterCidade} className="hidden md:flex" />

      {showFilters && (
        <Card className="animate-fade-in border-border shadow-soft">
          <CardContent className="pt-4 space-y-3">
            <div className="block md:hidden">
              <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="propria">Próprias</SelectItem>
                  <SelectItem value="consignada">Consignadas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSituacao} onValueChange={setFilterSituacao}>
                <SelectTrigger className="bg-card border-border"><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  {SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <DataFiltro valor={dateFrom} setValor={setDateFrom} rotulo="Data início" />
              <DataFiltro valor={dateTo} setValor={setDateTo} rotulo="Data fim" min={dateFrom} />
            </div>
            {temFiltro && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={limpar}>
                <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <KanbanSkeleton columns={5} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-5">
            {COLUNAS.map((col) => {
              // Moto com sinal fica só na coluna Sinal (já está fora do site), seja qual for a etapa do anúncio.
              const colItems = filtrados.filter((it) => (it.estoque?.status === 'sinal' ? col.value === 'sinal' : it.etapa === col.value));
              return (
                <div key={col.value} className="w-[280px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma moto</p>
                    ) : colItems.map((it) => {
                      const av = it.avaliacao;
                      return (
                        <ProcessCard
                          key={av.id}
                          clientName={[av.marca, av.modelo].filter(Boolean).join(' ').toUpperCase() || 'Moto'}
                          motoLabel={[String(av.placa || '').replace(/-/g, '').toUpperCase(), av.ano_modelo].filter(Boolean).join(' · ')}
                          loja={it.lojaBpm || undefined}
                          date={it.dataAquisicao}
                          dateLabel={it.estoque ? 'Entrada' : 'Aquisição'}
                          statusColor={col.hex}
                          titleIcon={it.estoque
                            ? <span title="Em estoque" className="shrink-0"><Package className="h-4 w-4 text-green-600" /></span>
                            : <span title="Em preparação" className="shrink-0"><Wrench className="h-4 w-4 text-orange-500" /></span>}
                          extraBadge={av.tipo_aquisicao ? { label: getTipoAquisicaoLabel(av.tipo_aquisicao) || '', className: getTipoAquisicaoBadgeClass(av.tipo_aquisicao) } : undefined}
                          onClick={() => setSelected(it)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default PublicacoesTab;
