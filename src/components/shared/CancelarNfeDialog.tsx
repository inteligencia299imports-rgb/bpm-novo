import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Ban, Loader2, AlertTriangle, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Botão "Cancelar NF-e" + pop-up de justificativa (15–255 caracteres, exigência
 * da SEFAZ), compartilhado pelas telas de emissão (venda / compra / consignação
 * / transferência). Passadas 24h da autorização em produção (janela nacional
 * de cancelamento, Ajuste SINIEF), a SEFAZ não aceita mais cancelamento — o
 * botão vira "Devolver NF-e", que emite uma NOVA NF-e de devolução
 * referenciando a original (NFref), em vez de tentar cancelar.
 * NF já cancelada/devolvida: mostra só o selo. A reconsulta da SEFAZ fica no
 * cabeçalho da tela (NfeCabecalhoAcoes).
 */

interface NfeLike {
  nfe: {
    id?: string;
    status?: string | null;
    numero?: string | null;
    cancelamento_justificativa?: string | null;
    operacao?: string | null;
    ambiente?: string | null;
    data_emissao?: string | null;
    avaliacao_id?: string | null;
    atendimento_id?: string | null;
    estoque_moto_nova_id?: string | null;
  } | null;
  loading: boolean;
  cancelar: (justificativa: string) => Promise<string | null>;
}

const MIN = 15;
const MAX = 255;
const HORAS_24_MS = 24 * 60 * 60 * 1000;
const DEVOLUCAO_PENDENTE = ['recebida', 'validando', 'processando_itens', 'gerando_contas'];

// Operação original -> operação de devolução + coluna de chave em nfe_entradas.
const DEVOLUCAO_MAP: Record<string, { tipo: string; keyCol: 'avaliacao_id' | 'atendimento_id' | 'estoque_moto_nova_id' }> = {
  compra: { tipo: 'devolucao_compra', keyCol: 'avaliacao_id' },
  venda_seminova: { tipo: 'devolucao_venda_seminova', keyCol: 'atendimento_id' },
  venda_0km: { tipo: 'devolucao_venda_0km', keyCol: 'atendimento_id' },
  transferencia_entrada: { tipo: 'devolucao_transferencia', keyCol: 'avaliacao_id' },
  transferencia_entrada_0km: { tipo: 'devolucao_transferencia_0km', keyCol: 'estoque_moto_nova_id' },
};

