-- RAW8J82 (2026-11-26): o Vitor vendeu a moto pelo próprio atendimento, mas o estoque
-- continuou "disponível". Ele é GERENTE (não vendedor) e a moto tinha acabado de ser
-- transferida para uma empresa que não é dele: a política "Vendedor atualiza ... venda"
-- exigia o perfil vendedor e a "Gerencia ..." só cobre as lojas das empresas do gestor.
-- O UPDATE afetou 0 linhas sem erro e a venda seguiu sem reservar a moto.
--
-- Quem atende a venda (vendedor_id do atendimento que tem a moto como interesse) pode
-- registrar sinal/venda no estoque, qualquer que seja o perfil.

alter policy "Vendedor atualiza estoque_motos venda" on public.estoque_motos
  using (exists (
    select 1 from public.motos_interesse mi
      join public.atendimentos_motos a on a.id = mi.atendimento_id
     where mi.estoque_moto_id = (estoque_motos.id)::text and a.vendedor_id = auth.uid()));

alter policy "Vendedor atualiza estoque_motos_novas venda" on public.estoque_motos_novas
  using (exists (
    select 1 from public.motos_interesse mi
      join public.atendimentos_motos a on a.id = mi.atendimento_id
     where mi.estoque_moto_id = (estoque_motos_novas.id)::text and a.vendedor_id = auth.uid()));
