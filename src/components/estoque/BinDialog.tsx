import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';

// BIN liberada (baixada) pela montadora — só moto 0km/test-ride (estoque_motos_novas.bin_liberada).
interface BinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; modelo?: string | null; chassi?: string | null; bin_liberada?: boolean | null } | null;
  onSuccess: () => void;
}

const BinDialog: React.FC<BinDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const { user, userName } = useAuth();
  const [binLiberada, setBinLiberada] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setBinLiberada(!!estoqueItem?.bin_liberada);
  }, [estoqueItem]);

  const handleSalvar = async () => {
    if (!estoqueItem) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('estoque_motos_novas' as any)
        .update({ bin_liberada: binLiberada })
        .eq('id', estoqueItem.id);
      if (error) throw error;
      if (binLiberada !== !!estoqueItem.bin_liberada) {
        await supabase.from('status_history').insert({
          entity_id: estoqueItem.id,
          entity_type: 'estoque',
          status: binLiberada ? 'BIN LIBERADA' : 'BIN PENDENTE',
          changed_by: user?.id || null,
          changed_by_name: userName || null,
        });
      }
      toast.success(binLiberada ? 'BIN marcada como liberada' : 'BIN marcada como pendente');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao salvar a BIN: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> BIN
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {(estoqueItem?.modelo || estoqueItem?.chassi) && (
            <p className="text-sm text-muted-foreground">
              {estoqueItem?.modelo}{estoqueItem?.modelo && estoqueItem?.chassi ? ' — ' : ''}<span className="font-mono">{estoqueItem?.chassi}</span>
            </p>
          )}
          <Label htmlFor="bin-switch" className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer">
            <span>BIN baixada (liberada)</span>
            <Switch id="bin-switch" checked={binLiberada} onCheckedChange={setBinLiberada} />
          </Label>

          <Button onClick={handleSalvar} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BinDialog;
