import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ETAPAS = [
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
}

const ProcessoDialog: React.FC<Props> = ({ open, onOpenChange, atendimentoId }) => {
  const [etapas, setEtapas] = useState<EtapaData[]>(
    ETAPAS.map(e => ({ etapa: e, concluida: false, data_conclusao: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('pos_venda_processos')
        .select('etapa, concluida, data_conclusao')
        .eq('atendimento_id', atendimentoId);

      const map: Record<string, EtapaData> = {};
      if (data) {
        for (const d of data) {
          map[d.etapa] = d as EtapaData;
        }
      }
      setEtapas(ETAPAS.map(e => map[e] || { etapa: e, concluida: false, data_conclusao: null }));
      setLoading(false);
    };
    load();
  }, [open, atendimentoId]);

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
      for (const e of etapas) {
        const { data: existing } = await supabase
          .from('pos_venda_processos')
          .select('id')
          .eq('atendimento_id', atendimentoId)
          .eq('etapa', e.etapa)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('pos_venda_processos')
            .update({ concluida: e.concluida, data_conclusao: e.data_conclusao } as any)
            .eq('id', existing.id);
        } else {
          await supabase
            .from('pos_venda_processos')
            .insert({ atendimento_id: atendimentoId, etapa: e.etapa, concluida: e.concluida, data_conclusao: e.data_conclusao } as any);
        }
      }

      // Determine pos_venda_status based on checked etapas
      const transferenciaFinalizada = etapas.find(e => e.etapa === 'TRANSFERÊNCIA FINALIZADA')?.concluida;
      const docDespachante = etapas.find(e => e.etapa === 'DOCUMENTAÇÃO COM DESPACHANTE')?.concluida;
      const anyConcluida = etapas.some(e => e.concluida);

      let newStatus = 'em_aberto';
      if (transferenciaFinalizada) {
        newStatus = 'concluido';
      } else if (docDespachante) {
        newStatus = 'doc_despachante';
      } else if (anyConcluida) {
        newStatus = 'em_andamento';
      }

      await supabase
        .from('atendimentos')
        .update({ pos_venda_status: newStatus } as any)
        .eq('id', atendimentoId);

      toast.success('Processo salvo com sucesso!');
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

            {etapas.map((e, idx) => (
              <React.Fragment key={e.etapa}>
                {idx > 0 && <Separator />}
                <div className="flex items-center gap-3 py-3">
                  <Checkbox
                    checked={e.concluida}
                    onCheckedChange={(checked) => toggleEtapa(e.etapa, !!checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold uppercase ${e.concluida ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {e.etapa}
                    </p>
                    {e.concluida && e.data_conclusao && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.data_conclusao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Popover open={calendarOpen === e.etapa} onOpenChange={(o) => setCalendarOpen(o ? e.etapa : null)}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 px-3 gap-2 text-sm">
                          <CalendarIcon className="h-4 w-4" />
                          {e.data_conclusao
                            ? format(new Date(e.data_conclusao), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Data'
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
                        />
                      </PopoverContent>
                    </Popover>
                    {e.data_conclusao && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearDate(e.etapa)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            ))}

            <Separator />
            <div className="flex justify-end pt-3">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
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
