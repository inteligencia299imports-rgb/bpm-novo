-- O vendedor não conseguia ver os dados da moto (marca, modelo, placa, preço,
-- specs) dentro do próprio atendimento de VENDA quando a moto é seminova de
-- estoque.
--
-- Motivo: no modelo "estoque enxuto", estoque_motos guarda quase nada — marca,
-- modelo, placa, ano, km, cor, preço etc. vêm todos da avaliação de origem
-- (a compra/troca). A RLS de SELECT de `avaliacoes` só libera a avaliação para
-- quem é vendedor/gerente do atendimento DE ORIGEM. Como a venda é feita por
-- outro vendedor, o embed `avaliacao` volta nulo e o card da moto aparece
-- vazio no atendimento de venda.
--
-- Correção: liberar a leitura da avaliação também para o vendedor do atendimento
-- de VENDA da moto — via motos_interesse.estoque_moto_id ou
-- estoque_motos.atendimento_venda_id. Feito por função SECURITY DEFINER para
-- não criar recursão mútua entre as policies de `avaliacoes` e `estoque_motos`.

create or replace function public.avaliacao_visivel_por_venda(_avaliacao_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estoque_motos em
    join public.motos_interesse mi on mi.estoque_moto_id = em.id::text
    join public.atendimentos_motos a on a.id = mi.atendimento_id
    where em.avaliacao_id = _avaliacao_id
      and a.vendedor_id = _user_id
  )
  or exists (
    select 1
    from public.estoque_motos em
    join public.atendimentos_motos a on a.id = em.atendimento_venda_id
    where em.avaliacao_id = _avaliacao_id
      and a.vendedor_id = _user_id
  );
$$;

drop policy if exists "Acesso avaliacoes" on public.avaliacoes;

create policy "Acesso avaliacoes" on public.avaliacoes
  for select to authenticated
  using (
    exists (
      select 1
      from public.atendimentos_motos a
      where a.id = avaliacoes.atendimento_id
        and (
          a.vendedor_id = auth.uid()
          or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id)
        )
    )
    or public.avaliacao_visivel_por_venda(avaliacoes.id, auth.uid())
  );
