-- Renomeia motos_novas -> estoque_motos_novas (tabela + objetos dependentes).
-- A coluna estoque_motos.moto_nova_id NAO muda; a FK acompanha a tabela.
-- Idempotente: so age se a tabela antiga ainda existir.

do $$
begin
  if to_regclass('public.motos_novas') is not null
     and to_regclass('public.estoque_motos_novas') is null then

    alter table public.motos_novas rename to estoque_motos_novas;

    alter table public.estoque_motos_novas
      rename constraint motos_novas_pkey to estoque_motos_novas_pkey;
    alter table public.estoque_motos_novas
      rename constraint motos_novas_empresa_id_fkey to estoque_motos_novas_empresa_id_fkey;

    alter index if exists public.motos_novas_origem_externa_key
      rename to estoque_motos_novas_origem_externa_key;
    alter index if exists public.idx_motos_novas_status
      rename to idx_estoque_motos_novas_status;

    alter trigger trg_motos_novas_upd on public.estoque_motos_novas
      rename to trg_estoque_motos_novas_upd;

    alter policy "Leitura motos_novas" on public.estoque_motos_novas
      rename to "Leitura estoque_motos_novas";
  end if;
end $$;
