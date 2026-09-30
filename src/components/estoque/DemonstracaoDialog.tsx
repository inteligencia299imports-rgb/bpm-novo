import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CheckCircle, Loader2, Radio } from 'lucide-react';

interface DemonstracaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; em_demonstracao?: boolean | null; demonstracao_observacao?: string | null } | null;
  onSuccess: () => void;
}

/**
 * Pedido do usuário, 2026-09-30: aviso manual de "em demonstração" pra moto
 * 0km que saiu com NF de demonstração (CFOP 2912/6912, emitida fora do
 * bpm-novo — cadastro fiscal já pronto no SisFin, ver docs-fiscal-299
 * §2.71). NÃO mexe em status/loja_id — a moto continua "disponível" e
 * vendável normalmente na empresa de origem enquanto a demonstração está
 * aberta ("estoque negativo" até a NF de retorno, que também é externa).
 */
const DemonstracaoDialog: React.FC<DemonstracaoDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const [ativo, setAtivo] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && estoqueItem) {
      setAtivo(!!estoqueItem.em_demonstracao);
      setObservacao(estoqueItem.demonstracao_observacao || '');
    }
  }, [open, estoqueItem]);

  const handleConfirm = async () => {
    if (!estoqueItem) return;
    if (ativo && !observacao.trim()) {
      toast.error('Informe uma observação (pra onde foi, nº da NF de demonstração, etc.)');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('estoque_motos_novas' as any)
        .update({
          em_demonstracao: ativo,
          demonstracao_observacao: ativo ? observacao.trim() : null,
        })
        .eq('id', estoqueItem.id);
      if (error) throw error;
      toast.success(ativo ? 'Moto marcada como em demonstração' : 'Demonstração encerrada');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" /> Demonstração</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="em-demonstracao" className="cursor-pointer">Moto em demonstração</Label>
            <Switch id="em-demonstracao" checked={ativo} onCheckedChange={setAtivo} />
          </div>

          {ativo && (
            <p className="text-xs text-muted-foreground">
              A moto continua disponível e pode ser vendida normalmente por esta empresa enquanto a demonstração estiver aberta.
            </p>
          )}

          {ativo && (
            <div className="space-y-2">
              <Label>Observação *</Label>
              <Textarea
                placeholder="Pra onde foi, nº/chave da NF de demonstração, data prevista de retorno..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <Button onClick={handleConfirm} disabled={loading || (ativo && !observacao.trim())} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {ativo ? 'Marcar como em Demonstração' : 'Encerrar Demonstração'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemonstracaoDialog;
