-- Modulo financeiro minimo p/ gerar o compromisso (contas a pagar) da NF-e de
-- compra. Replica compromissos / compromissos_parcelas do sistema OFC, com as
-- tabelas de apoio reduzidas ao necessario. A "formas_pagamento" do OFC colide
-- com a tabela homonima (de venda) ja existente no BPM, por isso aqui usamos
-- "formas_pagamento_financeiro".

-- =====================================================================
-- Tabelas de apoio
-- =====================================================================
create table if not exists public.plano_contas (
  id uuid primary key default gen_random_uuid(),
  codigo text null,
  nome text not null,
  natureza text null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text null,
  nome text not null,
  empresa_id uuid null references public.empresas(id),
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.formas_pagamento_financeiro (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

drop trigger if exists trg_plano_contas_upd on public.plano_contas;
create trigger trg_plano_contas_upd before update on public.plano_contas
  for each row execute function set_updated_at();
drop trigger if exists trg_centros_custo_upd on public.centros_custo;
create trigger trg_centros_custo_upd before update on public.centros_custo
  for each row execute function set_updated_at();
drop trigger if exists trg_formas_pagamento_financeiro_upd on public.formas_pagamento_financeiro;
create trigger trg_formas_pagamento_financeiro_upd before update on public.formas_pagamento_financeiro
  for each row execute function set_updated_at();

-- =====================================================================
-- Numeracao do compromisso: CPR-D-XXXX
-- =====================================================================
create sequence if not exists public.compromisso_numero_seq;

create or replace function public.set_compromisso_numero() returns trigger language plpgsql as $$
begin
  if new.numero_compromisso is null or new.numero_compromisso = '' then
    new.numero_compromisso := 'CPR-D-' || lpad(nextval('public.compromisso_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

-- =====================================================================
-- Compromissos (contas a pagar) + parcelas
-- =====================================================================
create table if not exists public.compromissos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  fornecedor_id uuid null,
  numero_compromisso text null,
  natureza text not null default 'despesa'::text,
  despesa_fixa boolean not null default false,
  plano_conta_id uuid not null,
  centro_custo_id uuid not null,
  observacoes text null,
  status_compromisso text not null default 'em_aberto'::text,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  pedido_compra_id uuid null,
  nfe_entrada_id uuid null,
  numero_documento text null,
  constraint compromissos_pkey primary key (id),
  constraint compromissos_empresa_id_fkey foreign key (empresa_id) references public.empresas (id) on delete restrict,
  constraint compromissos_fornecedor_id_fkey foreign key (fornecedor_id) references public.clientes_fornecedores (id) on delete restrict,
  constraint compromissos_plano_conta_id_fkey foreign key (plano_conta_id) references public.plano_contas (id),
  constraint compromissos_centro_custo_id_fkey foreign key (centro_custo_id) references public.centros_custo (id),
  constraint compromissos_nfe_entrada_id_fkey foreign key (nfe_entrada_id) references public.nfe_entradas (id) on delete set null
);

create index if not exists idx_comp_fornecedor on public.compromissos using btree (fornecedor_id) where (deleted_at is null);
create index if not exists idx_comp_natureza on public.compromissos using btree (natureza) where (deleted_at is null);
create index if not exists idx_compromissos_empresa_id on public.compromissos using btree (empresa_id);
create unique index if not exists idx_compromissos_nfe_entrada on public.compromissos (nfe_entrada_id) where (nfe_entrada_id is not null);

drop trigger if exists trg_compromissos_set_numero on public.compromissos;
create trigger trg_compromissos_set_numero before insert on public.compromissos
  for each row execute function public.set_compromisso_numero();
drop trigger if exists trg_compromissos_updated_at on public.compromissos;
create trigger trg_compromissos_updated_at before update on public.compromissos
  for each row execute function set_updated_at();

create table if not exists public.compromissos_parcelas (
  id uuid not null default gen_random_uuid(),
  compromisso_id uuid not null,
  numero_parcela integer not null,
  valor numeric not null,
  valor_juros numeric not null default 0,
  valor_desconto numeric not null default 0,
  data_vencimento date not null,
  data_pagamento date null,
  status_pagamento text not null default 'em_aberto'::text,
  tipo text not null default 'unico'::text,
  forma_pagamento_id uuid not null,
  observacoes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  boleto_path text null,
  boleto_nome text null,
  constraint compromissos_parcelas_pkey primary key (id),
  constraint compromissos_parcelas_compromisso_id_fkey foreign key (compromisso_id) references public.compromissos (id) on delete cascade,
  constraint compromissos_parcelas_forma_pagamento_id_fkey foreign key (forma_pagamento_id) references public.formas_pagamento_financeiro (id)
);

create index if not exists idx_cp_comp on public.compromissos_parcelas using btree (compromisso_id);
create index if not exists idx_cp_status on public.compromissos_parcelas using btree (status_pagamento);
create index if not exists idx_cp_venc on public.compromissos_parcelas using btree (data_vencimento);

drop trigger if exists trg_compromissos_parcelas_updated_at on public.compromissos_parcelas;
create trigger trg_compromissos_parcelas_updated_at before update on public.compromissos_parcelas
  for each row execute function set_updated_at();

-- =====================================================================
-- nfe_entradas: coluna p/ carregar a observacao da NF ate a criacao do compromisso
-- =====================================================================
alter table public.nfe_entradas add column if not exists observacoes text;

-- =====================================================================
-- Seed das chaves fixas usadas pelo fluxo de compra de moto
-- =====================================================================
insert into public.plano_contas (id, nome, natureza)
values ('d16507df-9655-4677-8ed9-01398ce28239', 'Compra de veiculos para revenda', 'despesa')
on conflict (id) do nothing;

insert into public.centros_custo (id, nome)
values ('7fe3888a-fd17-4c31-b78b-82a0af680ff3', 'Estoque de motos')
on conflict (id) do nothing;

insert into public.formas_pagamento_financeiro (id, nome, tipo)
values ('63e1fff5-14d7-476c-b2da-e1ea173279a1', 'Transferencia / PIX', 'pix')
on conflict (id) do nothing;

-- =====================================================================
-- RLS: acesso somente via service role (Edge Function). Sem policies.
-- =====================================================================
alter table public.plano_contas enable row level security;
alter table public.centros_custo enable row level security;
alter table public.formas_pagamento_financeiro enable row level security;
alter table public.compromissos enable row level security;
alter table public.compromissos_parcelas enable row level security;
