import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRightLeft, FileText, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';
import { NfeDanfeButton } from '@/components/shared/NfeCabecalhoAcoes';

interface EstoqueItemBasico {
  id: string;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  chassi?: string | null;
  avaliacao_id?: string | null;
  loja_id?: string | null;
  empresa?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: EstoqueItemBasico | null;
  onSuccess: () => void;
}

interface LojaOpcao {
  id: string;
  loja: string;
  empresa_id: string;
  empresa_nome: string;
}

/**
 * Transferência de estoque de uma moto seminova entre empresas do grupo,
 * aberta a partir do menu "Acessar" do Estoque. Duas NF-e's espelhadas: a
 * origem emite a SAÍDA (CFOP 5152/6152) e, só depois dela autorizar em
 * produção, o destino emite a ENTRADA (CFOP 1152/2152) — cada uma com seu
 * próprio ciclo homologação → produção, mesmo padrão do
 * TransferenciaFagMmatosDialog (que é a mesma ideia, só que com destino
 * fixo/natureza dedicada em vez do CFOP comum de transferência).
 */
const TransferenciaEstoqueDialog: React.FC<Props> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const avaliacaoId = estoqueItem?.avaliacao_id || '';
  const [lojas, setLojas] = useState<LojaOpcao[]>([]);
  const [lojasLoading, setLojasLoading] = useState(true);
  const [destinoLojaId, setDestinoLojaId] = useState('');

  const saida = useNfeCompra(avaliacaoId, open, 'transferencia_saida', 'avaliacao');
  const entrada = useNfeCompra(avaliacaoId, open, 'transferencia_entrada', 'avaliacao', onSuccess);

  // useNfeCompra não carrega sozinho ao montar (mesmo achado do
  // TransferenciaFagMmatosDialog) — sem isso o diálogo sempre parte de "nada
  // emitido ainda", mesmo reabrindo sobre uma transferência já em andamento.
  useEffect(() => {
    if (open && avaliacaoId) { saida.carregar(); entrada.carregar(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacaoId]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLojasLoading(true);
    (supabase as any)
      .from('loja_empresas')
      .select('id, loja, empresa_id, empresas:empresa_id(nome)')
      .then(({ data }: any) => {
        if (cancel) return;
        const opts = ((data as any[]) || [])
          .filter((l) => l.id !== estoqueItem?.loja_id)
          .map((l) => ({ id: l.id, loja: l.loja, empresa_id: l.empresa_id, empresa_nome: l.empresas?.nome || '' }))
          .sort((a, b) => (a.empresa_nome + a.loja).localeCompare(b.empresa_nome + b.loja));
        setLojas(opts);
        setLojasLoading(false);
      });
    return () => { cancel = true; };
  }, [open, estoqueItem?.loja_id]);

  const motoLabel = [estoqueItem?.marca, estoqueItem?.modelo].filter(Boolean).join(' ') || 'Moto';
  const saidaEmitida = saida.emitida;
  const saidaProducao = saidaEmitida && saida.nfe?.ambiente === 'producao';
  const podeReemitirHomologSaida = saidaEmitida && saida.nfe?.ambiente === 'homologacao';
  const entradaEmitida = entrada.emitida;
  const podeReemitirHomologEntrada = entradaEmitida && entrada.nfe?.ambiente === 'homologacao';

  if (!estoqueItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" /> Transferência de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-semibold text-foreground">{motoLabel}</p>
            <p className="text-xs text-muted-foreground">
              {estoqueItem.placa || estoqueItem.chassi || '—'} — atualmente em {estoqueItem.empresa || '—'}
            </p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Empresa/loja de destino</Label>
            <Select value={destinoLojaId} onValueChange={setDestinoLojaId} disabled={saidaEmitida || lojasLoading}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={lojasLoading ? 'Carregando…' : 'Selecione o destino'} />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.empresa_nome} — {l.loja}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Passo 1: saída (empresa de origem) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" /> 1. Saída (origem)
                {saidaProducao && (
                  <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {saidaEmitida && (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Nº NF</span>
                  <div className="flex items-center gap-3">
                    <span className={saida.nfe?.ambiente === 'producao' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-orange-600 dark:text-orange-400'}>
                      Nº {saida.nfe?.numero || '-'} • Série {saida.nfe?.serie || '-'}
                    </span>
                    <NfeDanfeButton nfe={saida} />
                  </div>
                </div>
              )}
              {saida.pendente && (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                  <Button variant="ghost" size="sm" disabled={saida.loading} onClick={saida.consultar} className="gap-1.5">
                    <RefreshCw className={`h-4 w-4 ${saida.loading ? 'animate-spin' : ''}`} /> Atualizar
                  </Button>
                </div>
              )}
              {saida.erro && !saida.pendente && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {saida.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {(saida.emitida || saida.cancelada) && saida.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={saida} />}
                {(!saidaEmitida || podeReemitirHomologSaida) && !saida.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={saida.loading || !destinoLojaId}
                    onClick={() => saida.emitir({ ambiente: 'homologacao', destino_loja_id: destinoLojaId })}
                  >
                    {saida.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : saida.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {saida.erro ? 'Tentar novamente' : 'NF-e (Homologação)'}
                  </Button>
                )}
                {podeReemitirHomologSaida && !saida.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={saida.loading}
                    onClick={() => saida.emitir({ ambiente: 'producao', destino_loja_id: destinoLojaId })}
                  >
                    <FileText className="h-4 w-4" /> NF-e (Produção)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Passo 2: entrada (empresa de destino) — só depois da saída em produção */}
          <Card className={!saidaProducao ? 'opacity-50 pointer-events-none' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" /> 2. Entrada (destino)
                {entradaEmitida && entrada.nfe?.ambiente === 'producao' && (
                  <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!saidaProducao && (
                <p className="text-xs text-muted-foreground">Disponível depois da saída ser autorizada em produção.</p>
              )}
              {entradaEmitida && (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Nº NF</span>
                  <div className="flex items-center gap-3">
                    <span className={entrada.nfe?.ambiente === 'producao' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-orange-600 dark:text-orange-400'}>
                      Nº {entrada.nfe?.numero || '-'} • Série {entrada.nfe?.serie || '-'}
                    </span>
                    <NfeDanfeButton nfe={entrada} />
                  </div>
                </div>
              )}
              {entrada.pendente && (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                  <Button variant="ghost" size="sm" disabled={entrada.loading} onClick={entrada.consultar} className="gap-1.5">
                    <RefreshCw className={`h-4 w-4 ${entrada.loading ? 'animate-spin' : ''}`} /> Atualizar
                  </Button>
                </div>
              )}
              {entrada.erro && !entrada.pendente && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {entrada.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {(entrada.emitida || entrada.cancelada) && entrada.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={entrada} />}
                {saidaProducao && (!entradaEmitida || podeReemitirHomologEntrada) && !entrada.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={entrada.loading || !destinoLojaId}
                    onClick={() => entrada.emitir({ ambiente: 'homologacao', destino_loja_id: destinoLojaId })}
                  >
                    {entrada.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : entrada.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {entrada.erro ? 'Tentar novamente' : 'NF-e (Homologação)'}
                  </Button>
                )}
                {saidaProducao && podeReemitirHomologEntrada && !entrada.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={entrada.loading}
                    onClick={() => entrada.emitir({ ambiente: 'producao', destino_loja_id: destinoLojaId })}
                  >
                    <FileText className="h-4 w-4" /> NF-e (Produção)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferenciaEstoqueDialog;
