-- =====================================================================
-- PONTE TEMPORARIA marca/modelo (rollback parcial da 20260909000000).
--
-- Motivo: o schema novo (so marca_id/modelo_id) ja esta em producao, mas o
-- front e as edge functions ainda nao. Esta migration re-cria as colunas
-- texto `marca`/`modelo` como ESPELHO mantido por trigger a partir dos ids,
-- e um trigger inverso que resolve o id quando o codigo antigo grava so o
-- texto. Com isso, codigo antigo e novo funcionam ao mesmo tempo.
--
-- DEPOIS do deploy do front + `supabase functions deploy emitir-nfe-compra
-- extrair-dados-crlv`, rodar 20260909020000_marca_modelo_bridge_remove.sql
-- para voltar ao alvo (so os ids).
-- =====================================================================

alter table public.avaliacoes
  add column if not exists marca  text,
  add column if not exists modelo text;

alter table public.motos_interesse
  add column if not exists marca  text,
  add column if not exists modelo text;

update public.avaliacoes a
set marca = mm.nome, modelo = md.nome
from public.marcas_motos mm, public.modelos_motos md
where mm.id = a.marca_id and md.id = a.modelo_id;

update public.motos_interesse mi
set marca = mm.nome
from public.marcas_motos mm
where mm.id = mi.marca_id;

update public.motos_interesse mi
set modelo = md.nome
from public.modelos_motos md
where md.id = mi.modelo_id;

-- ---------------------------------------------------------------------
-- Trigger: resolve id <- texto (codigo antigo) e espelha texto <- id.
-- ---------------------------------------------------------------------
create or replace function public._sync_marca_modelo_bridge()
returns trigger language plpgsql
set search_path to 'public'
as $fn$
declare
  _marca_nome  text;
  _modelo_nome text;
begin
  -- 1) codigo antigo manda so o texto: resolve o id pelo catalogo
  if new.marca_id is null and nullif(btrim(new.marca), '') is not null then
    select id into new.marca_id from public.marcas_motos
      where upper(btrim(nome)) = upper(btrim(new.marca)) limit 1;
  elsif tg_op = 'UPDATE'
        and new.marca is distinct from old.marca
        and new.marca_id is not distinct from old.marca_id
        and nullif(btrim(new.marca), '') is not null then
    select id into new.marca_id from public.marcas_motos
      where upper(btrim(nome)) = upper(btrim(new.marca)) limit 1;
  end if;

  if new.marca_id is not null
     and new.modelo_id is null
     and nullif(btrim(new.modelo), '') is not null then
    select id into new.modelo_id from public.modelos_motos
      where marca_id = new.marca_id and upper(btrim(nome)) = upper(btrim(new.modelo)) limit 1;
  elsif tg_op = 'UPDATE'
        and new.modelo is distinct from old.modelo
        and new.modelo_id is not distinct from old.modelo_id
        and new.marca_id is not null
        and nullif(btrim(new.modelo), '') is not null then
    select id into new.modelo_id from public.modelos_motos
      where marca_id = new.marca_id and upper(btrim(nome)) = upper(btrim(new.modelo)) limit 1;
  end if;

  -- 2) o texto e SEMPRE derivado dos ids (fonte de verdade)
  select nome into _marca_nome  from public.marcas_motos  where id = new.marca_id;
  select nome into _modelo_nome from public.modelos_motos where id = new.modelo_id;
  new.marca  := _marca_nome;
  new.modelo := _modelo_nome;

  return new;
end;
$fn$;

drop trigger if exists trg_avaliacoes_marca_modelo_bridge on public.avaliacoes;
create trigger trg_avaliacoes_marca_modelo_bridge
  before insert or update on public.avaliacoes
  for each row execute function public._sync_marca_modelo_bridge();

drop trigger if exists trg_motos_interesse_marca_modelo_bridge on public.motos_interesse;
create trigger trg_motos_interesse_marca_modelo_bridge
  before insert or update on public.motos_interesse
  for each row execute function public._sync_marca_modelo_bridge();
