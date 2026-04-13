import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { LogOut, Loader2 } from 'lucide-react';

interface RetiradaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: {
    id: string;
    modelo: string;
    placa?: string | null;
    avaliacao_id?: string | null;
  } | null;
  onSuccess: () => void;
}

const RetiradaDialog: React.FC<RetiradaDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const { user, userName } = useAuth();
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!estoqueItem || !motivo.trim()) {
      toast.error('Informe o motivo da retirada');
      return;
    }

    setLoading(true);
    try {
      // 1. Update estoque status to 'retirada'
      const { error: estoqueErr } = await supabase
        .from('estoque')
        .update({ status: 'retirada', observacoes: motivo.trim() })
        .eq('id', estoqueItem.id);
      if (estoqueErr) throw estoqueErr;

      // 2. Record history for estoque
      await supabase.from('status_history').insert({
        entity_id: estoqueItem.id,
        entity_type: 'estoque',
        status: 'RETIRADA',
        changed_by: user?.id || null,
        changed_by_name: userName || null,
        observacoes: motivo.trim(),
      });

      if (estoqueItem.avaliacao_id) {
        // 3. Update avaliacao status to 'perdido'
        const { error: avErr } = await supabase
          .from('avaliacoes')
          .update({ situacao: 'perdido' })
          .eq('id', estoqueItem.avaliacao_id);
        if (avErr) throw avErr;

        // 4. Record history for avaliacao
        await supabase.from('status_history').insert({
          entity_id: estoqueItem.avaliacao_id,
          entity_type: 'avaliacao',
          status: 'RETIRADA',
          changed_by: user?.id || null,
          changed_by_name: userName || null,
          observacoes: motivo.trim(),
        });

        // 5. Mark consignacao processes as completed
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

        // 6. Update consignacao_status to concluido
        await supabase
          .from('avaliacoes')
          .update({ consignacao_status: 'concluido' })
          .eq('id', estoqueItem.avaliacao_id);
      }

      toast.success('Moto retirada com sucesso');
      setMotivo('');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao registrar retirada: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMotivo(''); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            Retirada - {estoqueItem?.modelo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            A moto será marcada como retirada e não ficará mais disponível para venda.
            A avaliação será marcada como perdida e os processos de consignação serão concluídos.
          </p>

          <div className="space-y-2">
            <Label>Motivo da retirada *</Label>
            <Textarea
              placeholder="Descreva o motivo da retirada..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!motivo.trim() || loading}
            variant="destructive"
            className="w-full"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</> : <><LogOut className="h-4 w-4" /> Confirmar Retirada</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RetiradaDialog;
