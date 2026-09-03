-- Vincula as formas de pagamento "Financiamento" e "Consórcio" a instituições
-- (bancos / administradoras) cadastradas em clientes_fornecedores, com um texto
-- padrão de observações por (forma + instituição) que pré-preenche a observação
-- editável de cada forma de pagamento do contrato.
--
-- Inclui (idempotente) o alter que faltava de 20260908000000_formas_pagamento_contrato_fk
-- porque o tracking de migrations do BPM está dessincronizado do banco (DB 299).

-- 0) Pré-requisito: forma_pagamento_id + tipo nullable em formas_pagamento_contrato
alter table public.formas_pagamento_contrato
  add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id);
alter table public.formas_pagamento_contrato alter column tipo drop not null;

-- 1) formas_pagamento_contrato ganha a instituição escolhida e a observação editável
alter table public.formas_pagamento_contrato
  add column if not exists cliente_fornecedor_id uuid references public.clientes_fornecedores(id) on delete set null,
  add column if not exists observacoes text;

-- 2) Catálogo: (forma_pagamento) x (instituição em clientes_fornecedores)
create table if not exists public.formas_pagamento_instituicoes (
  id uuid primary key default gen_random_uuid(),
  forma_pagamento_id uuid not null references public.formas_pagamento(id) on delete cascade,
  cliente_fornecedor_id uuid not null references public.clientes_fornecedores(id) on delete cascade,
  observacoes_contrato text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (forma_pagamento_id, cliente_fornecedor_id)
);
create index if not exists idx_fp_instituicoes_forma
  on public.formas_pagamento_instituicoes (forma_pagamento_id);

drop trigger if exists trg_fp_instituicoes_upd on public.formas_pagamento_instituicoes;
create trigger trg_fp_instituicoes_upd before update on public.formas_pagamento_instituicoes
  for each row execute function public.set_updated_at();

alter table public.formas_pagamento_instituicoes enable row level security;

drop policy if exists "Leitura formas_pagamento_instituicoes" on public.formas_pagamento_instituicoes;
create policy "Leitura formas_pagamento_instituicoes" on public.formas_pagamento_instituicoes
  for select to authenticated using (true);

drop policy if exists "Escrita formas_pagamento_instituicoes" on public.formas_pagamento_instituicoes;
create policy "Escrita formas_pagamento_instituicoes" on public.formas_pagamento_instituicoes
  for all to authenticated
  using (public.has_app_role(auth.uid(), 'master'::app_role))
  with check (public.has_app_role(auth.uid(), 'master'::app_role));

-- 3) Forma de pagamento "Consórcio" (irmã de "Financiamento")
insert into public.formas_pagamento (nome, bpm, ativo, ordem)
select 'Consórcio', true, true, 1
where not exists (
  select 1 from public.formas_pagamento
  where lower(nome) in ('consórcio', 'consorcio')
);