const CancelarNfeDialog: React.FC<{ nfe: NfeLike; className?: string }> = ({ nfe, className }) => {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const status = nfe.nfe?.status;

  // ---- Devolução (pós-24h) — estado próprio, independente do NF-e original ----
  const devolucaoCfg = nfe.nfe?.operacao ? DEVOLUCAO_MAP[nfe.nfe.operacao] : undefined;
  const entityId = devolucaoCfg ? (nfe.nfe as any)?.[devolucaoCfg.keyCol] : null;
  const emitidaEm = nfe.nfe?.data_emissao ? new Date(nfe.nfe.data_emissao).getTime() : null;
  const passou24h = emitidaEm != null && Number.isFinite(emitidaEm) && Date.now() - emitidaEm >= HORAS_24_MS;
  const elegivelDevolucao = status === 'processada' && nfe.nfe?.ambiente === 'producao' && !!devolucaoCfg && !!entityId;

  const [devolucaoNfe, setDevolucaoNfe] = useState<any | null>(null);
  const [devolucaoLoading, setDevolucaoLoading] = useState(false);
  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const devolucaoStatus: string | undefined = devolucaoNfe?.status;
  const devolucaoPendente = DEVOLUCAO_PENDENTE.includes(devolucaoStatus || '');
  const devolucaoErro = devolucaoStatus === 'erro';
  const devolucaoAutorizada = devolucaoStatus === 'processada';
  const podeReemitirHomologDevolucao = devolucaoAutorizada && devolucaoNfe?.ambiente === 'homologacao';

  const carregarDevolucao = async () => {
    if (!devolucaoCfg || !entityId) return;
    const { data } = await supabase
      .from('nfe_entradas' as any)
      .select('*')
      .eq(devolucaoCfg.keyCol, entityId)
      .eq('operacao', devolucaoCfg.tipo)
      .order('created_at', { ascending: false })
      .limit(1);
    setDevolucaoNfe((data as any[])?.[0] || null);
  };

  useEffect(() => {
    if (elegivelDevolucao) carregarDevolucao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegivelDevolucao, entityId]);

  const consultarDevolucao = async () => {
    if (!devolucaoCfg || !entityId) return;
    setDevolucaoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { [devolucaoCfg.keyCol]: entityId, acao: 'consultar', tipo: devolucaoCfg.tipo },
      });
      if (error) throw error;
      if (data?.nfe) setDevolucaoNfe(data.nfe);
      if (data?.nfe?.status === 'processada') toast.success('NF-e de devolução autorizada!');
      else if (data?.nfe?.status === 'erro') toast.error(data.nfe.erro_mensagem || 'Erro na emissão da devolução');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao consultar a devolução');
    } finally {
      setDevolucaoLoading(false);
    }
  };

  const consultarDevolucaoRef = useRef(consultarDevolucao);
  consultarDevolucaoRef.current = consultarDevolucao;
  useEffect(() => {
    if (!devolucaoPendente) return;
    const t = setInterval(() => consultarDevolucaoRef.current(), 6000);
    return () => clearInterval(t);
  }, [devolucaoPendente]);

  const emitirDevolucao = async (ambiente: 'homologacao' | 'producao') => {
    if (!devolucaoCfg || !entityId) return;
    setDevolucaoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { [devolucaoCfg.keyCol]: entityId, acao: 'emitir', tipo: devolucaoCfg.tipo, ambiente },
      });
      if (error) {
        let msg = error.message || 'Falha ao emitir a devolução';
        try {
          const ctx = (error as any).context;
          const j = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
          if (j?.error) msg = j.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setDevolucaoNfe(data?.nfe ?? null);
      toast.success(data?.nfe?.status === 'processada' ? 'NF-e de devolução autorizada!' : 'Devolução enviada para autorização.');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao emitir a devolução');
      await carregarDevolucao();
    } finally {
      setDevolucaoLoading(false);
    }
  };

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

  // ---- Passou da janela de 24h da SEFAZ: fluxo de Devolução ----
  if (elegivelDevolucao && passou24h) {
    if (devolucaoAutorizada && devolucaoNfe?.ambiente === 'producao') {
      return (
        <Badge
          variant="outline"
          className={`gap-1.5 border-amber-500/40 text-amber-600 ${className ?? ''}`}
          title={`NF-e de devolução nº ${devolucaoNfe?.numero ?? '-'}`}
        >
          <Undo2 className="h-3.5 w-3.5" /> NF-e devolvida
        </Badge>
      );
    }
    return (
      <>
        <Dialog open={devolucaoOpen} onOpenChange={setDevolucaoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Devolver NF-e {nfe.nfe?.numero ? `nº ${nfe.nfe.numero}` : ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Cancelamento não é mais possível</AlertTitle>
                <AlertDescription className="text-xs">
                  Já passaram mais de 24h da autorização em produção — a SEFAZ só aceita cancelamento dentro dessa
                  janela. A partir daqui, desfazer exige uma NOVA NF-e de devolução, referenciando esta.
                  O compromisso financeiro não é revertido automaticamente — ajuste no financeiro se necessário.
                </AlertDescription>
              </Alert>
              {devolucaoPendente && (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo devolução…</Badge>
                  <Button variant="ghost" size="sm" disabled={devolucaoLoading} onClick={consultarDevolucao} className="gap-1.5">
                    Atualizar
                  </Button>
                </div>
              )}
              {devolucaoErro && !devolucaoPendente && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {devolucaoNfe?.erro_mensagem || 'Falha na emissão da devolução'}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDevolucaoOpen(false)} disabled={devolucaoLoading}>
                Fechar
              </Button>
              {(!devolucaoAutorizada || podeReemitirHomologDevolucao) && !devolucaoPendente && (
                <Button
                  className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={devolucaoLoading}
                  onClick={() => emitirDevolucao('homologacao')}
                >
                  {devolucaoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : devolucaoErro ? <Undo2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                  {devolucaoErro ? 'Tentar novamente' : 'Devolver (Homologação)'}
                </Button>
              )}
              {podeReemitirHomologDevolucao && !devolucaoPendente && (
                <Button
                  className="gap-1.5"
                  disabled={devolucaoLoading}
                  onClick={() => emitirDevolucao('producao')}
                >
                  <Undo2 className="h-4 w-4" /> Devolver (Produção)
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          className={`gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 ${className ?? ''}`}
          onClick={() => setDevolucaoOpen(true)}
        >
          <Undo2 className="h-4 w-4" /> Devolver NF-e
        </Button>
      </>
    );
  }

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
          <div className="space-y-3 pt-1">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Esta operação não poderá ser desfeita</AlertTitle>
              <AlertDescription className="text-xs">
                O cancelamento é enviado à SEFAZ e é definitivo — não há como reverter depois de confirmado.
                O compromisso financeiro não é revertido automaticamente; ajuste no financeiro se necessário.
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">Informe o motivo (15 a 255 caracteres).</p>
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
