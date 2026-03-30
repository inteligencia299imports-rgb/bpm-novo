import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; modelo: string; placa?: string | null; status: string } | null;
  onSuccess: () => void;
}

const STATUS_OPTIONS = [
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
];

const StatusChangeDialog: React.FC<StatusChangeDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const { user, userName } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!estoqueItem || !selectedStatus) return;
    if (!observacao.trim()) {
      toast.error('Informe uma observação');
      return;
    }

    setLoading(true);
    try {
      const dbStatus = selectedStatus === 'indisponivel_manual' ? 'indisponivel_manual' : 'bloqueio_juridico';
      const statusLabel = selectedStatus === 'indisponivel_manual' ? 'INDISPONÍVEL' : 'BLOQUEIO JURÍDICO';

      const { error: updateErr } = await supabase.from('estoque').update({
        status: dbStatus,
        observacoes: observacao.trim(),
      }).eq('id', estoqueItem.id);

      if (updateErr) throw updateErr;

      // Record in status_history
      await supabase.from('status_history').insert({
        entity_id: estoqueItem.id,
        entity_type: 'estoque',
        status_from: estoqueItem.status,
        status_to: statusLabel,
        changed_by: user?.id || null,
        changed_by_name: userName || null,
        observacoes: observacao.trim(),
      });

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedStatus(''); setObservacao(''); } onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <RadioGroup value={selectedStatus} onValueChange={setSelectedStatus} className="space-y-2">
            {STATUS_OPTIONS.map((opt) => (
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
            {loading ? 'Salvando...' : 'Confirmar Alteração'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StatusChangeDialog;
