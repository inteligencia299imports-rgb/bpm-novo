import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClipboardList, X, Loader2, Clock, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { persistChecklistRows } from '@/lib/persistChecklistRows';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const ETAPAS = [
  'CONSULTA REALIZADA',
  'DOCUMENTAÇÃO RECEBIDA',
  'CADASTRO NBS',
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  motoAvaliacaoId?: string;
  onStatusChanged?: (newStatus: string) => void;
}

const PosCompraProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, motoAvaliacaoId, onStatusChanged }) => {
  const { userName } = useAuth();
  const [etapas, setEtapas] = useState<EtapaData[]>(
    ETAPAS.map(e => ({ etapa: e, concluida: false, data_conclusao: null }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [previousStatus, setPreviousStatus] = useState('em_aberto');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);

      const [{ data }, { data: avData }] = await Promise.all([
        supabase
          .from('pos_compra_processos' as any)
          .select('id, etapa, concluida, data_conclusao')
          .eq('avaliacao_id', avaliacaoId),
        supabase
          .from('avaliacoes')
          .select('pos_compra_observacoes, pos_compra_status, moto_avaliacao_id, tipo_aquisicao')
          .eq('id', avaliacaoId)
          .maybeSingle(),
      ]);

      const motoId = motoAvaliacaoId || (avData as any)?.moto_avaliacao_id;
      const tipoAquisicao = (avData as any)?.tipo_aquisicao;

      // Fetch consultation data if we have a moto ID
      let consultaRealizada = false;
      let consultaDate: string | null = null;
      if (motoId) {
        const [{ data: motoData }, { data: consultaHistory }] = await Promise.all([
          supabase
            .from('motos_avaliacao')
            .select('consulta_realizada')
            .eq('id', motoId)
            .maybeSingle(),
          supabase
            .from('status_history')
            .select('created_at')
            .eq('entity_id', motoId)
            .eq('entity_type', 'consulta')
            .eq('status', 'consulta_realizada')
            .order('created_at', { ascending: false })
            .limit(1),
        ]);
        consultaRealizada = motoData?.consulta_realizada === true;
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
      setObservacoes((avData as any)?.pos_compra_observacoes || '');
      setPreviousStatus((avData as any)?.pos_compra_status || 'em_aberto');
      setLoading(false);
    };
    load();
  }, [open, avaliacaoId, motoAvaliacaoId]);

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
        id: e.id,
        avaliacao_id: avaliacaoId,
        etapa: e.etapa,
        concluida: e.concluida,
        data_conclusao: e.data_conclusao,
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
      let newStatus = 'em_aberto';
      const anyConcluida = etapas.some(e => e.concluida);
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
        .update({ pos_compra_status: newStatus, pos_compra_observacoes: observacoes } as any)
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
          em_andamento: 'Em Andamento',
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

  const concluidas = etapas.filter(e => e.concluida).length;
  const statusLabel = concluidas === ETAPAS.length ? 'CONCLUÍDO' : 'EM ABERTO';

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

export default PosCompraProcessoDialog;
