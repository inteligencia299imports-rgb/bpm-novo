-- estoque_motos_novas: marca/modelo passam a ser FK (marca_id -> marcas_motos,
-- modelo_id -> modelos_motos) em vez de texto livre.
-- Tabela alimentada por sistema externo; sempre vazia neste momento.

do $$
begin
  if to_regclass('public.estoque_motos_novas') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='estoque_motos_novas' and column_name='marca'
     ) then

    alter table public.estoque_motos_novas
      drop column marca,
      drop column modelo,
      add column marca_id  uuid not null references public.marcas_motos(id),
      add column modelo_id uuid not null references public.modelos_motos(id);

    create index if not exists idx_estoque_motos_novas_marca
      on public.estoque_motos_novas (marca_id);
    create index if not exists idx_estoque_motos_novas_modelo
      on public.estoque_motos_novas (modelo_id);
  end if;
end $$;
