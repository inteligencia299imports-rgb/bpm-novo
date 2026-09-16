import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/shared/CurrencyInput';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { DollarSign, Loader2 } from 'lucide-react';

interface AlterarPrecoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; preco: number | null; preco_acao: number | null } | null;
  onSuccess: () => void;
}

const toCents = (v: number | null | undefined) => Math.round((v || 0) * 100);

const AlterarPrecoDialog: React.FC<AlterarPrecoDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const [precoCents, setPrecoCents] = useState(0);
  const [precoAcaoCents, setPrecoAcaoCents] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (estoqueItem) {
      setPrecoCents(toCents(estoqueItem.preco));
      setPrecoAcaoCents(toCents(estoqueItem.preco_acao));
    }
  }, [estoqueItem]);

  const handleSalvar = async () => {
    if (!estoqueItem) return;
    if (precoCents <= 0) {
      toast.error('Informe o preço');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('estoque_motos_novas')
        .update({
          valor: precoCents / 100,
          preco_acao: precoAcaoCents > 0 ? precoAcaoCents / 100 : null,
        })
        .eq('id', estoqueItem.id);
      if (error) throw error;
      toast.success('Preço atualizado');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao alterar preço: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Alterar Preço
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Preço</Label>
            <CurrencyInput value={precoCents} onChange={setPrecoCents} />
          </div>
          <div className="space-y-2">
            <Label>Preço Promocional (opcional)</Label>
            <CurrencyInput value={precoAcaoCents} onChange={setPrecoAcaoCents} />
          </div>

          <Button onClick={handleSalvar} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AlterarPrecoDialog;
