import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save, FileText, RefreshCw, ExternalLink, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ContratoConsignanteDialog from '@/components/intermediacao/ContratoConsignanteDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { persistChecklistRows } from '@/lib/persistChecklistRows';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { TIPOS_PROPRIA } from '@/lib/tipoAquisicao';
import { toast } from 'sonner';

const NF_VENDA = 'NF-E DE VENDA';
const NF_TROCA = 'NF-E DE ENTRADA (TROCA)';

const DEFAULT_ETAPAS = [
  'CHECK-LIST',
  'VISTORIA',
  'ENTREGA DA MOTO',
  'COMUNICADO DE VENDA',
  'DOC. FORMALIZADO',
  'DOCUMENTAÇÃO COM DESPACHANTE',
  'DOC. OUTRA UF',
  'PENDENTE (BOLETO)',
  'TRANSFERÊNCIA FINALIZADA',
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
  atendimentoId: string;
  customEtapas?: string[];
  statusField?: string;
  statusRules?: {
    concluded?: string;
    special?: { etapa: string; status: string };
    default?: string;
  };
  onStatusChanged?: (newStatus: string) => void;
  showContratoConsignante?: boolean;
  onContratoSaved?: () => void;
  /** Abre a tela de revisão da NF-e de venda (etapa NF-E DE VENDA). */
  onEmitirNfe?: () => void;
  /** Abre a tela de emissão da NF-e de entrada da moto de troca (etapa NF-E DE ENTRADA (TROCA)). */
  onEmitirNfeTroca?: (avaliacaoId: string) => void;
  /** Navega para o Pós-Compra da avaliação da moto de troca. */
  onNavigateToPosCompra?: (avaliacaoId: string) => void;
}

const ProcessoDialog: React.FC<Props> = ({
  open, onOpenChange, atendimentoId,
  customEtapas,
  statusField = 'pos_venda_status',
  statusRules,
  onStatusChanged,
  showContratoConsignante,
  onContratoSaved,
  onEmitirNfe,
  onEmitirNfeTroca,
  onNavigateToPosCompra,
}) => {
  const isPosVenda = !customEtapas;
  const [etapas, setEtapas] = useState<EtapaData[]>(
    (customEtapas || DEFAULT_ETAPAS).map(e => ({ etapa: e, concluida: false, data_conclusao: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);
  const [datasSalvas, setDatasSalvas] = useState<Record<string, string | null>>({});
  const [contratoConsignanteOpen, setContratoConsignanteOpen] = useState(false);

  // ---- Contexto pós-venda (moto vendida + troca) ----
  const [estoqueMoto, setEstoqueMoto] = useState<any>(null);
  const [interesse, setInteresse] = useState<string | null>(null);
  const [contratoVendaGerado, setContratoVendaGerado] = useState(false);
  const [trocaAvaliacaoId, setTrocaAvaliacaoId] = useState<string>('');

  const eh0km = estoqueMoto?.fonte === '0km';
  const tipoVenda = eh0km ? 'venda_0km' : 'venda_seminova';

  const nfeVenda = useNfeCompra(isPosVenda ? atendimentoId : '', open && isPosVenda, tipoVenda, 'atendimento');
  const nfeTroca = useNfeCompra(trocaAvaliacaoId, open && !!trocaAvaliacaoId, 'compra', 'avaliacao');

  const podeEmitirNfeVenda =
    !!estoqueMoto && ['vendido', 'sinal'].includes(estoqueMoto.status) && contratoVendaGerado;

  const etapaNames = useMemo(() => {
    if (customEtapas) return customEtapas;
    const names = [...DEFAULT_ETAPAS];
    if (estoqueMoto) {
      const i = names.indexOf('ENTREGA DA MOTO');
      names.splice(i + 1, 0, NF_VENDA);
      if (interesse === 'trocar' && trocaAvaliacaoId) names.splice(i + 2, 0, NF_TROCA);
    }
    return names;
  }, [customEtapas, estoqueMoto, interesse, trocaAvaliacaoId]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const load = async () => {
      setLoading(true);

      const names = customEtapas ? [...customEtapas] : [...DEFAULT_ETAPAS];
      let estMoto: any = null;
      let inter: string | null = null;
      let trocaAvId = '';
      let contratoVenda = false;

      if (isPosVenda) {
        const [{ data: at }, { data: mi }, { data: contratos }] = await Promise.all([
          supabase.from('atendimentos_motos').select('interesse').eq('id', atendimentoId).maybeSingle(),
          supabase.from('motos_interesse').select('estoque_moto_id, estoque_tipo').eq('atendimento_id', atendimentoId)
            .not('estoque_moto_id', 'is', null).limit(1).maybeSingle(),
          supabase.from('contratos').select('id, ipva_tipo').eq('atendimento_id', atendimentoId),
        ]);
        inter = (at as any)?.interesse ?? null;
        contratoVenda = ((contratos as any[]) || []).some(c => (c.ipva_tipo ?? '') !== 'COMPRA');

        if ((mi as any)?.estoque_moto_id) {
          const eh0km = (mi as any).estoque_tipo === '0km';
          const { data: em } = await supabase
            .from(eh0km ? 'estoque_motos_novas' : 'estoque_motos')
            .select('id, status')
            .eq('id', (mi as any).estoque_moto_id)
            .maybeSingle();
          estMoto = em ? { ...em, fonte: eh0km ? '0km' : 'seminova' } : null;
        }

        if (inter === 'trocar') {
          const { data: tav } = await supabase
            .from('avaliacoes')
            .select('id')
            .eq('atendimento_id', atendimentoId)
            .in('tipo_aquisicao', TIPOS_PROPRIA)
            .in('situacao', ['adquirida', 'estoque'])
            .limit(1)
            .maybeSingle();
          trocaAvId = (tav as any)?.id ?? '';
        }

        if (estMoto) {
          const i = names.indexOf('ENTREGA DA MOTO');
          names.splice(i + 1, 0, NF_VENDA);
          if (inter === 'trocar' && trocaAvId) names.splice(i + 2, 0, NF_TROCA);
        }
      }

      const { data } = await supabase
        .from('pos_venda_processos')
        .select('id, etapa, concluida, data_conclusao')
        .eq('atendimento_id', atendimentoId);

      if (cancel) return;

      setEstoqueMoto(estMoto);
      setInteresse(inter);
      setContratoVendaGerado(contratoVenda);
      setTrocaAvaliacaoId(trocaAvId);

      const map: Record<string, EtapaData> = {};
      if (data) {
        for (const d of data) map[d.etapa] = d as EtapaData;
      }
      const built = names.map(e => map[e] || { etapa: e, concluida: false, data_conclusao: null });
      setEtapas(built);
      const salvas: Record<string, string | null> = {};
      built.forEach((b: any) => { salvas[b.etapa] = (b.concluida || b.data_conclusao) ? (b.data_conclusao ?? null) : null; });
      setDatasSalvas(salvas);
      setLoading(false);
    };
    load();
    return () => { cancel = true; };
  }, [open, atendimentoId, customEtapas, isPosVenda]);

  // Carrega a NF-e ao abrir.
  useEffect(() => {
    if (open && isPosVenda) nfeVenda.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, atendimentoId, isPosVenda]);
  useEffect(() => {
    if (open && trocaAvaliacaoId) nfeTroca.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trocaAvaliacaoId]);

  const nfEmitidaDe = (etapa: string) =>
    etapa === NF_VENDA ? nfeVenda.emitida : etapa === NF_TROCA ? nfeTroca.emitida : false;
  const isNfEtapa = (etapa: string) => etapa === NF_VENDA || etapa === NF_TROCA;

  const toggleEtapa = (etapa: string, checked: boolean) => {
    if (isNfEtapa(etapa)) return; // estado dirigido pela emissão da NF-e
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
        atendimento_id: atendimentoId,
        etapa: e.etapa,
        concluida: isNfEtapa(e.etapa) ? nfEmitidaDe(e.etapa) : e.concluida,
        data_conclusao: e.etapa === NF_VENDA
          ? (nfeVenda.nfe?.data_emissao ?? null)
          : e.etapa === NF_TROCA
            ? (nfeTroca.nfe?.data_emissao ?? null)
            : e.data_conclusao,
      }));

      const { error: persistError } = await persistChecklistRows({
        table: 'pos_venda_processos',
        rows,
      });

      if (persistError) {
        toast.error('Erro ao salvar checks: ' + persistError.message);
        return;
      }

      // Determine status
      let newStatus = 'em_aberto';
      const anyConcluida = etapas.some(e => (isNfEtapa(e.etapa) ? nfEmitidaDe(e.etapa) : e.concluida));

      if (statusRules) {
        const concludedEtapa = statusRules.concluded ? etapas.find(e => e.etapa === statusRules.concluded)?.concluida : false;
        const specialEtapa = statusRules.special ? etapas.find(e => e.etapa === statusRules.special!.etapa)?.concluida : false;

        if (concludedEtapa) {
          const previsaoEtapa = etapas.find(e => e.etapa === 'PREVISÃO DE PAGAMENTO');
          if (previsaoEtapa?.data_conclusao) {
            const previsaoDate = new Date(previsaoEtapa.data_conclusao);
            const oneDayAfter = new Date(previsaoDate.getTime() + 24 * 60 * 60 * 1000);
            if (new Date() >= oneDayAfter) {
              newStatus = 'concluido';
            } else {
              newStatus = 'autorizacao_pagamento';
            }
          } else {
            newStatus = 'autorizacao_pagamento';
          }
        } else if (specialEtapa && statusRules.special) {
          newStatus = statusRules.special.status;
        } else if (anyConcluida) {
          newStatus = statusRules.default || 'em_andamento';
        }
      } else {
        // Default pos-venda behavior
        const transferenciaFinalizada = etapas.find(e => e.etapa === 'TRANSFERÊNCIA FINALIZADA')?.concluida;
        const docDespachante = etapas.find(e => e.etapa === 'DOCUMENTAÇÃO COM DESPACHANTE')?.concluida;

        if (transferenciaFinalizada) {
          newStatus = 'concluido';
        } else if (docDespachante) {
          newStatus = 'doc_despachante';
        } else if (anyConcluida) {
          newStatus = 'em_andamento';
        }
      }

      const { error: updateError } = await supabase
        .from('atendimentos_motos')
        .update({ [statusField]: newStatus } as any)
        .eq('id', atendimentoId);

      if (updateError) {
        toast.error('Erro ao atualizar status: ' + updateError.message);
        return;
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

  const concluidas = etapas.filter(e => (isNfEtapa(e.etapa) ? nfEmitidaDe(e.etapa) : e.concluida)).length;
  const statusLabel = concluidas === etapaNames.length ? 'CONCLUÍDO' : 'EM ABERTO';

  // Contrato do consignante abre ocupando a tela (não como pop-up dentro do processo).
  if (showContratoConsignante && contratoConsignanteOpen) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <ContratoConsignanteDialog
            open
            onOpenChange={setContratoConsignanteOpen}
            atendimentoId={atendimentoId}
            onSaved={onContratoSaved}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-center mb-4">
              <Badge variant="outline" className="text-xs">
                {statusLabel} ({concluidas}/{etapaNames.length})
              </Badge>
            </div>

            {etapas.map((e, idx) => {
              const isPrevisaoPagamento = e.etapa === 'PREVISÃO DE PAGAMENTO';
              const isEntregaMoto = e.etapa === 'ENTREGA DA MOTO';
              const isDateOnly = isPrevisaoPagamento || isEntregaMoto;
              const isNfVenda = e.etapa === NF_VENDA;
              const isNfTroca = e.etapa === NF_TROCA;
              const isNf = isNfVenda || isNfTroca;
              const nfeObj = isNfVenda ? nfeVenda : isNfTroca ? nfeTroca : null;
              const nfMarcada = isNf ? !!nfeObj?.emitida : false;
              const dataBloqueada = !isNf && !!e.data_conclusao && e.data_conclusao === datasSalvas[e.etapa];
              const dateFmt = isDateOnly ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm';
              return (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="grid grid-cols-[auto_1fr_11rem_2rem] items-center gap-3 py-3">
                  {isPrevisaoPagamento ? (
                    <div className="w-4" />
                  ) : (
                    <Checkbox
                      checked={isNf ? nfMarcada : e.concluida}
                      disabled={isNf || dataBloqueada}
                      onCheckedChange={(checked) => toggleEtapa(e.etapa, !!checked)}
                    />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold uppercase ${(isNf ? nfMarcada : e.concluida) || (isPrevisaoPagamento && e.data_conclusao) ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {e.etapa}
                    </p>
                    {isNf && nfeObj?.emitida && (nfeObj.nfe?.numero || nfeObj.nfe?.serie) && (
                      <p className="text-xs text-muted-foreground">
                        Nº {nfeObj.nfe?.numero || '-'} / Série {nfeObj.nfe?.serie || '-'}
                      </p>
                    )}
                    {isNfVenda && nfeVenda.erro && (
                      <p className="text-xs text-destructive flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {nfeVenda.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                      </p>
                    )}
                    {isNfTroca && nfeTroca.erro && (
                      <p className="text-xs text-destructive flex items-start gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {nfeTroca.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                      </p>
                    )}
                  </div>

                  {isNfVenda && !nfeVenda.emitida ? (
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {nfeVenda.pendente ? (
                        <>
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" /> Emitindo NF-e…
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-9 gap-1.5" disabled={nfeVenda.loading} onClick={nfeVenda.consultar}>
                            <RefreshCw className={`h-4 w-4 ${nfeVenda.loading ? 'animate-spin' : ''}`} /> Atualizar
                          </Button>
                        </>
                      ) : nfeVenda.erro ? (
                        <Button
                          variant="outline" size="sm"
                          className="h-9 gap-1.5 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={!podeEmitirNfeVenda || nfeVenda.loading}
                          onClick={() => onEmitirNfe?.()}
                        >
                          <RefreshCw className="h-4 w-4" /> Tentar novamente
                        </Button>
                      ) : (
                        <Button
                          variant={podeEmitirNfeVenda ? 'default' : 'outline'} size="sm" className="h-9 gap-2 text-sm"
                          disabled={!podeEmitirNfeVenda || nfeVenda.loading}
                          title={podeEmitirNfeVenda ? undefined : 'Disponível após a venda e o contrato gerado'}
                          onClick={() => onEmitirNfe?.()}
                        >
                          <FileText className="h-4 w-4" /> Emitir NF-e
                        </Button>
                      )}
                    </div>
                  ) : isNfTroca && !nfeTroca.emitida ? (
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {nfeTroca.pendente ? (
                        <>
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" /> Emitindo NF-e…
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-9 gap-1.5" disabled={nfeTroca.loading} onClick={nfeTroca.consultar}>
                            <RefreshCw className={`h-4 w-4 ${nfeTroca.loading ? 'animate-spin' : ''}`} /> Atualizar
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant={nfeTroca.erro ? 'outline' : 'default'} size="sm"
                          className={`h-9 gap-2 text-sm ${nfeTroca.erro ? 'border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive' : ''}`}
                          disabled={!trocaAvaliacaoId || nfeTroca.loading}
                          onClick={() => trocaAvaliacaoId && onEmitirNfeTroca?.(trocaAvaliacaoId)}
                        >
                          {nfeTroca.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          {nfeTroca.erro ? 'Tentar novamente' : 'Emitir NF-e'}
                        </Button>
                      )}
                      {onNavigateToPosCompra && trocaAvaliacaoId && (
                        <Button variant="ghost" size="sm" className="h-9 gap-1.5"
                          onClick={() => onNavigateToPosCompra(trocaAvaliacaoId)}>
                          <ArrowUpRight className="h-4 w-4" /> Pós-Compra
                        </Button>
                      )}
                    </div>
                  ) : isNf ? (
                    <>
                      <div className="flex justify-end">
                        <span className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                          {nfeObj?.nfe?.caminho_danfe && (
                            <Button size="sm" className="h-7 gap-1" onClick={() => window.open(nfeObj.nfe.caminho_danfe, '_blank', 'noopener')}>
                              <ExternalLink className="h-3.5 w-3.5" /> DANFE
                            </Button>
                          )}
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          {nfeObj?.nfe?.data_emissao ? format(new Date(nfeObj.nfe.data_emissao), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
                        </span>
                      </div>
                      <div />
                    </>
                  ) : (
                    <>
                  <div className="flex justify-end">
                    {dataBloqueada ? (
                      <span
                        className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap"
                        title="Etapa salva — remova (✕) para alterar"
                      >
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        {format(new Date(e.data_conclusao!), dateFmt, { locale: ptBR })}
                      </span>
                    ) : isDateOnly ? (
                      <Popover open={calendarOpen === e.etapa} onOpenChange={(o) => setCalendarOpen(o ? e.etapa : null)}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-9 px-3 gap-2 text-sm">
                            <CalendarIcon className="h-4 w-4" />
                            {e.data_conclusao
                              ? format(new Date(e.data_conclusao), "dd/MM/yyyy", { locale: ptBR })
                              : 'Definir data'
                            }
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="single"
                            selected={e.data_conclusao ? new Date(e.data_conclusao) : undefined}
                            onSelect={(d) => {
                              if (d) {
                                setEtapas(prev => prev.map(et =>
                                  et.etapa === e.etapa ? { ...et, data_conclusao: d.toISOString(), concluida: true } : et
                                ));
                                setCalendarOpen(null);
                              }
                            }}
                            locale={ptBR}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
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
                  </div>
                  <div className="flex justify-end">
                    {e.data_conclusao && (
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
            <div className="flex justify-end pt-3">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProcessoDialog;
