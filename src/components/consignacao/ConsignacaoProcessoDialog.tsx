import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save, FileText, RefreshCw, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { listarAbatimentosForaDaOficina, recalcularRepasseCompra, type AbatimentoForaDaOficina } from '@/lib/abatimentosCliente';
import { persistChecklistRows } from '@/lib/persistChecklistRows';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { nfeBotaoClasse } from '@/lib/nfeTag';
import { cn } from '@/lib/utils';

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseCurrencyInput = (value: string): number => parseInt(value.replace(/\D/g, '') || '0', 10) / 100;
const formatCurrency = (v: number | null | undefined) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ETAPAS = [
  'CONTRATO ASSINADO',
  'CONSULTA REALIZADA',
  'NF EMITIDA',
  'PROCESSO PAUSADO',
];

interface EtapaData {
  id?: string;
  etapa: string;
  concluida: boolean;
  data_conclusao: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  onStatusChanged?: (newStatus: string) => void;
  onEmitirNfe?: () => void;
}

const ConsignacaoProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, onStatusChanged, onEmitirNfe }) => {
  const { userName } = useAuth();
  const [etapas, setEtapas] = useState<EtapaData[]>(
    ETAPAS.map(e => ({ etapa: e, concluida: false, data_conclusao: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);
  const [datasSalvas, setDatasSalvas] = useState<Record<string, string | null>>({});
  const [previousStatus, setPreviousStatus] = useState('em_aberto');

  // Abas: "processo" (checklist de etapas) | "abatimentos" (mesma estrutura/
  // lógica do Pós-Compra — custos_oficina é uma tabela por avaliação, não
  // exclusiva de um processo).
  const [aba, setAba] = useState<'processo' | 'abatimentos'>('processo');
  const [valorConsignacao, setValorConsignacao] = useState('');
  const [custosOficina, setCustosOficina] = useState<any[]>([]);
  // Previsão de custos do cliente + custos do cliente lançados na intermediação:
  // também abatem do repasse (todo custo do cliente abate), igual ao compromisso.
  const [abatimentosForaOficina, setAbatimentosForaOficina] = useState(0);
  // Itens desses abatimentos, listados só para leitura junto dos custos de oficina.
  const [itensForaOficina, setItensForaOficina] = useState<AbatimentoForaDaOficina[]>([]);
  const [savingFin, setSavingFin] = useState(false);
  const [newResp, setNewResp] = useState('Cliente');
  const [newTipo] = useState('Serviço');
  const [newDesc, setNewDesc] = useState('');
  const [newValor, setNewValor] = useState('');

  // ---- NF-e de entrada em consignação ----
  const nfe = useNfeCompra(avaliacaoId, open, 'consignacao');
  const nfeEmitida = nfe.emitida;
  const nfePendente = nfe.pendente;
  const nfeErro = nfe.erro;
  const emitindoNfe = nfe.loading;
  const [consultaRealizada, setConsultaRealizada] = useState(false);
  const [contratoAssinado, setContratoAssinado] = useState(false);
  const podeEmitirNfe = contratoAssinado && consultaRealizada;

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [{ data: processoData }, { data: avData }, { data: consultaHistory }, { data: nfeData }, { data: contratoConsig }, { data: custosData }] = await Promise.all([
        supabase
          .from('consignacao_processos' as any)
          .select('id, etapa, concluida, data_conclusao')
          .eq('avaliacao_id', avaliacaoId),
        supabase
          .from('avaliacoes')
          .select('atendimento_id, consignacao_status, consulta_realizada, valor_consignacao_nota, avaliacao_consignacao')
          .eq('id', avaliacaoId)
          .maybeSingle(),
        supabase
          .from('status_history')
          .select('created_at')
          .eq('entity_id', avaliacaoId)
          .eq('entity_type', 'consulta')
          .eq('status', 'consulta_realizada')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('nfe_entradas' as any)
          .select('*')
          .eq('avaliacao_id', avaliacaoId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('contratos_consignacao')
          .select('id')
          .eq('avaliacao_id', avaliacaoId)
          .limit(1),
        supabase.from('custos_oficina').select('*').eq('avaliacao_id', avaliacaoId).order('created_at'),
      ]);
      nfe.setNfe((nfeData as any[])?.[0] || null);
      setCustosOficina(custosData || []);
      listarAbatimentosForaDaOficina(avaliacaoId).then((itens) => {
        setItensForaOficina(itens);
        setAbatimentosForaOficina(itens.reduce((sum, i) => sum + i.valor, 0));
      });
      const valorConsig = (avData as any)?.valor_consignacao_nota ?? (avData as any)?.avaliacao_consignacao;
      setValorConsignacao(valorConsig ? formatCurrencyInput(String(Math.round(valorConsig * 100))) : '');



      const map: Record<string, EtapaData> = {};
      if (processoData) {
        for (const d of processoData as any[]) {
          map[d.etapa] = d as EtapaData;
        }
      }

      // Build etapas, pre-filling CONSULTA REALIZADA com a data real
      const consultaRealizada = (avData as any)?.consulta_realizada === true;
      setConsultaRealizada(consultaRealizada);
      setContratoAssinado(((contratoConsig as any[]) || []).length > 0);
      const consultaDate = consultaHistory?.[0]?.created_at || null;
      const built = ETAPAS.map(e => {
        if (map[e]) return map[e];
        if (e === 'CONSULTA REALIZADA' && consultaRealizada) {
          return { etapa: e, concluida: true, data_conclusao: consultaDate || new Date().toISOString() };
        }
        return { etapa: e, concluida: false, data_conclusao: null };
      });

      setEtapas(built);
      const salvas: Record<string, string | null> = {};
      built.forEach((b: any) => { salvas[b.etapa] = b.concluida ? (b.data_conclusao ?? null) : null; });
      setDatasSalvas(salvas);
      setPreviousStatus((avData as any)?.consignacao_status || 'em_aberto');
      setLoading(false);
    };
    load();
  }, [open, avaliacaoId]);

  // ---- Abatimentos (mesma lógica do Pós-Compra) ----
  const abatimentos = custosOficina
    .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0) + abatimentosForaOficina;
  const repasseNum = parseCurrencyInput(valorConsignacao) - abatimentos;

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
    recalcularRepasseCompra(avaliacaoId);
    setNewResp('Cliente');
    setNewDesc('');
    setNewValor('');
  };

  const removeCusto = async (id: string) => {
    await supabase.from('custos_oficina').delete().eq('id', id);
    setCustosOficina(prev => prev.filter(c => c.id !== id));
    recalcularRepasseCompra(avaliacaoId);
    toast.success('Custo removido');
  };

  const handleSaveFinanceiro = async () => {
    setSavingFin(true);
    toast.success('Abatimentos salvos!');
    setSavingFin(false);
    onOpenChange(false);
  };

  const toggleEtapa = (etapa: string, checked: boolean) => {
    if (etapa === 'NF EMITIDA') return; // estado dirigido pela emissao da NF-e
    if (etapa === 'CONSULTA REALIZADA') return;
    setEtapas(prev =>
      prev.map(e =>
        e.etapa === etapa
          ? { ...e, concluida: checked, data_conclusao: checked ? (e.data_conclusao || new Date().toISOString()) : null }
          : e
      )
    );
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
        // A etapa NF-E e dirigida pela emissao da NF-e, nao pelo estado manual —
        // mas preserva concluida=true já salvo (NF emitida fora do sistema/
        // importada) em vez de reverter pra false só por faltar nfe_entradas.
        concluida: e.etapa === 'NF EMITIDA' ? (nfeEmitida || e.concluida) : e.concluida,
        data_conclusao: e.etapa === 'NF EMITIDA' ? (nfe.nfe?.data_emissao ?? e.data_conclusao ?? null) : e.data_conclusao,
      }));

      const { error: persistError } = await persistChecklistRows({
        table: 'consignacao_processos',
        rows,
      });

      if (persistError) {
        toast.error('Erro ao salvar checks: ' + persistError.message);
        return;
      }

      // Determine status based on etapas
      let newStatus = 'em_aberto';
      const nfEtapaConcluida = etapas.find(e => e.etapa === 'NF EMITIDA')?.concluida ?? false;
      const nfEmitida = nfeEmitida || nfEtapaConcluida;
      const anyConcluida = etapas.some(e => e.concluida) || nfEmitida;
      const processoPausado = etapas.find(e => e.etapa === 'PROCESSO PAUSADO')?.concluida;
      const contratoAssinado = etapas.find(e => e.etapa === 'CONTRATO ASSINADO')?.concluida;

      if (nfEmitida) {
        newStatus = 'concluido';
      } else if (processoPausado) {
        newStatus = 'pausado';
      } else if (contratoAssinado) {
        newStatus = 'contrato_assinado';
      } else if (anyConcluida) {
        newStatus = 'contrato_assinado';
      }

      // Update avaliacoes
      const { error: updateError } = await supabase
        .from('avaliacoes')
        .update({ consignacao_status: newStatus } as any)
        .eq('id', avaliacaoId);

      if (updateError) {
        toast.error('Erro ao atualizar status: ' + updateError.message);
        return;
      }

      // Record status history
      if (newStatus !== previousStatus) {
        const statusLabels: Record<string, string> = {
          em_aberto: 'Em Aberto',
          contrato_assinado: 'Contrato Assinado',
          pausado: 'Pausado',
          concluido: 'Concluído',
        };

        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('status_history').insert({
          entity_id: avaliacaoId,
          entity_type: 'consignacao',
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

  const concluidas = etapas.filter(e => (e.etapa === 'NF EMITIDA' ? (nfeEmitida || e.concluida) : e.concluida)).length;
  const statusLabel = concluidas === ETAPAS.length ? 'CONCLUÍDO' : 'EM ABERTO';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo Consignação
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
              onClick={() => setAba('abatimentos')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none ${aba === 'abatimentos' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:text-foreground'}`}
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
              const isConsulta = e.etapa === 'CONSULTA REALIZADA';
              const isNf = e.etapa === 'NF EMITIDA';
              const dataBloqueada = !isConsulta && !isNf && !!e.data_conclusao && e.data_conclusao === datasSalvas[e.etapa];
              const soLeitura = isConsulta || dataBloqueada;
              // "Emitida" cobre tanto a NF rastreada pelo bpm-novo (nfeEmitida)
              // quanto uma já registrada como concluída sem nfe_entradas (emitida
              // fora do sistema, ou avaliação importada) — nesse caso trava do
              // mesmo jeito, só sem o botão de abrir a tela de emissão.
              const nfConcluidaSemRegistro = isNf && !nfeEmitida && e.concluida;
              const marcada = isNf ? (nfeEmitida || e.concluida) : e.concluida;
              return (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
                  <Checkbox
                    checked={marcada}
                    disabled={isConsulta || isNf || dataBloqueada}
                    onCheckedChange={(checked) => toggleEtapa(e.etapa, !!checked)}
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold uppercase ${marcada ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {isNf ? 'NF-e' : e.etapa}
                    </p>
                    {isNf && nfeEmitida && (nfe.nfe?.numero || nfe.nfe?.serie) && (
                      <p className="text-xs text-muted-foreground">Nº {nfe.nfe?.numero || '-'} / Série {nfe.nfe?.serie || '-'}</p>
                    )}
                    {isNf && nfeErro && (
                      <p className="text-xs text-destructive flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {nfe.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                  {isNf && !nfeEmitida && !e.concluida ? (
                    nfePendente ? (
                      <>
                        <Badge variant="outline" className="gap-1.5 text-xs">
                          <Loader2 className="h-3 w-3 animate-spin" /> Emitindo NF-e…
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-9 gap-1.5" disabled={emitindoNfe} onClick={nfe.consultar}>
                          <RefreshCw className={`h-4 w-4 ${emitindoNfe ? 'animate-spin' : ''}`} /> Atualizar
                        </Button>
                      </>
                    ) : nfeErro ? (
                      <Button
                        variant="outline" size="sm"
                        className="h-9 gap-1.5 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={!podeEmitirNfe || emitindoNfe}
                        onClick={() => onEmitirNfe?.()}
                      >
                        <RefreshCw className="h-4 w-4" /> Tentar novamente
                      </Button>
                    ) : (
                      <Button
                        variant={podeEmitirNfe ? 'default' : 'outline'} size="sm" className="h-9 gap-2 text-sm"
                        disabled={!podeEmitirNfe || emitindoNfe}
                        title={podeEmitirNfe ? undefined : 'Disponível após contrato do consignante e consulta realizada'}
                        onClick={() => onEmitirNfe?.()}
                      >
                        <FileText className="h-4 w-4" /> Emitir NF-e
                      </Button>
                    )
                  ) : isNf ? (
                    // Abre a mesma tela de emissão (lá tem o botão de Baixar DANFE já
                    // autorizada, e a opção de emitir em Produção depois da homologação) —
                    // não o DANFE direto aqui. Sem nfe_entradas (nfConcluidaSemRegistro —
                    // emitida fora do sistema ou avaliação importada), não tem tela pra
                    // abrir: só mostra a data já registrada na etapa, travada.
                    <span
                      className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap"
                      title={nfConcluidaSemRegistro ? 'NF emitida fora do bpm-novo (registro da etapa)' : undefined}
                    >
                      {nfeEmitida && (
                        <Button size="sm" className={cn('h-7 gap-1', nfeBotaoClasse(nfe.nfe))} onClick={() => onEmitirNfe?.()}>
                          <FileText className="h-3.5 w-3.5" /> NF-e
                        </Button>
                      )}
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      {(nfe.nfe?.data_emissao ?? e.data_conclusao) ? format(new Date((nfe.nfe?.data_emissao ?? e.data_conclusao)!), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                    </span>
                  ) : soLeitura ? (
                    <span
                      className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap"
                      title={dataBloqueada ? 'Etapa salva — remova (✕) para alterar' : undefined}
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      {e.data_conclusao ? format(new Date(e.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                    </span>
                  ) : (
                    <Popover open={calendarOpen === e.etapa} onOpenChange={(o) => setCalendarOpen(o ? e.etapa : null)}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 px-3 gap-2 text-sm">
                          <CalendarIcon className="h-4 w-4" />
                          {e.data_conclusao
                            ? format(new Date(e.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : 'Data/Hora'
                          }
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
                          <Button size="sm" variant="default" className="ml-auto h-8" onClick={() => setCalendarOpen(null)}>
                            OK
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button
                    variant="ghost" size="icon"
                    className={`h-8 w-8 shrink-0 ${!isConsulta && !isNf && e.data_conclusao ? '' : 'invisible'}`}
                    tabIndex={!isConsulta && !isNf && e.data_conclusao ? 0 : -1}
                    onClick={() => { if (!isConsulta && !isNf && e.data_conclusao) clearDate(e.etapa); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  </div>
                </div>
              </React.Fragment>
              );
            })}

            <Separator />
            <div className="flex justify-end pt-3">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
          )}

          {aba === 'abatimentos' && (
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

              {(custosOficina.length > 0 || itensForaOficina.length > 0) && (
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
                  {/* Abatimentos de fora da oficina (intermediação / previsão): só leitura — edite no contrato de intermediação ou na avaliação. */}
                  {itensForaOficina.map((it, i) => (
                    <div key={`fora-${i}`} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm" title={it.origem === 'intermediacao' ? 'Lançado no contrato de intermediação' : it.origem === 'comissao' ? 'Percentual do contrato de consignação sobre o valor da venda — muda só alterando o percentual' : 'Previsão de custos do cliente da avaliação'}>
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">
                        {it.origem === 'intermediacao' ? 'INTERMEDIAÇÃO' : it.origem === 'comissao' ? 'COMISSÃO' : 'PREVISÃO'}
                      </span>
                      <span className="flex-1 truncate text-xs font-medium">CLIENTE - {it.descricao.toUpperCase()}</span>
                      <span className="font-semibold text-sm whitespace-nowrap text-destructive">{formatCurrency(it.valor)}</span>
                      <span className="h-7 w-7 shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border-2 border-muted bg-muted/30 p-3 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground">Valor de Consignação</span>
                  <span className="text-lg font-bold">{formatCurrency(parseCurrencyInput(valorConsignacao))}</span>
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
    </Dialog>
  );
};

export default ConsignacaoProcessoDialog;
