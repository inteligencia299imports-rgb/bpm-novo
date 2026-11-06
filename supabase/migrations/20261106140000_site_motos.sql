-- Publicação de seminovas no site (aba "Publicações" do BPM) — 06/11/2026.
-- O anúncio da moto no site passa a viver no DB 299, ligado à avaliação (um por moto). Mesmas colunas
-- da antiga tabela public.motos do Supabase do site (projeto jdmceorkoispbktkuhpx), para o site ler sem
-- mudar a conversão (src/lib/db/mapa.ts linhaParaMoto).
-- Etapas do kanban: em_aberto -> fotos_tiradas -> publicada.
-- O site só enxerga site_motos_publicas: publicada + moto ainda à venda (sem sinal, venda, retirada).

create table if not exists public.site_motos (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null unique references public.avaliacoes(id) on delete cascade,
  etapa text not null default 'em_aberto' check (etapa in ('em_aberto', 'fotos_tiradas', 'publicada')),
  slug text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  marca text,
  modelo text,
  ano_fab int,
  ano_modelo int,
  km int check (km is null or km >= 0),
  cc int,
  cor text,
  estilo text,
  loja text,
  preco numeric(12, 2) check (preco is null or preco >= 0),
  preco_de numeric(12, 2),
  fipe numeric(12, 2),
  mercado_min numeric(12, 2),
  mercado_max numeric(12, 2),
  selos text[] not null default '{}',
  caracteristicas text[] not null default '{}',
  destaque boolean not null default false,
  imagem text not null default '',
  fotos text[] not null default '{}',
  potencia_cv numeric,
  torque_kgfm numeric,
  peso_kg numeric,
  cambio text,
  descricao text,
  diferenciais text[] not null default '{}',
  acessorios text[] not null default '{}',
  ordem int not null default 0,
  fotos_em timestamptz,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create or replace function public.fn_site_motos_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  if new.etapa = 'publicada' and (tg_op = 'INSERT' or old.etapa is distinct from 'publicada') then
    new.publicado_em := now();
  end if;
  if new.etapa = 'fotos_tiradas' and (tg_op = 'INSERT' or old.etapa is distinct from 'fotos_tiradas') then
    new.fotos_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_site_motos_atualizado on public.site_motos;
create trigger trg_site_motos_atualizado before insert or update on public.site_motos
  for each row execute function public.fn_site_motos_atualizado();

alter table public.site_motos enable row level security;

-- Quem usa o BPM (user_roles do projeto BPM, ativo) lê e edita os anúncios.
create or replace function public.usuario_bpm(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = _uid and r.ativo
       and r.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  ) or coalesce(public.has_role(_uid, 'master'::text), false);
$$;

drop policy if exists site_motos_bpm_select on public.site_motos;
create policy site_motos_bpm_select on public.site_motos for select to authenticated using (public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_bpm_insert on public.site_motos;
create policy site_motos_bpm_insert on public.site_motos for insert to authenticated with check (public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_bpm_update on public.site_motos;
create policy site_motos_bpm_update on public.site_motos for update to authenticated using (public.usuario_bpm(auth.uid())) with check (public.usuario_bpm(auth.uid()));

-- O que o site pode mostrar (leitura pública, sem login). Mesmas colunas da antiga public.motos do site.
create or replace view public.site_motos_publicas as
select s.id, s.slug, s.marca, s.modelo, s.ano_fab, s.ano_modelo, s.km, s.cc, s.cor, s.preco, s.preco_de,
       s.selos, s.estilo, s.loja, s.imagem, s.caracteristicas, s.destaque, s.fotos, s.potencia_cv,
       s.torque_kgfm, s.peso_kg, s.cambio, s.descricao, s.diferenciais, s.acessorios, s.fipe,
       s.mercado_min, s.mercado_max, true as publicado, s.ordem,
       coalesce(s.publicado_em, s.criado_em) as criado_em, s.atualizado_em
  from public.site_motos s
  join public.avaliacoes a on a.id = s.avaliacao_id
 where s.etapa = 'publicada'
   and s.slug is not null and s.marca is not null and s.modelo is not null
   and s.preco is not null and s.imagem <> ''
   and a.situacao in ('adquirida', 'estoque', 'oficina')
   and coalesce(a.tipo_aquisicao, '') not in ('test-ride', 'test_ride')
   -- Sinal, venda, retirada ou indisponível: sai do site.
   and not exists (
     select 1 from public.estoque_motos e
      where e.avaliacao_id = a.id and e.status not in ('disponivel', 'servico')
   );

grant select on public.site_motos_publicas to anon, authenticated;

-- Fotos do anúncio: bucket público (o site exibe pela URL pública).
insert into storage.buckets (id, name, public)
values ('site-motos', 'site-motos', true)
on conflict (id) do update set public = true;

drop policy if exists site_motos_fotos_insert on storage.objects;
create policy site_motos_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-motos' and public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_fotos_update on storage.objects;
create policy site_motos_fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'site-motos' and public.usuario_bpm(auth.uid()));
drop policy if exists site_motos_fotos_delete on storage.objects;
create policy site_motos_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-motos' and public.usuario_bpm(auth.uid()));
