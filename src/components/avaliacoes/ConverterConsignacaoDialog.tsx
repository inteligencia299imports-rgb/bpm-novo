import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, FileText, Loader2, RefreshCw, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import NfeCabecalhoAcoes from '@/components/shared/NfeCabecalhoAcoes';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: any;
  /** Chamado quando a compra sai autorizada em produção (moto vira 'convertida'). */
  onConcluido?: () => void;
}

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Transforma uma moto em consignação (já com NF de entrada autorizada) em
 * compra, pra poder vender como estoque próprio: 1º devolução simbólica
 * (saída, referenciando a NF de consignação), depois compra (entrada) — só
 * então a venda de moto seminova é liberada (ver guard em emitir-nfe-compra).
 */
const ConverterConsignacaoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao, onConcluido }) => {
  const valorConsignacao = Number(avaliacao?.valor_consignacao_nota ?? avaliacao?.avaliacao_consignacao ?? 0);
  const [valorCompra, setValorCompra] = useState('');

  const nfeDevolucao = useNfeCompra(avaliacao?.id, open, 'devolucao_consignacao', 'avaliacao');
  const nfeCompra = useNfeCompra(avaliacao?.id, open, 'compra', 'avaliacao', () => {
    toast.success('Consignação convertida em compra!');
    onConcluido?.();
  });

  useEffect(() => {
    if (!open) return;
    nfeDevolucao.carregar();
    nfeCompra.carregar();
    setValorCompra(valorConsignacao > 0 ? formatCurrencyInput(String(Math.round(valorConsignacao * 100))) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacao?.id]);

  const devolucaoOk = nfeDevolucao.emitida;
  const devolucaoProducaoOk = devolucaoOk && nfeDevolucao.nfe?.ambiente === 'producao';
  const podeReemitirHomologDevolucao = devolucaoOk && nfeDevolucao.nfe?.ambiente === 'homologacao';
  const compraOk = nfeCompra.emitida;
  const podeReemitirHomologCompra = compraOk && nfeCompra.nfe?.ambiente === 'homologacao';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" /> Converter Consignação em Compra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Moto <strong>{[avaliacao?.marca, avaliacao?.modelo].filter(Boolean).join(' ')}</strong>
            {avaliacao?.placa ? ` — placa ${String(avaliacao.placa).replace(/-/g, '')}` : ''}. Para vender esta
            moto como estoque próprio, primeiro é preciso devolver simbolicamente ao consignante (NF de saída) e,
            em seguida, comprá-la de fato (NF de entrada).
          </p>

          {/* Etapa 1 — Devolução Simbólica */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">1</span>
                  Devolução Simbólica
                </span>
                <NfeCabecalhoAcoes nfe={nfeDevolucao} />
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Valor da devolução (igual ao da NF de consignação): <strong>{brl(valorConsignacao)}</strong></p>
              {nfeDevolucao.erro && (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {nfeDevolucao.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}
              {valorConsignacao <= 0 && (
                <p className="text-xs text-destructive">Sem valor de consignação registrado — não é possível emitir a devolução.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {(!devolucaoOk || podeReemitirHomologDevolucao) && !nfeDevolucao.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={nfeDevolucao.loading || valorConsignacao <= 0}
                    onClick={() => nfeDevolucao.emitir({ ambiente: 'homologacao' })}
                  >
                    {nfeDevolucao.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfeDevolucao.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {nfeDevolucao.erro ? 'Tentar novamente' : 'Devolução (Homologação)'}
                  </Button>
                )}
                {podeReemitirHomologDevolucao && !nfeDevolucao.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={nfeDevolucao.loading}
                    onClick={() => nfeDevolucao.emitir({ ambiente: 'producao' })}
                  >
                    <FileText className="h-4 w-4" /> Devolução (Produção)
                  </Button>
                )}
                {devolucaoProducaoOk && <CancelarNfeDialog nfe={nfeDevolucao} />}
              </div>
            </CardContent>
          </Card>

          {/* Etapa 2 — Compra */}
          <Card className={!devolucaoProducaoOk ? 'opacity-60' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">2</span>
                  Compra
                  {!devolucaoProducaoOk && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
                <NfeCabecalhoAcoes nfe={nfeCompra} />
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="space-y-3">
              {!devolucaoProducaoOk ? (
                <p className="text-xs text-muted-foreground">Disponível após a devolução simbólica autorizada em produção.</p>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground">Valor de Compra</label>
                    <div className="relative mt-1 max-w-[220px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                      <Input
                        className="pl-10"
                        placeholder="0,00"
                        value={valorCompra}
                        onChange={(e) => setValorCompra(formatCurrencyInput(e.target.value))}
                        inputMode="numeric"
                        disabled={compraOk && !podeReemitirHomologCompra}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Pode ser renegociado com o consignante — não precisa ser igual ao valor da consignação.</p>
                  </div>
                  {nfeCompra.erro && (
                    <p className="text-xs text-destructive flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {nfeCompra.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {(!compraOk || podeReemitirHomologCompra) && !nfeCompra.pendente && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={nfeCompra.loading || parseCurrencyInput(valorCompra) <= 0}
                        onClick={() => nfeCompra.emitir({ valor: parseCurrencyInput(valorCompra), ambiente: 'homologacao' })}
                      >
                        {nfeCompra.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfeCompra.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        {nfeCompra.erro ? 'Tentar novamente' : 'Compra (Homologação)'}
                      </Button>
                    )}
                    {podeReemitirHomologCompra && !nfeCompra.pendente && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={nfeCompra.loading || parseCurrencyInput(valorCompra) <= 0}
                        onClick={() => nfeCompra.emitir({ valor: parseCurrencyInput(valorCompra), ambiente: 'producao' })}
                      >
                        <FileText className="h-4 w-4" /> Compra (Produção)
                      </Button>
                    )}
                    {compraOk && nfeCompra.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={nfeCompra} />}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {compraOk && nfeCompra.nfe?.ambiente === 'producao' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Conversão concluída — a moto já pode ser vendida como estoque próprio.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConverterConsignacaoDialog;
