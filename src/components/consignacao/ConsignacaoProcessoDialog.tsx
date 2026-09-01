import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save, FileText, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { persistChecklistRows } from '@/lib/persistChecklistRows';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';

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
  const [atendimentoId, setAtendimentoId] = useState<string | null>(null);

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
      const [{ data: processoData }, { data: avData }, { data: consultaHistory }, { data: nfeData }, { data: contratoConsig }] = await Promise.all([
        supabase
          .from('consignacao_processos' as any)
          .select('id, etapa, concluida, data_conclusao')
          .eq('avaliacao_id', avaliacaoId),
        supabase
          .from('avaliacoes')
          .select('atendimento_id, consignacao_status, consulta_realizada')
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
      ]);
      nfe.setNfe((nfeData as any[])?.[0] || null);



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
      setAtendimentoId((avData as any)?.atendimento_id || null);
      setPreviousStatus((avData as any)?.consignacao_status || 'em_aberto');
      setLoading(false);
    };
    load();
  }, [open, avaliacaoId]);

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
        concluida: e.etapa === 'NF EMITIDA' ? nfeEmitida : e.concluida,
        data_conclusao: e.etapa === 'NF EMITIDA' ? (nfe.nfe?.data_emissao ?? null) : e.data_conclusao,
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
      const anyConcluida = etapas.some(e => e.concluida) || nfeEmitida;
      const nfEmitida = nfeEmitida;
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

  const concluidas = etapas.filter(e => (e.etapa === 'NF EMITIDA' ? nfeEmitida : e.concluida)).length;
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
              const marcada = isNf ? nfeEmitida : e.concluida;
              return (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="grid grid-cols-[auto_1fr_11rem_2rem] items-center gap-3 py-3">
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
                  {isNf && !nfeEmitida ? (
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {nfePendente ? (
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
                      )}
                    </div>
                  ) : (
                  <>
                  <div className="flex justify-end">
                    {isNf ? (
                      <span className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap">
                        {nfe.nfe?.caminho_danfe && (
                          <Button size="sm" className="h-7 gap-1" onClick={() => window.open(nfe.nfe.caminho_danfe, '_blank', 'noopener')}>
                            <ExternalLink className="h-3.5 w-3.5" /> DANFE
                          </Button>
                        )}
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        {nfe.nfe?.data_emissao ? format(new Date(nfe.nfe.data_emissao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}
                      </span>
                    ) : soLeitura ? (
                      <span
                        className="flex items-center gap-2 pr-3 text-sm text-muted-foreground whitespace-nowrap"
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
                  </div>
                  <div className="flex justify-end">
                    {!isConsulta && !isNf && e.data_conclusao && (
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
      </DialogContent>
    </Dialog>
  );
};

export default ConsignacaoProcessoDialog;
