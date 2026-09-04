-- Corrige RLS de estoque_motos_novas (0km): faltavam as policies de UPDATE.
--
-- Causa: a migration 20260907000000_estoque_0km_separado.sql adicionou as colunas
-- de venda (atendimento_venda_id, valor_sinal, valor_venda, data_venda, preco_acao)
-- a estoque_motos_novas, mas só existia a policy de leitura ("Leitura
-- estoque_motos_novas", for select using (true)). Sem policy de UPDATE, todo
-- UPDATE nessa tabela — inclusive o salvamento de valor_sinal/valor_venda no
-- ContratoDialog (venda/sinal) e o vínculo de atendimento_venda_id feito ao
-- mudar o status do atendimento para sinal/vendido — era silenciosamente
-- bloqueado pelo RLS (0 linhas afetadas, sem erro).
--
-- Aqui espelhamos as duas policies de escrita que já existem em estoque_motos
-- (ver 20260902000000_estoque_motos.sql), adaptadas para estoque_motos_novas.

create policy "Gerencia estoque_motos_novas" on public.estoque_motos_novas
  for all to authenticated
  using (
    public.has_app_role(auth.uid(), 'master'::app_role)
    or (loja_id is not null and public.has_master_or_gerente_empresa(auth.uid(), loja_id::uuid))
  )
  with check (
    public.has_app_role(auth.uid(), 'master'::app_role)
    or (loja_id is not null and public.has_master_or_gerente_empresa(auth.uid(), loja_id::uuid))
  );

create policy "Vendedor atualiza estoque_motos_novas venda" on public.estoque_motos_novas
  for update to authenticated
  using (
    public.has_app_role(auth.uid(), 'vendedor'::app_role)
    and exists (
      select 1
      from public.motos_interesse mi
      join public.atendimentos_motos a on a.id = mi.atendimento_id
      where mi.estoque_moto_id = estoque_motos_novas.id::text
        and a.vendedor_id = auth.uid()
    )
  );
