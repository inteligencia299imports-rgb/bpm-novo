import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ContratoConsignanteDialog from '@/components/intermediacao/ContratoConsignanteDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
  observacoesField?: string;
  statusRules?: {
    concluded?: string;
    special?: { etapa: string; status: string };
    default?: string;
  };
  onStatusChanged?: (newStatus: string) => void;
  showContratoConsignante?: boolean;
  onContratoSaved?: () => void;
}

const ProcessoDialog: React.FC<Props> = ({ 
  open, onOpenChange, atendimentoId, 
  customEtapas, 
  statusField = 'pos_venda_status',
  observacoesField = 'pos_venda_observacoes',
  statusRules,
  onStatusChanged,
  showContratoConsignante,
  onContratoSaved,
}) => {
  const ETAPAS = customEtapas || DEFAULT_ETAPAS;
  const [etapas, setEtapas] = useState<EtapaData[]>(
    ETAPAS.map(e => ({ etapa: e, concluida: false, data_conclusao: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [contratoConsignanteOpen, setContratoConsignanteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [{ data }, { data: atData }] = await Promise.all([
        supabase
          .from('pos_venda_processos')
          .select('etapa, concluida, data_conclusao')
          .eq('atendimento_id', atendimentoId),
        supabase
          .from('atendimentos')
          .select(observacoesField)
          .eq('id', atendimentoId)
          .maybeSingle(),
      ]);

      const map: Record<string, EtapaData> = {};
      if (data) {
        for (const d of data) {
          map[d.etapa] = d as EtapaData;
        }
      }
      setEtapas(ETAPAS.map(e => map[e] || { etapa: e, concluida: false, data_conclusao: null }));
      setObservacoes((atData as any)?.[observacoesField] || '');
      setLoading(false);
    };
    load();
  }, [open, atendimentoId, observacoesField]);

  const toggleEtapa = (etapa: string, checked: boolean) => {
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
        atendimento_id: atendimentoId,
        etapa: e.etapa,
        concluida: e.concluida,
        data_conclusao: e.data_conclusao,
      }));

      await supabase
        .from('pos_venda_processos')
        .upsert(rows as any, { onConflict: 'atendimento_id,etapa' });

      // Determine status
      let newStatus = 'em_aberto';
      const anyConcluida = etapas.some(e => e.concluida);

      if (statusRules) {
        const concludedEtapa = statusRules.concluded ? etapas.find(e => e.etapa === statusRules.concluded)?.concluida : false;
        const specialEtapa = statusRules.special ? etapas.find(e => e.etapa === statusRules.special!.etapa)?.concluida : false;

        if (concludedEtapa) {
          // Check if there's a "PREVISÃO DE PAGAMENTO" etapa with a date set
          const previsaoEtapa = etapas.find(e => e.etapa === 'PREVISÃO DE PAGAMENTO');
          if (previsaoEtapa?.data_conclusao) {
            // If previsão date is more than 1 day past, fully concluded
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

      await supabase
        .from('atendimentos')
        .update({ [statusField]: newStatus, [observacoesField]: observacoes } as any)
        .eq('id', atendimentoId);

      toast.success('Processo salvo com sucesso!');
      onStatusChanged?.(newStatus);
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar processo');
    } finally {
      setSaving(false);
    }
  };

  const concluidas = etapas.filter(e => e.concluida).length;
  const statusLabel = concluidas === ETAPAS.length ? 'CONCLUÍDO' : 'EM ABERTO';

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
                {statusLabel} ({concluidas}/{ETAPAS.length})
              </Badge>
            </div>

            {etapas.map((e, idx) => {
              const isPrevisaoPagamento = e.etapa === 'PREVISÃO DE PAGAMENTO';
              return (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="flex items-center gap-3 py-3">
                  {isPrevisaoPagamento ? (
                    <div className="w-4" />
                  ) : (
                    <Checkbox
                      checked={e.concluida}
                      onCheckedChange={(checked) => toggleEtapa(e.etapa, !!checked)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold uppercase ${e.concluida || (isPrevisaoPagamento && e.data_conclusao) ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {e.etapa}
                    </p>
                    {!isPrevisaoPagamento && e.concluida && e.data_conclusao && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.data_conclusao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    {isPrevisaoPagamento && e.data_conclusao && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.data_conclusao), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isPrevisaoPagamento ? (
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
                    {e.data_conclusao && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearDate(e.etapa)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </React.Fragment>
              );
            })}

            {showContratoConsignante && (
              <ContratoConsignanteDialog
                open={contratoConsignanteOpen}
                onOpenChange={setContratoConsignanteOpen}
                atendimentoId={atendimentoId}
                onSaved={onContratoSaved}
              />
            )}

            <Separator />
            <div className="space-y-2 pt-3">
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                placeholder="Observações do processo..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
              />
            </div>
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
