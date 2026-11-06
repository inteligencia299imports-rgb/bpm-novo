-- Aba Publicações: etapa "desativada" (anúncio tirado do site manualmente pelo botão Desativar).
-- A view site_motos_publicas só mostra etapa = 'publicada', então a desativada sai do site.
-- Vendida/retirada não usam essa etapa: saem do kanban pelo status do estoque.
alter table public.site_motos drop constraint if exists site_motos_etapa_check;
alter table public.site_motos
  add constraint site_motos_etapa_check check (etapa in ('em_aberto', 'fotos_tiradas', 'publicada', 'desativada'));
