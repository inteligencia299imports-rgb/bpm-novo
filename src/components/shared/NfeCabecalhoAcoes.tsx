import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Ban, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

/**
 * Cabeçalho da tela de emissão de NF-e: selo do status da nota (ao lado do
 * título) + botão "Verificar na SEFAZ" alinhado à direita da linha.
 * Some enquanto nenhuma NF-e foi emitida.
 */

interface NfeLike {
  nfe: { status?: string | null; ambiente?: string | null } | null;
  loading: boolean;
  consultar: () => Promise<void>;
}

const PROCESSANDO = new Set(['recebida', 'validando', 'processando_itens', 'gerando_contas']);

function selo(status: string, ambiente?: string | null) {
  const amb = ambiente === 'homologacao' ? ' · homologação' : ambiente === 'producao' ? ' · produção' : '';
  if (status === 'processada' || status === 'processada_com_pendencias') {
    return {
      label: (status === 'processada' ? 'Autorizada' : 'Autorizada c/ pendências') + amb,
      cls: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }
  if (status === 'cancelada') {
    return { label: 'Cancelada' + amb, cls: 'border-destructive/40 text-destructive', icon: <Ban className="h-3.5 w-3.5" /> };
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

  return (
    <>
      <Badge variant="outline" className={`gap-1.5 ${s.cls}`}>
        {s.icon}
        {s.label}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto gap-1.5 text-muted-foreground"
        onClick={() => nfe.consultar()}
        disabled={nfe.loading}
        title="Reconsulta a SEFAZ e atualiza o status (pega cancelamentos feitos fora do sistema)"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${nfe.loading ? 'animate-spin' : ''}`} /> Verificar na SEFAZ
      </Button>
    </>
  );
};

export default NfeCabecalhoAcoes;
