-- Restaura a visibilidade de avaliações em preparação para QUALQUER
-- vendedor — segunda metade da mesma regressão corrigida em
-- 20260911170000_atendimentos_motos_rls_vendedor_preparacao.sql.
--
-- A política "Vendedor vê avaliacoes em preparacao" (has_role 'vendedor' +
-- situacao in ('adquirida','estoque')) foi recriada em 2026-06-18
-- (20260618133302_...sql) depois de um teste com view separada, mas foi
-- DROPADA de novo na consolidação de RLS de 2026-08-26
-- (20260826152724_...sql, linha 254) e nunca recriada — a política atual
-- "Acesso avaliacoes" só cobre: (a) vendedor/gerente do atendimento de
-- ORIGEM, (b) avaliacao_visivel_por_venda (vendedor da VENDA da moto), ou
-- (c) avaliacao_tem_estoque (só quando já existe linha em estoque_motos).
--
-- Avaliações em situacao='adquirida' (compra aprovada, ainda não colocada
-- em estoque_motos) não batem em nenhuma dessas três — ficam invisíveis
-- pra qualquer vendedor que não seja o dono do atendimento de origem,
-- mesmo depois do fix de atendimentos_motos (que só resolve o embed, não
-- a linha de avaliacoes em si).

create policy "Vendedor ve avaliacoes em preparacao" on public.avaliacoes
  for select to authenticated
  using (
    public.has_app_role(auth.uid(), 'vendedor'::app_role)
    and situacao = any (array['adquirida'::text, 'estoque'::text])
  );
