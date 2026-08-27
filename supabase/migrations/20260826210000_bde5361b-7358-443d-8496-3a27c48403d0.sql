-- Corrige a estrutura de public.empresas: a tabela foi criada em
-- 20260826152724 com apenas (id, nome, created_at), uma estrutura minima
-- inventada porque o schema real nao havia sido informado. Esta migration
-- alinha a tabela a estrutura correta (empresas compartilhada entre
-- CRM/BPM/OFC/MINI/HCM).

alter table public.empresas
  add column if not exists cnpj text not null default ''::text,
  add column if not exists ativo boolean not null default true,
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists crm boolean not null default false,
  add column if not exists bpm boolean not null default false,
  add column if not exists ofc boolean not null default false,
  add column if not exists mini boolean not null default false,
  add column if not exists regime_tributario text,
  add column if not exists uf text,
  add column if not exists inscricao_estadual text,
  add column if not exists hcm boolean not null default false,
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists endereco text,
  add column if not exists banner_url text,
  add column if not exists saldo_inicial numeric(14, 2) not null default 0,
  add column if not exists saldo_inicial_data date;

-- As 8 lojas ja existentes ficam com cnpj = '' (default). Um unique
-- constraint tradicional em cnpj rejeitaria essas linhas por duplicidade
-- de ''. Em vez disso, um indice unico parcial garante que nenhum CNPJ
-- *preenchido* se repita, sem quebrar as linhas ainda sem CNPJ cadastrado.
create unique index if not exists empresas_cnpj_key on public.empresas (cnpj) where cnpj <> '';

-- As lojas deste projeto BPM sao consumidoras da tabela compartilhada.
update public.empresas set bpm = true where nome in
  ('Ducati BSB', 'Ducati FLN', 'Ducati POA', '299i', '299s', '299f', '299p', 'Aventura');

drop trigger if exists trg_empresas_updated on public.empresas;
create trigger trg_empresas_updated before
update on public.empresas for each row
execute function public.set_updated_at();
