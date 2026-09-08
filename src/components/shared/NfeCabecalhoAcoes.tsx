import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, Ban, AlertTriangle, Loader2, RefreshCw, ExternalLink } from 'lucide-react';

/**
 * Cabeçalho da tela de emissão de NF-e: selo do status da nota (ao lado do
 * título) + "Atualizar SEFAZ" (reconsulta) + "DANFE" (baixa o PDF), alinhados
 * à direita da linha. Homologação = laranja, produção = verde.
 * Some enquanto nenhuma NF-e foi emitida.
 */

interface NfeLike {
  nfe: { status?: string | null; ambiente?: string | null; caminho_danfe?: string | null } | null;
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

const NfeCabecalhoAcoes: React.FC<{ nfe: NfeLike }> = ({ nfe }) => {
  const status = nfe.nfe?.status;
  if (!status) return null;
  const s = selo(status, nfe.nfe?.ambiente);
  const producao = nfe.nfe?.ambiente === 'producao';
  const danfe = nfe.nfe?.caminho_danfe;

  return (
    <>
      <Badge variant="outline" className={`gap-1.5 ${s.cls}`}>
        {s.icon}
        {s.label}
      </Badge>
      <span className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => nfe.consultar()}
          disabled={nfe.loading}
          title="Reconsulta a SEFAZ e atualiza o status (pega cancelamentos feitos fora do sistema)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${nfe.loading ? 'animate-spin' : ''}`} /> Atualizar SEFAZ
        </Button>
        {danfe && (
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
        )}
      </span>
    </>
  );
};

export default NfeCabecalhoAcoes;
