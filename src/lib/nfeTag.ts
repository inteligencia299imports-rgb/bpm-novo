/**
 * Tag de status da NF-e no card do kanban (pós-venda / compra / consignação).
 * Reflete o ÚLTIMO status da NF do atendimento/avaliação:
 *  - linha mais recente ainda em processamento -> "NF-e" (emitindo, âmbar)
 *  - senão, a última linha concluída (processada/cancelada) manda:
 *      cancelada -> vermelho · homologação -> laranja · produção -> azul
 *  - só linhas de erro / nenhuma linha -> sem tag
 */

export interface NfeTagRow {
  status?: string | null;
  ambiente?: string | null;
  created_at?: string | null;
}

export interface NfeTag {
  label: string;
  className: string;
}

const PENDENTE = new Set(['recebida', 'validando', 'processando_itens', 'gerando_contas']);
const CONCLUIDA = new Set(['processada', 'processada_com_pendencias', 'cancelada']);

export function nfeTagFromRows(rows: NfeTagRow[] | null | undefined): NfeTag | null {
  const list = (rows || [])
    .filter((r) => !!r && !!r.status)
    .slice()
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  if (list.length === 0) return null;

  const ultima = list[list.length - 1];
  if (PENDENTE.has(String(ultima.status))) {
    return { label: 'NF-e', className: 'bg-amber-400 hover:bg-amber-400 text-black' };
  }

  let concluida: NfeTagRow | null = null;
  for (const r of list) if (CONCLUIDA.has(String(r.status))) concluida = r;
  if (!concluida) return null;

  if (concluida.status === 'cancelada') {
    return { label: 'NF-e cancelada', className: 'bg-red-600 hover:bg-red-600' };
  }
  return concluida.ambiente === 'homologacao'
    ? { label: 'NF-e', className: 'bg-orange-500 hover:bg-orange-600' }
    : { label: 'NF-e', className: 'bg-primary hover:bg-primary' };
}

/**
 * Classe de cor para BOTÕES de NF-e (processo de venda), conforme a última
 * geração da nota: homologação = laranja, cancelada = vermelho, produção
 * autorizada = verde. Sem status conhecido -> '' (mantém o estilo padrão).
 */
export function nfeBotaoClasse(
  nfe: { status?: string | null; ambiente?: string | null } | null | undefined,
): string {
  const s = nfe?.status;
  if (s === 'cancelada') return 'bg-red-600 hover:bg-red-700 text-white';
  if (s === 'processada' || s === 'processada_com_pendencias') {
    return nfe?.ambiente === 'producao'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-orange-500 hover:bg-orange-600 text-white';
  }
  return '';
}
