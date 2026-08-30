import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, ShieldAlert, CheckCircle, Loader2, CircleCheck, LogOut } from 'lucide-react';

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; modelo: string; placa?: string | null; status: string; tipo?: string; avaliacao_id?: string | null } | null;
  onSuccess: () => void;
}

const ALL_STATUS_OPTIONS = [
  {
    value: 'disponivel',
    label: 'DISPONÍVEL',
    icon: <CircleCheck className="h-4 w-4" />,
    colorClass: 'text-success',
    borderClass: 'border-success/50 bg-success/5',
  },
  {
    value: 'indisponivel_manual',
    label: 'INDISPONÍVEL',
    icon: <AlertTriangle className="h-4 w-4" />,
    colorClass: 'text-destructive',
    borderClass: 'border-destructive/50 bg-destructive/5',
  },
  {
    value: 'bloqueio_juridico',
    label: 'BLOQUEIO JURÍDICO',
    icon: <ShieldAlert className="h-4 w-4" />,
    colorClass: 'text-muted-foreground',
    borderClass: 'border-muted-foreground/50 bg-muted/30',
  },
  {
    value: 'retirada',
    label: 'RETIRADA',
    icon: <LogOut className="h-4 w-4" />,
    colorClass: 'text-amber-700',
    borderClass: 'border-amber-600/50 bg-amber-500/5',
    consignadaOnly: true,
  },
];

const StatusChangeDialog: React.FC<StatusChangeDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const { user, userName } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!estoqueItem || !selectedStatus) return;
    if (selectedStatus !== 'disponivel' && !observacao.trim()) {
      toast.error('Informe uma observação');
      return;
    }

    setLoading(true);
    try {
      const statusLabelMap: Record<string, string> = {
        disponivel: 'DISPONÍVEL',
        indisponivel_manual: 'INDISPONÍVEL',
        bloqueio_juridico: 'BLOQUEIO JURÍDICO',
        retirada: 'RETIRADA',
      };
      const statusLabel = statusLabelMap[selectedStatus] || selectedStatus;

      const updateData: any = { status: selectedStatus };
      if (selectedStatus === 'disponivel') {
        updateData.observacoes = null;
      } else {
        updateData.observacoes = observacao.trim();
      }

      const { error: updateErr } = await supabase.from('estoque_motos').update(updateData).eq('id', estoqueItem.id);

      if (updateErr) throw updateErr;

      // Record in status_history
      await supabase.from('status_history').insert({
        entity_id: estoqueItem.id,
        entity_type: 'estoque',
        status: statusLabel,
        changed_by: user?.id || null,
        changed_by_name: userName || null,
        observacoes: observacao.trim(),
      });

      // Special handling for RETIRADA on consigned motos
      if (selectedStatus === 'retirada' && estoqueItem.avaliacao_id) {
        // Update avaliacao to 'perdido'
        await supabase
          .from('avaliacoes')
          .update({ situacao: 'perdido', consignacao_status: 'concluido' })
          .eq('id', estoqueItem.avaliacao_id);

        // History for avaliacao
        await supabase.from('status_history').insert({
          entity_id: estoqueItem.avaliacao_id,
          entity_type: 'avaliacao',
          status: 'RETIRADA',
          changed_by: user?.id || null,
          changed_by_name: userName || null,
          observacoes: observacao.trim(),
        });

        // Conclude pending consignacao processes
        const { data: processos } = await supabase
          .from('consignacao_processos')
          .select('id')
          .eq('avaliacao_id', estoqueItem.avaliacao_id)
          .eq('concluida', false);

        if (processos && processos.length > 0) {
          const now = new Date().toISOString();
          for (const p of processos) {
            await supabase
              .from('consignacao_processos')
              .update({ concluida: true, data_conclusao: now })
              .eq('id', p.id);
          }
        }
      }

      toast.success(`Status alterado para ${statusLabel}`);
      setSelectedStatus('');
      setObservacao('');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isConsignada = estoqueItem?.tipo === 'consignada';
  const visibleOptions = ALL_STATUS_OPTIONS.filter(opt => {
    if (opt.value === estoqueItem?.status) return false;
    if (opt.consignadaOnly && !isConsignada) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedStatus(''); setObservacao(''); } onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <RadioGroup value={selectedStatus} onValueChange={setSelectedStatus} className="space-y-2">
            {visibleOptions.map((opt) => (
              <Label
                key={opt.value}
                htmlFor={opt.value}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedStatus === opt.value ? opt.borderClass : 'border-border hover:bg-muted/50'}`}
              >
                <RadioGroupItem value={opt.value} id={opt.value} />
                <span className={`flex items-center gap-2 font-semibold ${opt.colorClass}`}>
                  {opt.icon}
                  {opt.label}
                </span>
              </Label>
            ))}
          </RadioGroup>

          {selectedStatus === 'retirada' && (
            <p className="text-xs text-muted-foreground">
              A moto será marcada como retirada, a avaliação será marcada como perdida e os processos de consignação serão concluídos.
            </p>
          )}

          <div className="space-y-2">
            <Label>Observação *</Label>
            <Textarea
              placeholder="Informe o motivo da alteração..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!selectedStatus || !observacao.trim() || loading}
            className="w-full"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><CheckCircle className="h-4 w-4" /> Confirmar Alteração</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StatusChangeDialog;
