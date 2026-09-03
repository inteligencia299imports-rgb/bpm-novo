-- =====================================================================
-- Remove a ponte temporaria (20260909010000). Rodar SO depois que o front
-- novo + as edge functions (emitir-nfe-compra, extrair-dados-crlv) ja
-- estiverem em producao. Volta ao alvo: avaliacoes/motos_interesse so com
-- marca_id/modelo_id.
-- =====================================================================

drop trigger if exists trg_avaliacoes_marca_modelo_bridge      on public.avaliacoes;
drop trigger if exists trg_motos_interesse_marca_modelo_bridge on public.motos_interesse;
drop function if exists public._sync_marca_modelo_bridge();

alter table public.avaliacoes      drop column if exists marca, drop column if exists modelo;
alter table public.motos_interesse drop column if exists marca, drop column if exists modelo;
