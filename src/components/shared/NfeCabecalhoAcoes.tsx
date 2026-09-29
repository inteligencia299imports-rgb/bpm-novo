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
  nfe: { status?: string | null; ambiente?: string | null; caminho_danfe?: string | null; numero?: string | number | null; serie?: string | number | null; operacao?: string | null } | null;
  loading: boolean;
  consultar: () => Promise<void>;
}

// Rótulo abreviado por operação pro nome do arquivo baixado (convenção:
// "NF - <OPERAÇÃO> - <PLACA OU CHASSI>"). Mantém o padrão de descrição de
// natureza de operação (CAIXA ALTA abreviada).
const OPERACAO_LABEL: Record<string, string> = {
  compra: 'COMPRA',
  devolucao_compra: 'DEVOLUCAO DE COMPRA',
  consignacao: 'CONSIGNACAO',
  devolucao_consignacao: 'DEVOLUCAO DE CONSIGNACAO',
  venda_seminova: 'VENDA',
  venda_0km: 'VENDA',
  devolucao_venda_seminova: 'DEVOLUCAO DE VENDA',
  devolucao_venda_0km: 'DEVOLUCAO DE VENDA',
  transferencia: 'TRANSFERENCIA',
  transferencia_saida: 'TRANSFERENCIA SAIDA',
  transferencia_entrada: 'TRANSFERENCIA ENTRADA',
  transferencia_saida_0km: 'TRANSFERENCIA SAIDA',
  transferencia_entrada_0km: 'TRANSFERENCIA ENTRADA',
  devolucao_transferencia: 'DEVOLUCAO DE TRANSFERENCIA',
  devolucao_transferencia_0km: 'DEVOLUCAO DE TRANSFERENCIA',
};

const nomeArquivoDanfe = (operacao: string | null | undefined, placaOuChassi: string | null | undefined) => {
  const rotulo = (operacao && OPERACAO_LABEL[operacao]) || 'NF-E';
  const identificador = (placaOuChassi || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `NF - ${rotulo}${identificador ? ` - ${identificador}` : ''}.pdf`;
};

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

/**
 * Botão DANFE — colocar na linha do título, alinhado à direita.
 *
 * `placaOuChassi` nomeia o arquivo baixado ("NF - VENDA - SHX5112.pdf" /
 * "NF - VENDA - 95V7G00AATM000017.pdf"). Baixa via blob pra poder controlar
 * o nome do arquivo (o link do Focus NFe não permite isso via `<a download>`
 * direto por ser de outra origem); se o fetch falhar (ex.: CORS), cai no
 * comportamento antigo de abrir em nova aba.
 */
export const NfeDanfeButton: React.FC<{ nfe: NfeLike; placaOuChassi?: string | null }> = ({ nfe, placaOuChassi }) => {
  const danfe = nfe.nfe?.caminho_danfe;
  if (!danfe) return null;
  const producao = nfe.nfe?.ambiente === 'producao';

  const baixar = async () => {
    try {
      const resp = await fetch(danfe);
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivoDanfe(nfe.nfe?.operacao, placaOuChassi);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(danfe, '_blank', 'noopener');
    }
  };

  return (
    <Button
      size="sm"
      className={cn(
        'gap-1.5 text-white',
        producao ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600',
      )}
      onClick={baixar}
    >
      <ExternalLink className="h-3.5 w-3.5" /> DANFE
    </Button>
  );
};
