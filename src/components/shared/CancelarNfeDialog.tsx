import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Ban, Loader2 } from 'lucide-react';

/**
 * Botão "Cancelar NF-e" + pop-up de justificativa (15–255 caracteres, exigência
 * da SEFAZ), compartilhado pelas telas de emissão (venda / compra / consignação).
 * NF já cancelada: mostra só o selo. A reconsulta da SEFAZ fica no cabeçalho da
 * tela (NfeCabecalhoAcoes).
 */

interface NfeLike {
  nfe: { status?: string | null; numero?: string | null; cancelamento_justificativa?: string | null } | null;
  loading: boolean;
  cancelar: (justificativa: string) => Promise<string | null>;
}

const MIN = 15;
const MAX = 255;

const CancelarNfeDialog: React.FC<{ nfe: NfeLike; className?: string }> = ({ nfe, className }) => {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const status = nfe.nfe?.status;

  if (status === 'cancelada') {
    return (
      <Badge
        variant="outline"
        className={`gap-1.5 border-destructive/40 text-destructive ${className ?? ''}`}
        title={nfe.nfe?.cancelamento_justificativa || undefined}
      >
        <Ban className="h-3.5 w-3.5" /> NF-e cancelada
      </Badge>
    );
  }

  if (status !== 'processada') return null;

  const len = texto.trim().length;
  const valido = len >= MIN && len <= MAX;

  const confirmar = async () => {
    setErro(null);
    const err = await nfe.cancelar(texto.trim());
    if (err) setErro(err);
    else { setOpen(false); setTexto(''); }
  };

  return (
    <>
      <Button
        variant="outline"
        className={`gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive ${className ?? ''}`}
        onClick={() => setOpen(true)}
        disabled={nfe.loading}
      >
        <Ban className="h-4 w-4" /> Cancelar NF-e
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setTexto(''); setErro(null); } setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar NF-e {nfe.nfe?.numero ? `nº ${nfe.nfe.numero}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              O cancelamento é enviado à SEFAZ e é definitivo. Informe o motivo (15 a 255 caracteres).
              O compromisso financeiro não é revertido automaticamente — ajuste no financeiro se necessário.
            </p>
            <Label>Justificativa</Label>
            <Textarea
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Nota emitida com valor incorreto; será substituída por nova NF-e."
              maxLength={MAX}
            />
            <p className={`text-[11px] ${valido ? 'text-muted-foreground' : 'text-destructive'}`}>
              {len}/{MAX} {len < MIN ? `— faltam ${MIN - len} caractere(s)` : ''}
            </p>
            {erro && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setTexto(''); setErro(null); }} disabled={nfe.loading}>
              Voltar
            </Button>
            <Button
              className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmar}
              disabled={!valido || nfe.loading}
            >
              {nfe.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CancelarNfeDialog;
