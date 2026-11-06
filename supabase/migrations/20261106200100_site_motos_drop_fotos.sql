-- Depois do deploy do BPM que grava as fotos em site_motos_fotos: sai a coluna antiga.
alter table public.site_motos drop constraint if exists site_motos_fotos_max;
alter table public.site_motos drop column if exists fotos;
