import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, Ban, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';

/**
 * Selo do status e botão DANFE — ambos na linha do título: status logo após
 * o título, DANFE alinhado à direita. Homologação = laranja, produção =
 * verde. Sem "Atualizar SEFAZ": a reconsulta acontece via polling automático
 * enquanto a NF-e está pendente (ver useNfeCompra).
 */

interface NfeLike {
  nfe: { status?: string | null; ambiente?: string | null; caminho_danfe?: string | null; numero?: string | number | null; serie?: string | number | null } | null;
  loading: boolean;
  consultar: () => Promise<void>;
}

const PROCESSANDO = new Set(['recebida', 'validando', 'processando_itens', 'gerando_contas']);

function selo(status: string, ambiente?: string | null) {
  const producao = ambiente === 'producao';
  if (status === 'processada' || status === 'processada_com_pendencias') {
    return {
      label: 'Autorizada',
      cls: producao
        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
        : 'border-orange-500/40 text-orange-600 dark:text-orange-400',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }
  if (status === 'cancelada') {
    return { label: 'Cancelada', cls: 'border-destructive/40 text-destructive', icon: <Ban className="h-3.5 w-3.5" /> };
  }
  if (status === 'erro') {
    return { label: 'Erro na emissão', cls: 'border-destructive/40 text-destructive', icon: <AlertTriangle className="h-3.5 w-3.5" /> };
  }
  if (PROCESSANDO.has(status)) {
    return { label: 'Processando', cls: 'border-amber-500/40 text-amber-700 dark:text-amber-400', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> };
  }
  return { label: status, cls: 'text-muted-foreground', icon: null };
}

/** Selo do status — colocar na linha do título, alinhado à direita. */
export const NfeStatusBadge: React.FC<{ nfe: NfeLike }> = ({ nfe }) => {
  const status = nfe.nfe?.status;
  if (!status) return null;
  const s = selo(status, nfe.nfe?.ambiente);
  return (
    <Badge variant="outline" className={`gap-1.5 ${s.cls}`}>
      {s.icon}
      {s.label}
    </Badge>
  );
};

/** Botão DANFE — colocar na linha do título, alinhado à direita. */
export const NfeDanfeButton: React.FC<{ nfe: NfeLike }> = ({ nfe }) => {
  const danfe = nfe.nfe?.caminho_danfe;
  if (!danfe) return null;
  const producao = nfe.nfe?.ambiente === 'producao';
  return (
    <Button
      size="sm"
      className={cn(
        'gap-1.5 text-white',
        producao ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600',
      )}
      onClick={() => window.open(danfe, '_blank', 'noopener')}
    >
      <ExternalLink className="h-3.5 w-3.5" /> DANFE
    </Button>
  );
};
