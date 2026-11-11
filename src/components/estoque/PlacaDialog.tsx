import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { normalizePlaca, validatePlaca } from '@/lib/veiculoValidators';
import { toast } from 'sonner';
import { Loader2, RectangleHorizontal } from 'lucide-react';

interface PlacaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; placa: string | null; chassi?: string | null } | null;
  onSuccess: () => void;
}

/**
 * Placa de moto 0km test-ride (estoque_motos_novas.placa). A test-ride pode
 * ser emplacada; o menu do Estoque só oferece a opção enquanto a moto não
 * tiver NF-e de venda emitida em produção. Vazio = remove a placa.
 */
const PlacaDialog: React.FC<PlacaDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const [placa, setPlaca] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (estoqueItem) setPlaca(normalizePlaca(estoqueItem.placa || ''));
  }, [estoqueItem]);

  const check = validatePlaca(placa);

  const handleSalvar = async () => {
    if (!estoqueItem) return;
    if (!check.valid) {
      toast.error(check.message || 'Placa inválida');
      return;
    }
    setLoading(true);
    try {
      const valor = placa || null;
      if (valor) {
        const { data: dup } = await supabase
          .from('estoque_motos_novas')
          .select('id, chassi')
          .eq('placa', valor)
          .neq('id', estoqueItem.id)
          .limit(1);
        if ((dup || []).length > 0) {
          toast.error(`Placa ${valor} já está em outra moto do estoque (chassi ${(dup as any[])[0].chassi || '—'}).`);
          return;
        }
      }
      const { error } = await supabase
        .from('estoque_motos_novas')
        .update({ placa: valor })
        .eq('id', estoqueItem.id);
      if (error) throw error;
      toast.success(valor ? 'Placa atualizada' : 'Placa removida');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao salvar a placa: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RectangleHorizontal className="h-5 w-5 text-primary" /> Placa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {estoqueItem?.chassi && (
            <p className="text-xs text-muted-foreground">Chassi {estoqueItem.chassi}</p>
          )}
          <div className="space-y-2">
            <Label>Placa</Label>
            <Input
              value={placa}
              onChange={(e) => setPlaca(normalizePlaca(e.target.value))}
              maxLength={7}
              placeholder="ABC1D23"
              className="uppercase font-mono tracking-wider"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSalvar(); }}
            />
            {placa && !check.valid && <p className="text-xs text-destructive">{check.message}</p>}
          </div>

          <Button onClick={handleSalvar} disabled={loading || !check.valid} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlacaDialog;
