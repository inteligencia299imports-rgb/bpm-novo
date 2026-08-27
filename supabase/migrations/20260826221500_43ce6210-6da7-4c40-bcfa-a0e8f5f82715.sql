alter table public.loja_empresas
  add column if not exists ativo boolean not null default true;
