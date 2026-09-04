import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save, Building2, User, Plus, Trash2, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { persistChecklistRows } from '@/lib/persistChecklistRows';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseCurrencyInput = (value: string): number => parseInt(value.replace(/\D/g, '') || '0', 10) / 100;
const formatCurrency = (v: number | null | undefined) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ETAPAS = [
  'CONSULTA REALIZADA',
  'DOCUMENTAÇÃO RECEBIDA',
  'DOCUMENTAÇÃO COM DESPACHANTE',
  'VISTORIA/CADEIA DOMINIAL',
  'NF EMITIDA',
  'PROCESSO PAUSADO',
  'TRANSFERÊNCIA CONCLUÍDA',
];

interface EtapaData {
  id?: string;
  etapa: string;
  concluida: boolean;
  data_conclusao: string | null;
  destino_transferencia?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  onStatusChanged?: (newStatus: string) => void;
  onEmitirNfe?: () => void;
}

const PosCompraProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, onStatusChanged, onEmitirNfe }) => {
  const { userName } = useAuth();
  const [etapas, setEtapas] = useState<EtapaData[]>(
    ETAPAS.map(e => ({ etapa: e, concluida: false, data_conclusao: null, destino_transferencia: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);
  const [datasSalvas, setDatasSalvas] = useState<Record<string, string | null>>({});
  const [previousStatus, setPreviousStatus] = useState('aprovada');
  const [atendimentoId, setAtendimentoId] = useState<string | null>(null);
  const [destinoDialogOpen, setDestinoDialogOpen] = useState(false);
  const [destinoValue, setDestinoValue] = useState<'loja' | 'novo_proprietario'>('loja');

  // Abas: "processo" (checklist de etapas) | "financeiro" (fechamento + abatimentos)
  const [aba, setAba] = useState<'processo' | 'financeiro'>('processo');
  const [valorFechamento, setValorFechamento] = useState('');
  const [custosOficina, setCustosOficina] = useState<any[]>([]);
  const [savingFin, setSavingFin] = useState(false);
  const [newResp, setNewResp] = useState('Cliente');
  const [newTipo] = useState('Serviço');
  const [newDesc, setNewDesc] = useState('');
  const [newValor, setNewValor] = useState('');

  // ---- NF-e de compra ----
  const nfe = useNfeCompra(avaliacaoId, open);
  const nfeCompra = nfe.nfe;
  const nfeEmitida = nfe.emitida;
  const nfePendente = nfe.pendente;
  const nfeErro = nfe.erro;
  const emitindoNfe = nfe.loading;
  const consultarNfe = nfe.consultar;
  const setNfeCompra = nfe.setNfe;
  const [aprovacaoStatus, setAprovacaoStatus] = useState<string | null>(null);
  const [contratoGerado, setContratoGerado] = useState(false);
  const [consultaRealizada, setConsultaRealizada] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAba('processo');
    const load = async () => {
      setLoading(true);

      const [{ data }, { data: avData }, { data: custosData }, { data: nfeData }, { data: contratoHist }] = await Promise.all([
        supabase
          .from('pos_compra_processos' as any)
          .select('id, etapa, concluida, data_conclusao, destino_transferencia')
          .eq('avaliacao_id', avaliacaoId),
        supabase
          .from('avaliacoes')
          .select('atendimento_id, pos_compra_status, tipo_aquisicao, consulta_realizada, valor_fechamento, aprovacao_status')
          .eq('id', avaliacaoId)
          .maybeSingle(),
        supabase.from('custos_oficina').select('*').eq('avaliacao_id', avaliacaoId).order('created_at'),
        supabase
          .from('nfe_entradas' as any)
          .select('*')
          .eq('avaliacao_id', avaliacaoId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('status_history')
          .select('id')
          .eq('entity_type', 'pos_compra')
          .eq('entity_id', avaliacaoId)
          .eq('status', 'contrato_compra_gerado')
          .limit(1),
      ]);

      setCustosOficina(custosData || []);
      setNfeCompra((nfeData as any[])?.[0] || null);
      setAprovacaoStatus((avData as any)?.aprovacao_status ?? null);
      setContratoGerado(((contratoHist as any[]) || []).length > 0);
      setValorFechamento(
        (avData as any)?.valor_fechamento
          ? formatCurrencyInput(String(Math.round((avData as any).valor_fechamento * 100)))
          : '',
      );

      const tipoAquisicao = (avData as any)?.tipo_aquisicao;

      // Fetch consultation date
      const consultaRealizada = (avData as any)?.consulta_realizada === true;
      setConsultaRealizada(consultaRealizada);
      let consultaDate: string | null = null;
      if (consultaRealizada) {
        const { data: consultaHistory } = await supabase
          .from('status_history')
          .select('created_at')
          .eq('entity_id', avaliacaoId)
          .eq('entity_type', 'consulta')
          .eq('status', 'consulta_realizada')
          .order('created_at', { ascending: false })
          .limit(1);
        consultaDate = consultaHistory?.[0]?.created_at || null;
      }

      // If convertida, fetch consignacao process dates to pre-fill matching etapas
      const consignacaoMap: Record<string, EtapaData> = {};
      if (tipoAquisicao === 'convertida') {
        const { data: consigData } = await supabase
          .from('consignacao_processos' as any)
          .select('etapa, concluida, data_conclusao')
          .eq('avaliacao_id', avaliacaoId);
        if (consigData) {
          for (const d of consigData as any[]) {
            consignacaoMap[d.etapa] = d as EtapaData;
          }
        }
      }

      const map: Record<string, EtapaData> = {};
      if (data) {
        for (const d of data as any[]) {
          map[d.etapa] = d as EtapaData;
        }
      }

      const built = ETAPAS.map(e => {
        // Existing pos_compra data takes priority
        if (map[e]) return map[e];
        // For convertida, pull matching dates from consignação process
        if (tipoAquisicao === 'convertida' && consignacaoMap[e] && consignacaoMap[e].concluida) {
          return { etapa: e, concluida: true, data_conclusao: consignacaoMap[e].data_conclusao };
        }
        if (e === 'CONSULTA REALIZADA' && consultaRealizada) {
          return { etapa: e, concluida: true, data_conclusao: consultaDate || new Date().toISOString() };
        }
        return { etapa: e, concluida: false, data_conclusao: null };
      });

      setEtapas(built);
      // Datas ja salvas -> ficam bloqueadas p/ edicao direta (so via X ou re-check).
      const salvas: Record<string, string | null> = {};
      built.forEach((b: any) => { salvas[b.etapa] = b.concluida ? (b.data_conclusao ?? null) : null; });
      setDatasSalvas(salvas);
      setAtendimentoId((avData as any)?.atendimento_id || null);
      setPreviousStatus((avData as any)?.pos_compra_status || 'aprovada');
      setLoading(false);
    };
    load();
  }, [open, avaliacaoId]);

  // ---- Financeiro ----
  const abatimentos = custosOficina
    .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0);
  const repasseNum = parseCurrencyInput(valorFechamento) - abatimentos;

  const addCusto = async () => {
    if (!newValor || parseCurrencyInput(newValor) <= 0) {
      toast.error('Informe o valor do custo');
      return;
    }
    const payload = {
      avaliacao_id: avaliacaoId,
      tipo: newTipo.toLowerCase().replace('ç', 'c').replace('ã', 'a'),
      responsavel: newResp,
      detalhes: newDesc || null,
      valor_previsto: parseCurrencyInput(newValor),
    };
    const { data, error } = await supabase.from('custos_oficina').insert(payload as any).select().single();
    if (error) { toast.error('Erro ao adicionar custo'); return; }
    setCustosOficina(prev => [...prev, data]);
    setNewResp('Cliente');
    setNewDesc('');
    setNewValor('');
  };

  const removeCusto = async (id: string) => {
    await supabase.from('custos_oficina').delete().eq('id', id);
    setCustosOficina(prev => prev.filter(c => c.id !== id));
    toast.success('Custo removido');
  };

  const handleSaveFinanceiro = async () => {
    setSavingFin(true);
    toast.success('Abatimentos salvos!');
    setSavingFin(false);
    onOpenChange(false);
  };

  // ---- NF-e de compra ----
  const podeEmitirNfe = aprovacaoStatus === 'aprovada' && contratoGerado && consultaRealizada;

  const toggleEtapa = (etapa: string, checked: boolean) => {
    if (etapa === 'NF EMITIDA') return; // estado dirigido pela emissao da NF-e, nao manual
    if (etapa === 'CONSULTA REALIZADA') return; // vem da consulta veicular, nao editavel aqui
    if (etapa === 'TRANSFERÊNCIA CONCLUÍDA' && checked) {
      // pre-selecionar destino atual (se houver) e abrir popup
      const cur = etapas.find(e => e.etapa === etapa)?.destino_transferencia;
      setDestinoValue((cur === 'novo_proprietario' ? 'novo_proprietario' : 'loja'));
      setDestinoDialogOpen(true);
      return;
    }
    setEtapas(prev =>
      prev.map(e =>
        e.etapa === etapa
          ? {
              ...e,
              concluida: checked,
              data_conclusao: checked ? (e.data_conclusao || new Date().toISOString()) : null,
              destino_transferencia: etapa === 'TRANSFERÊNCIA CONCLUÍDA' && !checked ? null : e.destino_transferencia,
            }
          : e
      )
    );
  };

  const confirmDestino = () => {
    setEtapas(prev =>
      prev.map(e =>
        e.etapa === 'TRANSFERÊNCIA CONCLUÍDA'
          ? {
              ...e,
              concluida: true,
              data_conclusao: e.data_conclusao || new Date().toISOString(),
              destino_transferencia: destinoValue,
            }
          : e
      )
    );
    setDestinoDialogOpen(false);
  };

  const setDate = (etapa: string, date: Date | undefined) => {
    if (!date) return;
    setEtapas(prev =>
      prev.map(e => {
        if (e.etapa !== etapa) return e;
        const existing = e.data_conclusao ? new Date(e.data_conclusao) : new Date();
        date.setHours(existing.getHours(), existing.getMinutes());
        return { ...e, data_conclusao: date.toISOString(), concluida: true };
      })
    );
  };

  const setTime = (etapa: string, hours: number, minutes: number) => {
    setEtapas(prev =>
      prev.map(e => {
        if (e.etapa !== etapa) return e;
        const d = e.data_conclusao ? new Date(e.data_conclusao) : new Date();
        d.setHours(hours, minutes);
        return { ...e, data_conclusao: d.toISOString(), concluida: true };
      })
    );
  };

  const clearDate = (etapa: string) => {
    setEtapas(prev =>
      prev.map(e =>
        e.etapa === etapa ? { ...e, data_conclusao: null, concluida: false } : e
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = etapas.map(e => ({
        id: e.id,
        avaliacao_id: avaliacaoId,
        etapa: e.etapa,
        // A etapa NF-E e dirigida pela emissao da NF-e, nao pelo estado manual.
        concluida: e.etapa === 'NF EMITIDA' ? nfeEmitida : e.concluida,
        data_conclusao: e.etapa === 'NF EMITIDA' ? (nfeCompra?.data_emissao ?? null) : e.data_conclusao,
        destino_transferencia: e.etapa === 'TRANSFERÊNCIA CONCLUÍDA' ? (e.destino_transferencia ?? null) : null,
      }));

      const { error: persistError } = await persistChecklistRows({
        table: 'pos_compra_processos',
        rows,
      });

      if (persistError) {
        toast.error(`Erro ao salvar checks: ${persistError.message}`);
        setSaving(false);
        return;
      }

      // Determine status
      let newStatus = 'aprovada';
      // CONSULTA REALIZADA vem preenchida automaticamente da consulta veicular;
      // por si so (ou so com observacao) nao coloca o processo "em andamento".
      const anyConcluida = etapas.some(e => e.etapa !== 'CONSULTA REALIZADA' && e.concluida) || nfeEmitida;
      const transferenciaConcluida = etapas.find(e => e.etapa === 'TRANSFERÊNCIA CONCLUÍDA')?.concluida;
      const processoPausado = etapas.find(e => e.etapa === 'PROCESSO PAUSADO')?.concluida;
      const docDespachante = etapas.find(e => e.etapa === 'DOCUMENTAÇÃO COM DESPACHANTE')?.concluida;

      if (transferenciaConcluida) {
        newStatus = 'concluido';
      } else if (processoPausado) {
        newStatus = 'pausado';
      } else if (docDespachante) {
        newStatus = 'doc_despachante';
      } else if (anyConcluida) {
        newStatus = 'em_andamento';
      }

      // Update avaliacoes
      const { error: updateError } = await supabase
        .from('avaliacoes')
        .update({ pos_compra_status: newStatus } as any)
        .eq('id', avaliacaoId);

      if (updateError) {
        toast.error(`Erro ao atualizar status: ${updateError.message}`);
        setSaving(false);
        return;
      }

      // Record status history for special transitions
      const specialEtapas = ['DOCUMENTAÇÃO COM DESPACHANTE', 'PROCESSO PAUSADO', 'TRANSFERÊNCIA CONCLUÍDA'];
      if (newStatus !== previousStatus) {
        const statusLabels: Record<string, string> = {
          em_aberto: 'Em Aberto',
          aprovada: 'Aprovada',
          em_andamento: 'Pós-Compra em andamento',
          doc_despachante: 'Doc. com Despachante',
          pausado: 'Pausado',
          concluido: 'Concluído',
        };

        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('status_history').insert({
          entity_id: avaliacaoId,
          entity_type: 'pos_compra',
          status: statusLabels[newStatus] || newStatus,
          changed_by: user?.id,
          changed_by_name: userName || 'Sistema',
        });
      }

      toast.success('Processo salvo com sucesso!');
      onStatusChanged?.(newStatus);
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar processo');
    } finally {
      setSaving(false);
    }
  };

  const concluidas = etapas.filter(e => (e.etapa === 'NF EMITIDA' ? nfeEmitida : e.concluida)).length;
  const statusLabel = concluidas === ETAPAS.length ? 'CONCLUÍDO' : 'APROVADA';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo Pós-Compra
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
          <div className="w-max mx-auto flex items-center rounded-md bg-muted p-1 text-muted-foreground mb-3">
            <button
              type="button"
              onClick={() => setAba('processo')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none ${aba === 'processo' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:text-foreground'}`}
            >
              Processo
            </button>
            <button
              type="button"
              onClick={() => setAba('financeiro')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none ${aba === 'financeiro' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:text-foreground'}`}
            >
              Abatimentos
            </button>
          </div>

          {aba === 'processo' && (
          <div className="space-y-1">
            <div className="text-center mb-4">
              <Badge variant="outline" className="text-xs">
                {statusLabel} ({concluidas}/{ETAPAS.length})
              </Badge>
            </div>

            {etapas.map((e, idx) => {
              const isNf = e.etapa === 'NF EMITIDA';
              const isConsulta = e.etapa === 'CONSULTA REALIZADA';
              const marcada = isNf ? nfeEmitida : e.concluida;
              // Etapa ja salva com data -> travada (so o X libera).
              const dataBloqueada = !isNf && !isConsulta && !!e.data_conclusao && e.data_conclusao === datasSalvas[e.etapa];
              return (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="grid grid-cols-[auto_1fr_6rem_11rem_2rem] items-center gap-3 py-3">
                  {/* col 1: check */}
                  <Checkbox
                    checked={marcada}
                    disabled={isNf || isConsulta || dataBloqueada}
                    onCheckedChange={(checked) => toggleEtapa(e.etapa, !!checked)}
                  />

                  {/* col 2: descricao */}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold uppercase ${marcada ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {isNf ? 'NF-e' : e.etapa}
                    </p>
                    {isNf && nfeEmitida && (nfeCompra?.numero || nfeCompra?.serie) && (
                      <p className="text-xs text-muted-foreground">
                        Nº {nfeCompra?.numero || '-'} / Série {nfeCompra?.serie || '-'}
                      </p>
                    )}
                    {isNf && nfeErro && (
                      <p className="text-xs text-destructive flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {nfeCompra?.erro_mensagem || 'Falha na emissão da NF-e'}
                      </p>
                    )}
                    {e.etapa === 'TRANSFERÊNCIA CONCLUÍDA' && e.concluida && e.destino_transferencia && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestinoValue(e.destino_transferencia === 'novo_proprietario' ? 'novo_proprietario' : 'loja');
                          setDestinoDialogOpen(true);
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        {e.destino_transferencia === 'loja' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        Destino: {e.destino_transferencia === 'loja' ? 'Loja' : 'Novo Proprietário'}
                      </button>
                    )}
                  </div>

                  {isNf && !nfeEmitida ? (
                    /* NF-e ainda nao emitida: ocupa as 3 colunas da direita */
                    <div className="col-span-3 flex items-center justify-end gap-2">
                      {nfePendente ? (
                        <>
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" /> Emitindo NF-e…
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-9 gap-1.5" disabled={emitindoNfe} onClick={consultarNfe}>
                            <RefreshCw className={`h-4 w-4 ${emitindoNfe ? 'animate-spin' : ''}`} /> Atualizar
                          </Button>
                        </>
                      ) : nfeErro ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={!podeEmitirNfe || emitindoNfe}
                          onClick={() => onEmitirNfe?.()}
                        >
                          {emitindoNfe ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Tentar novamente
                        </Button>
                      ) : (
                        <Button
                          variant={podeEmitirNfe ? 'default' : 'outline'}
                          size="sm"
                          className="h-9 gap-2 text-sm"
                          disabled={!podeEmitirNfe || emitindoNfe}
                          title={podeEmitirNfe ? undefined : 'Disponível após aprovação, contrato gerado e consulta realizada'}
                          onClick={() => onEmitirNfe?.()}
                        >
                          {emitindoNfe ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Emitir NF-e
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* col 3: NF-e (so NF-e) — abre a mesma tela de emissão (lá tem o botão de
                          Baixar DANFE já autorizada, e a opção de emitir em Produção depois da
                          homologação) — não o DANFE direto aqui. */}
                      <div className="flex justify-end">
                        {isNf && nfeEmitida && (
                          <Button size="sm" className="h-8 gap-1.5" onClick={() => onEmitirNfe?.()}>
                            <FileText className="h-4 w-4" /> NF
                          </Button>
                        )}
                      </div>

                      {/* col 4: data */}
                      <div className="flex justify-end">
                        {isNf ? (
                          <span className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {nfeCompra?.data_emissao ? format(new Date(nfeCompra.data_emissao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                          </span>
                        ) : isConsulta ? (
                          <span className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {e.data_conclusao ? format(new Date(e.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                          </span>
                        ) : dataBloqueada ? (
                          <span
                            className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap"
                            title="Etapa salva — remova (✕) para alterar"
                          >
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {format(new Date(e.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        ) : (
                          <Popover open={calendarOpen === e.etapa} onOpenChange={(o) => setCalendarOpen(o ? e.etapa : null)}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-9 px-3 gap-2 text-sm">
                                <CalendarIcon className="h-4 w-4" />
                                {e.data_conclusao ? format(new Date(e.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'Data/Hora'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                selected={e.data_conclusao ? new Date(e.data_conclusao) : undefined}
                                onSelect={(d) => setDate(e.etapa, d)}
                                locale={ptBR}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                              <div className="flex items-center gap-2 px-3 pb-3 border-t pt-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="time"
                                  className="w-auto h-8 text-sm"
                                  value={e.data_conclusao ? format(new Date(e.data_conclusao), 'HH:mm') : format(new Date(), 'HH:mm')}
                                  onChange={(ev) => {
                                    const [h, m] = ev.target.value.split(':').map(Number);
                                    setTime(e.etapa, h, m);
                                  }}
                                />
                                <Button size="sm" variant="default" className="ml-auto h-8" onClick={() => setCalendarOpen(null)}>OK</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>

                      {/* col 5: X */}
                      <div className="flex justify-end">
                        {!isNf && !isConsulta && e.data_conclusao && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearDate(e.etapa)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </React.Fragment>
              );
            })}

            <Separator />
            {atendimentoId && (
              <div className="pt-3">
                <AtendimentoObservacoes idOperacao={atendimentoId} />
              </div>
            )}
            <div className="flex justify-end pt-3">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
          )}

          {aba === 'financeiro' && (
          <div className="space-y-6 pt-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Abatimentos</h3>
              <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className="text-xs font-medium">Responsável</label>
                  <Select value={newResp} onValueChange={setNewResp}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cliente">Cliente</SelectItem>
                      <SelectItem value="Loja">Loja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Descrição</label>
                  <Input className="mt-1 h-9" value={newDesc} onChange={e => { const v = e.target.value; setNewDesc(v.charAt(0).toUpperCase() + v.slice(1)); }} placeholder="Descrição" />
                </div>
                <div>
                  <label className="text-xs font-medium">Valor</label>
                  <div className="relative mt-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input className="pl-7 h-9" value={newValor} onChange={e => setNewValor(formatCurrencyInput(e.target.value))} inputMode="numeric" placeholder="0,00" />
                  </div>
                </div>
                <Button size="sm" className="h-9" onClick={addCusto}><Plus className="h-4 w-4" /></Button>
              </div>

              {custosOficina.length > 0 && (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {custosOficina.map((c: any) => {
                    const val = c.valor_executado || c.valor_previsto || 0;
                    if (val <= 0) return null;
                    const isAbatido = (c.responsavel || '').toLowerCase() === 'cliente';
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
                          {(c.tipo || '').toUpperCase().replace('PECA', 'PEÇA').replace('SERVICO', 'SERVIÇO')}
                        </span>
                        <span className="flex-1 truncate text-xs font-medium">
                          {(c.responsavel || '').toUpperCase()} - {(c.detalhes || '-').toUpperCase()}
                        </span>
                        <span className={`font-semibold text-sm whitespace-nowrap ${isAbatido ? 'text-destructive' : 'text-foreground'}`}>
                          {formatCurrency(val)}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCusto(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border-2 border-muted bg-muted/30 p-3 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground">Valor de Fechamento</span>
                  <span className="text-lg font-bold">{formatCurrency(parseCurrencyInput(valorFechamento))}</span>
                </div>
                <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground">Total de Abatimentos</span>
                  <span className="text-lg font-bold text-destructive">{formatCurrency(abatimentos)}</span>
                </div>
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground">Valor de Repasse</span>
                  <span className={`text-lg font-bold ${repasseNum >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(repasseNum > 0 ? repasseNum : 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveFinanceiro} disabled={savingFin} className="gap-1.5">
                {savingFin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
          )}
          </>
        )}
      </DialogContent>

      <Dialog open={destinoDialogOpen} onOpenChange={setDestinoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Destino da Transferência</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-4">Para onde a moto foi transferida?</p>
            <RadioGroup value={destinoValue} onValueChange={(v: any) => setDestinoValue(v)} className="space-y-3">
              <div className="flex items-center space-x-2 border rounded-md p-3 cursor-pointer hover:bg-accent" onClick={() => setDestinoValue('loja')}>
                <RadioGroupItem value="loja" id="dest-loja" />
                <Building2 className="h-4 w-4 text-primary" />
                <Label htmlFor="dest-loja" className="cursor-pointer flex-1">Loja</Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-3 cursor-pointer hover:bg-accent" onClick={() => setDestinoValue('novo_proprietario')}>
                <RadioGroupItem value="novo_proprietario" id="dest-novo" />
                <User className="h-4 w-4 text-primary" />
                <Label htmlFor="dest-novo" className="cursor-pointer flex-1">Novo Proprietário</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDestinoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmDestino}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Dialog>
  );
};

export default PosCompraProcessoDialog;
