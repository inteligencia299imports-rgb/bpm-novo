/**
 * Etapa de aprovação da VENDA (espelha src/lib/aprovacao.ts do pós-compra).
 * Toda venda finalizada (`atendimentos_motos.situacao = 'vendido'`) entra em
 * `venda_aprovacao_status = 'aguardando'` e só dá andamento a qualquer processo
 * (contrato, NF-e, pós-venda / intermediação) depois de um master aprovar.
 * Recusada = card fica com tag "Recusado" e continua bloqueado (o master pode
 * aprovar depois).
 */

interface AtendimentoAprovavel {
  situacao?: string | null;
  venda_aprovacao_status?: string | null;
}

/** Só master aprova/recusa a venda. */
export const podeAprovarVenda = (role?: string | null): boolean => role === 'master';

export const vendaAguardando = (at?: AtendimentoAprovavel | null): boolean =>
  at?.venda_aprovacao_status === 'aguardando';

export const vendaAprovada = (at?: AtendimentoAprovavel | null): boolean =>
  at?.venda_aprovacao_status === 'aprovada';

export const vendaRecusada = (at?: AtendimentoAprovavel | null): boolean =>
  at?.venda_aprovacao_status === 'recusada';

/**
 * Liberado para dar andamento (contrato/NF/pós-venda): a venda ainda não foi
 * finalizada OU já está aprovada. Enquanto 'aguardando' ou 'recusada' → bloqueado.
 */
export const vendaLiberada = (at?: AtendimentoAprovavel | null): boolean =>
  at?.situacao !== 'vendido' || vendaAprovada(at);
