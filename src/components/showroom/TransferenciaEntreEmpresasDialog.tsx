import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, FileText, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';
import { NfeDanfeButton } from '@/components/shared/NfeCabecalhoAcoes';

interface TransferenciaEntreEmpresasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string | null;
  moto: { marca?: string | null; modelo?: string | null; placa?: string | null; chassi?: string | null } | null;
  /** Nome da empresa dona da moto hoje (quem emite a NF-e de saída). */
  origemNome?: string | null;
  /** Nome da empresa que reservou a venda (destino da transferência). */
  destinoNome?: string | null;
  onAutorizada?: () => void;
}

/**
 * Transferência entre empresas do grupo (CNPJ diferente) quando a moto
 * vendida pertence a uma loja/empresa diferente da que está vendendo — versão
 * genérica de TransferenciaFagMmatosDialog (origem/destino resolvidos em
 * tempo real, não fixos). Sem contrato, sem compromisso financeiro: só emite
 * a NF-e (homologação, depois produção) sobre a avaliação já comprada.
 */
const TransferenciaEntreEmpresasDialog: React.FC<TransferenciaEntreEmpresasDialogProps> = ({
  open, onOpenChange, avaliacaoId, moto, origemNome, destinoNome, onAutorizada,
}) => {
  const nfe = useNfeCompra(avaliacaoId || '', open, 'transferencia_cnpj', 'avaliacao', onAutorizada);

  useEffect(() => {
    if (open && avaliacaoId) nfe.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacaoId]);

  const nfeJaEmitida = nfe.emitida;
  const podeReemitirHomolog = nfeJaEmitida && nfe.nfe?.ambiente === 'homologacao';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" /> Transferência entre CNPJ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta moto pertence a{' '}
            <span className="font-medium text-foreground">{origemNome || 'outra empresa do grupo'}</span>, mas foi
            reservada pra uma venda de{' '}
            <span className="font-medium text-foreground">{destinoNome || 'outra empresa'}</span>. Antes de emitir a
            NF-e de venda, emita a NF-e de transferência entre as duas empresas — é um movimento interno do grupo,
            sem compromisso financeiro.
          </p>

          {moto && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-semibold text-foreground">{[moto.marca, moto.modelo].filter(Boolean).join(' ')}</p>
              <p className="text-xs text-muted-foreground">
                {moto.placa || moto.chassi || '—'}
              </p>
            </div>
          )}

          {nfeJaEmitida && (
            <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">Nº NF</span>
              <div className="flex items-center gap-3">
                <span className={nfe.nfe?.ambiente === 'producao' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-orange-600 dark:text-orange-400'}>
                  Nº {nfe.nfe?.numero || '-'} • Série {nfe.nfe?.serie || '-'}
                </span>
                <NfeDanfeButton nfe={nfe} />
              </div>
            </div>
          )}

          {nfe.pendente && (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…
              </Badge>
              <Button variant="ghost" size="sm" disabled={nfe.loading} onClick={nfe.consultar} className="gap-1.5">
                <RefreshCw className={`h-4 w-4 ${nfe.loading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          )}

          {nfe.erro && !nfe.pendente && (
            <p className="text-sm text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {nfe.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end pt-2">
          {(nfe.emitida || nfe.cancelada) && nfe.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={nfe} />}

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>

          {(!nfeJaEmitida || podeReemitirHomolog) && !nfe.pendente && (
            <Button
              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              disabled={nfe.loading || !avaliacaoId}
              onClick={() => nfe.emitir({ ambiente: 'homologacao' })}
            >
              {nfe.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfe.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {nfe.erro ? 'Tentar novamente' : 'NF-e (Homologação)'}
            </Button>
          )}
          {podeReemitirHomolog && !nfe.pendente && (
            <Button
              className="gap-1.5"
              disabled={nfe.loading || !avaliacaoId}
              onClick={() => nfe.emitir({ ambiente: 'producao' })}
            >
              <FileText className="h-4 w-4" /> NF-e (Produção)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferenciaEntreEmpresasDialog;
