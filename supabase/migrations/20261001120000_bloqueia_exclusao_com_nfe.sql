-- Bloqueia exclusão de atendimento/avaliação/estoque com NF-e autorizada em produção.
--
-- Achado real 2026-10-01: a BMW F 850 GS Adventure placa SDM8F01 (chassi 99Z0K0009RZ934254),
-- comprada pela NF 6974 e vendida ao Ronaldo Baeta Nogueira pela NF 7265 (produção, 28/09),
-- sumiu do banco depois de 28/09 13:53: o atendimento de compra, a avaliação, o estoque e todo
-- o status_history foram apagados — assinatura de delete_atendimento_cascade /
-- delete_avaliacao_cascade, que apagam o histórico junto. Nenhum app atual chama essas funções
-- (o bpm-novo tirou o botão em 2026-08-30), mas o EXECUTE estava liberado até para anon/PUBLIC.

-- 1) Funções de exclusão em cascata: só service_role/postgres executam.
revoke execute on function public.delete_atendimento_cascade(uuid) from public, anon, authenticated;
revoke execute on function public.delete_avaliacao_cascade(uuid) from public, anon, authenticated;

-- 2) Trava no banco, vale para qualquer caminho (RPC, tela, API, SQL e cascata de FK).
create or replace function public.bloquear_exclusao_com_nfe()
returns trigger
language plpgsql
as $$
declare
  _nf record;
begin
  if tg_table_name = 'atendimentos_motos' then
    select n.numero, n.operacao into _nf from public.nfe_entradas n
    where n.atendimento_id = old.id
      and n.ambiente = 'producao' and n.status in ('processada', 'processada_com_pendencias')
    limit 1;
  elsif tg_table_name = 'avaliacoes' then
    select n.numero, n.operacao into _nf from public.nfe_entradas n
    where n.avaliacao_id = old.id
      and n.ambiente = 'producao' and n.status in ('processada', 'processada_com_pendencias')
    limit 1;
  elsif tg_table_name = 'estoque_motos' then
    -- Só NF de VENDA: a devolução de compra (emitir-nfe-compra) remove o estoque de propósito.
    select n.numero, n.operacao into _nf from public.nfe_entradas n
    where n.estoque_moto_id = old.id and n.operacao like 'venda%'
      and n.ambiente = 'producao' and n.status in ('processada', 'processada_com_pendencias')
    limit 1;
  end if;

  if found then
    raise exception 'Exclusão bloqueada: % % tem NF-e % (%) autorizada em produção.',
      tg_table_name, old.id, coalesce(_nf.numero, '?'), _nf.operacao
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_bloquear_exclusao_com_nfe on public.atendimentos_motos;
create trigger trg_bloquear_exclusao_com_nfe before delete on public.atendimentos_motos
  for each row execute function public.bloquear_exclusao_com_nfe();

drop trigger if exists trg_bloquear_exclusao_com_nfe on public.avaliacoes;
create trigger trg_bloquear_exclusao_com_nfe before delete on public.avaliacoes
  for each row execute function public.bloquear_exclusao_com_nfe();

drop trigger if exists trg_bloquear_exclusao_com_nfe on public.estoque_motos;
create trigger trg_bloquear_exclusao_com_nfe before delete on public.estoque_motos
  for each row execute function public.bloquear_exclusao_com_nfe();
