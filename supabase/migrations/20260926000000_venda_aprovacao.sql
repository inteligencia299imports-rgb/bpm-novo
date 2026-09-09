-- Etapa de aprovação da VENDA (espelha avaliacoes.aprovacao_* do pós-compra).
-- Toda venda finalizada (atendimentos_motos.situacao = 'vendido') entra em
-- 'aguardando' e só dá andamento (contrato, NF, pós-venda/intermediação) após
-- um master aprovar. Recusada = card fica com tag "Recusado" e bloqueado.
alter table atendimentos_motos
  add column if not exists venda_aprovacao_status text,        -- null | 'aguardando' | 'aprovada' | 'recusada'
  add column if not exists venda_aprovado_por uuid,
  add column if not exists venda_aprovado_em timestamptz,
  add column if not exists venda_aprovacao_observacao text;

-- Grandfather: venda já existente com NF-e de venda emitida entra como 'aprovada';
-- sem NF-e emitida, entra em 'aguardando' (precisa da aprovação do master).
update atendimentos_motos a
  set venda_aprovacao_status = case
    when exists (
      select 1 from nfe_entradas n
      where n.atendimento_id = a.id and n.operacao like 'venda%' and n.status = 'processada'
    ) then 'aprovada' else 'aguardando' end
  where a.situacao = 'vendido' and a.venda_aprovacao_status is null;
