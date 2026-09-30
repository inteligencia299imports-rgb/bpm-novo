import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CheckCircle, Loader2, Radio, FileText, CheckCircle2 } from 'lucide-react';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';

interface DemonstracaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; em_demonstracao?: boolean | null; demonstracao_observacao?: string | null } | null;
  onSuccess: () => void;
}

/**
 * Pedido do usuário, 2026-09-30: moto 0km que saiu com NF de demonstração
 * (CFOP 2912/6912, emitida fora do bpm-novo, direto na Focus — cadastro
 * fiscal já pronto no SisFin, ver docs-fiscal-299 §2.71) continua
 * "disponível" e vendável normalmente na empresa de origem enquanto a
 * demonstração está aberta ("estoque negativo" até a NF de retorno).
 *
 * Duas formas de marcar isso, deste o achado real do chassi 95V1200AATM000012:
 * 1. Vincular o XML da NF de demonstração já autorizada (emitida pela Focus,
 *    fora do bpm-novo) — libera cancelar pelo botão padrão (CancelarNfeDialog),
 *    que a própria emitir-nfe-compra trava se já houver NF de venda em
 *    produção NA MESMA empresa que emitiu a demonstração.
 * 2. Toggle manual (sem NF vinculada) — só um aviso visual, sem cancelamento
 *    de verdade. Fica escondido quando já existe uma NF vinculada e ativa.
 */
const DemonstracaoDialog: React.FC<DemonstracaoDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const [ativo, setAtivo] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  const [xml, setXml] = useState('');
  const [refFocus, setRefFocus] = useState('');
  const [vinculando, setVinculando] = useState(false);

  const estoqueId = estoqueItem?.id || '';
  const demoNfe = useNfeCompra(estoqueId, open, 'demonstracao_saida', 'estoque_moto_nova');
  useEffect(() => { if (open && estoqueId) demoNfe.carregar(); }, [open, estoqueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && estoqueItem) {
      setAtivo(!!estoqueItem.em_demonstracao);
      setObservacao(estoqueItem.demonstracao_observacao || '');
      setXml('');
      setRefFocus('');
    }
  }, [open, estoqueItem]);

  const temNfVinculada = demoNfe.emitida || demoNfe.pendente || demoNfe.erro;

  const handleVincular = async () => {
    if (!estoqueItem) return;
    if (!xml.trim() || !refFocus.trim()) {
      toast.error('Cole o XML completo da NF-e e informe o ref usado na emissão pela Focus');
      return;
    }
    setVinculando(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { acao: 'vincular_demonstracao', tipo: 'demonstracao_saida', estoque_moto_nova_id: estoqueItem.id, xml: xml.trim(), ref: refFocus.trim() },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Falha ao vincular');
      }
      toast.success('NF de demonstração vinculada');
      setXml('');
      setRefFocus('');
      await demoNfe.carregar();
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao vincular a NF');
    } finally {
      setVinculando(false);
    }
  };

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
          {temNfVinculada ? (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-4 w-4 text-primary" /> NF de Demonstração</span>
                {demoNfe.emitida && (
                  <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Nº {demoNfe.nfe?.numero || '-'} • Série {demoNfe.nfe?.serie || '-'}
              </p>
              {demoNfe.emitida && <CancelarNfeDialog nfe={demoNfe} />}
            </div>
          ) : (
            <div className="rounded-lg border p-3 space-y-3">
              <span className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-4 w-4 text-primary" /> Vincular NF de Demonstração</span>
              <p className="text-xs text-muted-foreground">
                Cole o XML completo da NF-e já autorizada (emitida pela Focus, fora do bpm-novo) e o <code>ref</code> usado na emissão — vai liberar cancelar essa NF por aqui depois, se precisar.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ref da Focus</Label>
                <Input value={refFocus} onChange={(e) => setRefFocus(e.target.value)} placeholder="referência usada na emissão" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">XML da NF-e</Label>
                <Textarea value={xml} onChange={(e) => setXml(e.target.value)} placeholder="Cole o XML completo (nfeProc)..." rows={4} className="font-mono text-xs" />
              </div>
              <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vinculando} onClick={handleVincular}>
                {vinculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Vincular
              </Button>
            </div>
          )}

          {!temNfVinculada && (
            <>
              <Separator />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="em-demonstracao" className="cursor-pointer">Moto em demonstração (aviso manual)</Label>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemonstracaoDialog;
