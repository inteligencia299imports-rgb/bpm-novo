-- Corrige a visibilidade de estoque_motos (seminovas) para vendedores.
--
-- Causa: a política "Acesso estoque_motos" chamava
--   user_has_empresa(auth.uid(), loja_id::uuid)
-- mas o overload user_has_empresa(uuid, uuid) neste banco (compartilhado com o
-- app mini/caixa) interpreta o 2º argumento como EMPRESA_ID, não como loja_id --
-- ele compara direto com user_empresas.empresa_id. Passando um loja_empresas.id
-- a função sempre retorna false para quem não é master, então o vendedor não
-- enxergava o catálogo de estoque nem conseguia anexar moto de interesse vinda
-- do estoque.
--
-- Aqui a checagem de "pertence à empresa dona da loja" é feita inline
-- (loja_empresas -> user_empresas), sem depender daquele overload. O app
-- mini/caixa não é afetado.

drop policy if exists "Acesso estoque_motos" on public.estoque_motos;

create policy "Acesso estoque_motos" on public.estoque_motos
  for select to authenticated
  using (
    public.has_app_role(auth.uid(), 'master'::app_role)
    -- membro da empresa dona da loja atual da moto (qualquer papel)
    or exists (
      select 1
      from public.loja_empresas le
      join public.user_empresas ue on ue.empresa_id = le.empresa_id
      where le.id = estoque_motos.loja_id::uuid
        and ue.user_id = auth.uid()
    )
    -- pelo atendimento de origem (compra / avaliação)
    or exists (
      select 1
      from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = estoque_motos.avaliacao_id
        and (
          a.vendedor_id = auth.uid()
          or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id)
        )
    )
    -- moto vinculada a um atendimento de VENDA do próprio vendedor (motos_interesse)
    or exists (
      select 1
      from public.motos_interesse mi
      join public.atendimentos_motos a on a.id = mi.atendimento_id
      where mi.estoque_moto_id = estoque_motos.id::text
        and a.vendedor_id = auth.uid()
    )
    -- moto marcada como vendida por um atendimento do próprio vendedor
    or exists (
      select 1
      from public.atendimentos_motos a
      where a.id = estoque_motos.atendimento_venda_id
        and a.vendedor_id = auth.uid()
    )
  );
