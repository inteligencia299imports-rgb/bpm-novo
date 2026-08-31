-- Motos 0km: entram por sistema externo (nao por avaliacao), ficam em estoque_motos
-- e sao vendidas igual seminova.

create table if not exists public.motos_novas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  loja_id text,                       -- loja_empresas.id onde a moto esta
  marca text not null,
  modelo text not null,
  categoria text,
  cor text,
  cilindrada text,
  ano_fabricacao text,
  ano_modelo text,
  chassi text,
  renavam text,
  placa text,
  ncm text,
  valor numeric,                      -- preco de tabela / venda
  valor_custo numeric,                -- custo de aquisicao da montadora
  chave_nfe_origem text,              -- NF-e da montadora (entrada 0km)
  origem_externa_id text,             -- id no sistema de origem (idempotencia)
  status text not null default 'disponivel',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists motos_novas_origem_externa_key
  on public.motos_novas (origem_externa_id) where origem_externa_id is not null;
create index if not exists idx_motos_novas_status on public.motos_novas (status);

drop trigger if exists trg_motos_novas_upd on public.motos_novas;
create trigger trg_motos_novas_upd before update on public.motos_novas
  for each row execute function set_updated_at();

alter table public.motos_novas enable row level security;
drop policy if exists "Leitura motos_novas" on public.motos_novas;
create policy "Leitura motos_novas" on public.motos_novas
  for select to authenticated using (true);
-- insert/update/delete: somente service role (sistema externo).

-- estoque_motos passa a aceitar 0km via moto_nova_id (alternativa a avaliacao_id).
alter table public.estoque_motos add column if not exists moto_nova_id uuid references public.motos_novas(id) on delete set null;
create index if not exists idx_estoque_motos_moto_nova on public.estoque_motos (moto_nova_id);

alter table public.estoque_motos drop constraint if exists estoque_motos_fonte_chk;
alter table public.estoque_motos add constraint estoque_motos_fonte_chk
  check ((avaliacao_id is not null)::int + (moto_nova_id is not null)::int = 1);
