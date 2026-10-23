-- Observações de uma O.S. do ofc (tabela observacoes, tipo 'observacao', ligada
-- por id_operacao = atendimento_servicos.id), só leitura, para o BPM mostrar no
-- histórico da Preparação ao clicar numa movimentação de O.S. (#XXXX) — pedido do
-- usuário, 2026-10-23. A O.S. é achada pelo número (OS137 = #0137) E pela moto da
-- avaliação (placa ou vínculo com o estoque), pra não pegar O.S. de outra moto.
create or replace function public.observacoes_os_da_moto(_avaliacao_id uuid, _numero_os text)
returns table(numero_os text, observacao text, created_at timestamptz, autor text)
language sql
stable
security definer
set search_path = public
as $$
  with av as (
    select replace(upper(coalesce(placa, '')), '-', '') as placa
      from public.avaliacoes where id = _avaliacao_id
  ),
  os as (
    select s.id, s.numero_os
      from public.atendimento_servicos s, av
     where nullif(regexp_replace(coalesce(s.numero_os, ''), '\D', '', 'g'), '')::bigint
           = nullif(regexp_replace(coalesce(_numero_os, ''), '\D', '', 'g'), '')::bigint
       and (
         (av.placa <> '' and replace(upper(coalesce(s.moto_placa, '')), '-', '') = av.placa)
         or s.moto_estoque_id::text in (select em.id::text from public.estoque_motos em where em.avaliacao_id = _avaliacao_id)
       )
  )
  select os.numero_os, o.observacao, o.created_at,
         coalesce(public.nome_usuario(o.created_by, '299oficina'), '—') as autor
    from os
    join public.observacoes o on o.id_operacao = os.id and o.tipo = 'observacao'
   order by o.created_at desc;
$$;

grant execute on function public.observacoes_os_da_moto(uuid, text) to authenticated;
