-- Endereço RESIDENCIAL (ATPV) do cliente/fornecedor — só para Pessoa Jurídica.
-- Separado da `clientes_fornecedores_enderecos` (que segue sendo o endereço
-- COMERCIAL usado na emissão de NF, tipo='fiscal') de propósito: nenhum dos ~24
-- consumidores hoje filtra `clientes_fornecedores_enderecos` por `tipo` (fazem
-- embed cru e pegam a 1ª linha) — misturar um 2º tipo na mesma tabela arriscaria
-- devolver a linha errada pra eles. Tabela nova = zero risco pros consumidores
-- existentes; só ClienteForm lê/grava esta.
create table if not exists public.clientes_fornecedores_enderecos_atpv (
  id uuid primary key default gen_random_uuid(),
  cliente_fornecedor_id uuid not null references public.clientes_fornecedores(id) on delete cascade,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  pais text not null default 'Brasil',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_fornecedores_enderecos_atpv_cliente_unique unique (cliente_fornecedor_id)
);

drop trigger if exists trg_cf_end_atpv_updated on public.clientes_fornecedores_enderecos_atpv;
create trigger trg_cf_end_atpv_updated before update on public.clientes_fornecedores_enderecos_atpv
  for each row execute function set_updated_at();

alter table public.clientes_fornecedores_enderecos_atpv enable row level security;

drop policy if exists "auth read enderecos atpv" on public.clientes_fornecedores_enderecos_atpv;
drop policy if exists "auth insert enderecos atpv" on public.clientes_fornecedores_enderecos_atpv;
drop policy if exists "auth update enderecos atpv" on public.clientes_fornecedores_enderecos_atpv;
drop policy if exists "auth delete enderecos atpv" on public.clientes_fornecedores_enderecos_atpv;

create policy "auth read enderecos atpv" on public.clientes_fornecedores_enderecos_atpv
  for select to authenticated using (true);
create policy "auth insert enderecos atpv" on public.clientes_fornecedores_enderecos_atpv
  for insert to authenticated with check (true);
create policy "auth update enderecos atpv" on public.clientes_fornecedores_enderecos_atpv
  for update to authenticated using (true) with check (true);
create policy "auth delete enderecos atpv" on public.clientes_fornecedores_enderecos_atpv
  for delete to authenticated using (true);
