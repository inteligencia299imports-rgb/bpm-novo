-- Centraliza as observacoes de todos os processos (showroom, avaliacao,
-- consignacao, pos_compra, pos_venda, intermediacao) numa unica lista por
-- atendimento, usando a tabela observacoes (id_operacao = atendimentos_motos.id)
-- em vez do sistema paralelo observacoes_processo (entity_id/entity_type),
-- que fragmentava as observacoes por processo dentro do mesmo atendimento.

-- Migra o que ja existir em observacoes_processo, resolvendo o entity_id
-- correto para o atendimento_id em cada caso.
insert into public.observacoes (id_operacao, observacao, user_id, created_at)
select
  case op.entity_type
    when 'avaliacao' then av.atendimento_id
    when 'consignacao' then av.atendimento_id
    when 'pos_compra' then av.atendimento_id
    else op.entity_id::uuid
  end as id_operacao,
  op.texto,
  nullif(op.usuario_id, '')::uuid,
  op.created_at
from public.observacoes_processo op
left join public.avaliacoes av on av.id::text = op.entity_id and op.entity_type in ('avaliacao', 'consignacao', 'pos_compra')
where case op.entity_type
    when 'avaliacao' then av.atendimento_id
    when 'consignacao' then av.atendimento_id
    when 'pos_compra' then av.atendimento_id
    else op.entity_id::uuid
  end is not null;

drop table if exists public.observacoes_processo;
