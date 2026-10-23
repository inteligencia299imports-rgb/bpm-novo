import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MessageSquare } from 'lucide-react';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { supabase } from '@/lib/supabase';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  /** Número da O.S. como aparece no histórico ("#0137"). */
  numeroOs: string | null;
}

interface ObsOs {
  numero_os: string | null;
  observacao: string;
  created_at: string;
  autor: string | null;
}

/**
 * Observações da O.S. do ofc (as mesmas do card "Observações" da O.S.), em linha
 * do tempo no padrão do histórico. Só leitura: não edita, adiciona nem remove —
 * isso continua sendo feito no ofc. Fonte: RPC observacoes_os_da_moto.
 */
const OsObservacoesDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, numeroOs }) => {
  const [loading, setLoading] = useState(false);
  const [obs, setObs] = useState<ObsOs[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !numeroOs) return;
    let ativo = true;
    setLoading(true);
    setErro(null);
    // A RPC ainda não está nos tipos gerados do Supabase.
    (supabase as any)
      .rpc('observacoes_os_da_moto', { _avaliacao_id: avaliacaoId, _numero_os: numeroOs })
      .then(({ data, error }: { data: ObsOs[] | null; error: { message: string } | null }) => {
        if (!ativo) return;
        if (error) setErro(error.message);
        setObs(data || []);
        setLoading(false);
      });
    return () => { ativo = false; };
  }, [open, avaliacaoId, numeroOs]);

  const historico = obs.map((o, i) => ({
    id: `${o.created_at}-${i}`,
    status: o.observacao,
    created_at: o.created_at,
    changed_by_name: o.autor,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Observações da O.S. {numeroOs}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : erro ? (
          <p className="text-sm text-destructive py-4">Não foi possível carregar as observações: {erro}</p>
        ) : historico.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma observação registrada nesta O.S.</p>
        ) : (
          <div className="pt-1">
            <StatusTimeline history={historico} formatLabel={(s) => s} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OsObservacoesDialog;
