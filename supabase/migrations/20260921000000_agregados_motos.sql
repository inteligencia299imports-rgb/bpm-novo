-- Agregados: serviços cobrados à parte do cliente no contrato de venda.
-- Catálogo (agregados_motos) + itens escolhidos por contrato (contratos_agregados,
-- com o valor podendo ser editado no contrato).

create table if not exists agregados_motos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contratos_agregados (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  agregado_id uuid references agregados_motos(id) on delete set null,
  descricao text not null,             -- snapshot do nome do agregado
  valor numeric not null default 0,    -- valor no contrato (pode diferir do catálogo)
  created_at timestamptz not null default now()
);
create index if not exists idx_contratos_agregados_contrato on contratos_agregados(contrato_id);

drop trigger if exists set_updated_at_agregados_motos on agregados_motos;
create trigger set_updated_at_agregados_motos before update on agregados_motos
  for each row execute function set_updated_at();

alter table agregados_motos enable row level security;
alter table contratos_agregados enable row level security;

-- Catálogo: todo mundo lê; só master/gerente cadastra/edita.
drop policy if exists "Leitura agregados_motos" on agregados_motos;
create policy "Leitura agregados_motos" on agregados_motos
  for select to authenticated using (true);
drop policy if exists "Gerencia agregados_motos" on agregados_motos;
create policy "Gerencia agregados_motos" on agregados_motos
  for all to authenticated
  using (has_app_role(auth.uid(), 'master'::app_role) or has_app_role(auth.uid(), 'gerente'::app_role))
  with check (has_app_role(auth.uid(), 'master'::app_role) or has_app_role(auth.uid(), 'gerente'::app_role));

-- Itens do contrato: mesmo acesso do contrato (vendedor do atendimento ou gerência da loja).
drop policy if exists "Acesso contratos_agregados" on contratos_agregados;
create policy "Acesso contratos_agregados" on contratos_agregados
  for all to authenticated
  using (exists (
    select 1 from contratos c join atendimentos_motos a on a.id = c.atendimento_id
    where c.id = contratos_agregados.contrato_id
      and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))
  ))
  with check (exists (
    select 1 from contratos c join atendimentos_motos a on a.id = c.atendimento_id
    where c.id = contratos_agregados.contrato_id
      and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))
  ));

insert into agregados_motos (descricao, valor) values
  ('Emplacamento', 0),
  ('Seguro', 0),
  ('Rastreador', 0),
  ('Acessórios', 0),
  ('Revisão', 0)
on conflict do nothing;
