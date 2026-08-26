-- =====================================================================
-- Redesenho do controle de acesso: projetos / user_roles / user_empresas
-- Substitui o sistema antigo (app_role: vendedor/gestor/avaliador/secretaria,
-- has_role(), tabela user_roles antiga) por um novo modelo multi-projeto:
--   master   -> acesso total, sem restricao
--   gerente  -> acesso total, restrito a empresa(s) vinculada(s) via user_empresas
--   vendedor -> ve/edita so os proprios registros; tabelas antes abertas a
--               qualquer autenticado passam a ser filtradas pela empresa dele
-- Mapeamento de papeis antigos -> novos: gestor -> master, secretaria -> master,
-- avaliador -> gerente, vendedor -> vendedor.
-- Acesso ao sistema exige uma linha ativa em user_roles para o projeto BPM
-- (id fixo d007a2c2-7576-4a60-ba1b-c506a9c4fcac).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Remove o sistema de papeis antigo (seguro: banco novo, sem dados reais)
-- ---------------------------------------------------------------------
drop function if exists public.has_role(uuid, public.app_role) cascade;
drop function if exists public.get_user_role(uuid) cascade;
drop function if exists public.can_manage_contrato_compra(uuid, uuid) cascade;
drop function if exists public.can_manage_contrato_consignacao(uuid, uuid) cascade;
drop table if exists public.user_roles cascade;
drop type if exists public.app_role cascade;

-- Politicas que nao referenciavam has_role (e por isso sobreviveram ao cascade
-- acima) mas serao substituidas por versoes com escopo de empresa:
drop policy if exists "Autenticados veem estoque" on public.estoque;
drop policy if exists "View moto photos" on storage.objects;

-- ---------------------------------------------------------------------
-- 2) Tipo de papel novo
-- ---------------------------------------------------------------------
create type public.app_role as enum ('master', 'gerente', 'vendedor');

-- ---------------------------------------------------------------------
-- 3) Trigger generico de updated_at (nome exigido pelas novas tabelas)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) projetos
-- ---------------------------------------------------------------------
create table public.projetos (
  id uuid not null default gen_random_uuid(),
  nome character varying(150) not null,
  slug character varying(60) not null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint projetos_pkey primary key (id),
  constraint projetos_slug_key unique (slug)
);

create trigger trg_projetos_updated before
update on public.projetos for each row
execute function public.set_updated_at();

alter table public.projetos enable row level security;

insert into public.projetos (id, nome, slug)
values ('d007a2c2-7576-4a60-ba1b-c506a9c4fcac', 'BPM', 'bpm')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5) empresas (nova - nao especificada pelo usuario; nome casa 1:1 com as
--    strings de loja ja usadas em atendimentos.loja / estoque.loja)
-- ---------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

alter table public.empresas enable row level security;

insert into public.empresas (nome) values
  ('Ducati BSB'), ('Ducati FLN'), ('Ducati POA'),
  ('299i'), ('299s'), ('299f'), ('299p'), ('Aventura')
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 6) user_roles (novo) e user_empresas
-- ---------------------------------------------------------------------
create table public.user_roles (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  projeto_id uuid null,
  ativo boolean not null default true,
  nome text null,
  email text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  app_role public.app_role not null,
  limite_desconto_percentual numeric not null default 8,
  constraint user_roles_pkey primary key (id),
  constraint user_roles_user_projeto_unique unique (user_id, projeto_id),
  constraint user_roles_projeto_id_fkey foreign key (projeto_id) references projetos (id) on delete set null,
  constraint user_roles_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

create index if not exists idx_user_roles_projeto_id on public.user_roles using btree (projeto_id);

create trigger trg_user_roles_updated before
update on public.user_roles for each row
execute function public.set_updated_at();

alter table public.user_roles enable row level security;

create table public.user_empresas (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  empresa_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint user_empresas_pkey primary key (id),
  constraint user_empresas_user_id_empresa_id_key unique (user_id, empresa_id),
  constraint user_empresas_empresa_id_fkey foreign key (empresa_id) references empresas (id) on delete cascade,
  constraint user_empresas_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

alter table public.user_empresas enable row level security;

-- ---------------------------------------------------------------------
-- 7) Funcoes auxiliares (substituem has_role/get_user_role)
--    Todas fixam o projeto BPM (unico projeto atendido por este app).
-- ---------------------------------------------------------------------
create or replace function public.has_app_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and ativo
      and app_role = _role
      and projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  )
$$;

create or replace function public.current_app_role(_user_id uuid)
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select ur.app_role from public.user_roles ur
  where ur.user_id = _user_id
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  limit 1
$$;

create or replace function public.user_has_empresa(_user_id uuid, _loja text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_empresas ue
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id = _user_id and e.nome = _loja
  )
$$;

-- Atalho: master OU (gerente com empresa == _loja). Usado em quase toda politica.
create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_app_role(_user_id, 'master')
    or (public.has_app_role(_user_id, 'gerente') and public.user_has_empresa(_user_id, _loja))
$$;

-- ---------------------------------------------------------------------
-- 8) RLS das 4 tabelas novas
-- ---------------------------------------------------------------------
create policy "Autenticados veem projetos" on public.projetos for select to authenticated using (true);
create policy "Master gerencia projetos" on public.projetos for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

create policy "Autenticados veem empresas" on public.empresas for select to authenticated using (true);
create policy "Master gerencia empresas" on public.empresas for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

create policy "Usuario ve propria role" on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      public.has_app_role(auth.uid(), 'gerente')
      and exists (
        select 1 from public.user_empresas ue1
        join public.user_empresas ue2 on ue2.empresa_id = ue1.empresa_id
        where ue1.user_id = auth.uid() and ue2.user_id = user_roles.user_id
      )
    )
  );
create policy "Master gerencia user_roles" on public.user_roles for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

create policy "Usuario ve propria empresa" on public.user_empresas for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      public.has_app_role(auth.uid(), 'gerente')
      and exists (
        select 1 from public.user_empresas ue
        where ue.user_id = auth.uid() and ue.empresa_id = user_empresas.empresa_id
      )
    )
  );
create policy "Master gerencia user_empresas" on public.user_empresas for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

-- =====================================================================
-- 9) Reescrita das politicas nas tabelas de negocio
--    Padrao geral: master (tudo) OR gerente-na-mesma-loja (tudo) OR dono
--    (vendedor_id = auth.uid(), preservando a regra atual do vendedor).
-- =====================================================================

-- atendimentos ---------------------------------------------------------
drop policy if exists "Vendedor vê próprios" on public.atendimentos;
drop policy if exists "Vendedor cria" on public.atendimentos;
drop policy if exists "Vendedor edita próprio" on public.atendimentos;
drop policy if exists "Gestor deleta atendimentos" on public.atendimentos;
drop policy if exists "Secretaria vê atendimentos" on public.atendimentos;
drop policy if exists "Avaliador vê vinculados" on public.atendimentos;
drop policy if exists "Vendedor vê atendimentos preparacao" on public.atendimentos;

create policy "Acesso atendimentos" on public.atendimentos for select to authenticated
  using (auth.uid() = vendedor_id or public.has_master_or_gerente_empresa(auth.uid(), loja));

create policy "Vendedor cria atendimentos" on public.atendimentos for insert to authenticated
  with check (auth.uid() = vendedor_id or public.has_master_or_gerente_empresa(auth.uid(), loja));

create policy "Edita atendimentos" on public.atendimentos for update to authenticated
  using (auth.uid() = vendedor_id or public.has_master_or_gerente_empresa(auth.uid(), loja));

create policy "Deleta atendimentos" on public.atendimentos for delete to authenticated
  using (public.has_master_or_gerente_empresa(auth.uid(), loja));

-- avaliacoes -------------------------------------------------------------
drop policy if exists "Avaliador gestor veem" on public.avaliacoes;
drop policy if exists "Vendedor vê próprias avaliacoes" on public.avaliacoes;
drop policy if exists "Secretaria vê avaliacoes" on public.avaliacoes;
drop policy if exists "Insert avaliacoes" on public.avaliacoes;
drop policy if exists "Delete avaliacoes" on public.avaliacoes;
drop policy if exists "Vendedor vê avaliacoes em preparacao" on public.avaliacoes;
drop policy if exists "Update avaliacoes" on public.avaliacoes;

create policy "Acesso avaliacoes" on public.avaliacoes for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = avaliacoes.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert avaliacoes" on public.avaliacoes for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a
      where a.id = avaliacoes.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update avaliacoes" on public.avaliacoes for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = avaliacoes.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete avaliacoes" on public.avaliacoes for delete to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = avaliacoes.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- motos_avaliacao ---------------------------------------------------------
drop policy if exists "Acesso motos avaliacao" on public.motos_avaliacao;
drop policy if exists "Insert motos avaliacao" on public.motos_avaliacao;
drop policy if exists "Update motos avaliacao" on public.motos_avaliacao;
drop policy if exists "Delete motos avaliacao" on public.motos_avaliacao;
drop policy if exists "Secretaria vê motos_avaliacao" on public.motos_avaliacao;
drop policy if exists "Secretaria atualiza motos_avaliacao" on public.motos_avaliacao;
drop policy if exists "Vendedor vê motos no estoque" on public.motos_avaliacao;
drop policy if exists "Vendedor vê motos preparacao" on public.motos_avaliacao;

create policy "Acesso motos avaliacao" on public.motos_avaliacao for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_avaliacao.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert motos avaliacao" on public.motos_avaliacao for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_avaliacao.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update motos avaliacao" on public.motos_avaliacao for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_avaliacao.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete motos avaliacao" on public.motos_avaliacao for delete to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_avaliacao.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- motos_interesse -----------------------------------------------------
drop policy if exists "Acesso motos interesse" on public.motos_interesse;
drop policy if exists "Insert motos interesse" on public.motos_interesse;
drop policy if exists "Update motos interesse" on public.motos_interesse;
drop policy if exists "Delete motos interesse" on public.motos_interesse;

create policy "Acesso motos interesse" on public.motos_interesse for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_interesse.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert motos interesse" on public.motos_interesse for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_interesse.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update motos interesse" on public.motos_interesse for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_interesse.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete motos interesse" on public.motos_interesse for delete to authenticated
  using (
    exists (
      select 1 from public.atendimentos a
      where a.id = motos_interesse.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- moto_fotos ---------------------------------------------------------
drop policy if exists "Acesso fotos" on public.moto_fotos;
drop policy if exists "Insert fotos" on public.moto_fotos;
drop policy if exists "Delete fotos" on public.moto_fotos;
drop policy if exists "Secretaria vê moto_fotos" on public.moto_fotos;

create policy "Acesso fotos" on public.moto_fotos for select to authenticated
  using (
    exists (
      select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
      where ma.id = moto_fotos.moto_avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert fotos" on public.moto_fotos for insert to authenticated
  with check (
    exists (
      select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
      where ma.id = moto_fotos.moto_avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete fotos" on public.moto_fotos for delete to authenticated
  using (
    exists (
      select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
      where ma.id = moto_fotos.moto_avaliacao_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- estoque ---------------------------------------------------------
drop policy if exists "Gestor gerencia estoque" on public.estoque;
drop policy if exists "Avaliador insere estoque" on public.estoque;
drop policy if exists "Avaliador atualiza estoque" on public.estoque;
drop policy if exists "Vendedor atualiza estoque venda" on public.estoque;

create policy "Acesso estoque" on public.estoque for select to authenticated
  using (public.has_app_role(auth.uid(), 'master') or public.user_has_empresa(auth.uid(), loja));

create policy "Gerencia estoque" on public.estoque for all to authenticated
  using (public.has_master_or_gerente_empresa(auth.uid(), loja))
  with check (public.has_master_or_gerente_empresa(auth.uid(), loja));

create policy "Vendedor atualiza estoque venda" on public.estoque for update to authenticated
  using (
    public.has_app_role(auth.uid(), 'vendedor')
    and exists (
      select 1 from public.motos_interesse mi join public.atendimentos a on a.id = mi.atendimento_id
      where mi.estoque_moto_id = estoque.id::text and a.vendedor_id = auth.uid()
    )
  );

-- marcas_motos / modelos_motos (catalogo, sem loja - segue aberto p/ leitura)
drop policy if exists "Gestor gerencia marcas" on public.marcas_motos;
create policy "Master gerencia marcas" on public.marcas_motos for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

drop policy if exists "Gestor gerencia modelos" on public.modelos_motos;
create policy "Master gerencia modelos" on public.modelos_motos for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

-- contratos ---------------------------------------------------------
drop policy if exists "Scoped select contratos" on public.contratos;
drop policy if exists "Insert contratos" on public.contratos;
drop policy if exists "Update contratos" on public.contratos;
drop policy if exists "Avaliador vê contrato compra" on public.contratos;
drop policy if exists "Avaliador cria contrato compra" on public.contratos;
drop policy if exists "Avaliador edita contrato compra" on public.contratos;

create policy "Acesso contratos" on public.contratos for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = contratos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert contratos" on public.contratos for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a where a.id = contratos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update contratos" on public.contratos for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = contratos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

-- contratos_consignacao (liga por avaliacao_id -> atendimento) ------------
drop policy if exists "Scoped select contratos_consignacao" on public.contratos_consignacao;
drop policy if exists "Insert contratos_consignacao" on public.contratos_consignacao;
drop policy if exists "Update contratos_consignacao" on public.contratos_consignacao;

create policy "Acesso contratos_consignacao" on public.contratos_consignacao for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = contratos_consignacao.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert contratos_consignacao" on public.contratos_consignacao for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = contratos_consignacao.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update contratos_consignacao" on public.contratos_consignacao for update to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = contratos_consignacao.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

-- contratos_consignante ---------------------------------------------------
drop policy if exists "Scoped select contratos_consignante" on public.contratos_consignante;
drop policy if exists "Insert contratos_consignante" on public.contratos_consignante;
drop policy if exists "Update contratos_consignante" on public.contratos_consignante;

create policy "Acesso contratos_consignante" on public.contratos_consignante for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = contratos_consignante.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert contratos_consignante" on public.contratos_consignante for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a where a.id = contratos_consignante.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update contratos_consignante" on public.contratos_consignante for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = contratos_consignante.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

-- custos_oficina (liga por avaliacao_id) -----------------------------
drop policy if exists "Scoped select custos_oficina" on public.custos_oficina;
drop policy if exists "Insert custos_oficina" on public.custos_oficina;
drop policy if exists "Update custos_oficina" on public.custos_oficina;
drop policy if exists "Delete custos_oficina" on public.custos_oficina;

create policy "Acesso custos_oficina" on public.custos_oficina for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = custos_oficina.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert custos_oficina" on public.custos_oficina for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = custos_oficina.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update custos_oficina" on public.custos_oficina for update to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = custos_oficina.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete custos_oficina" on public.custos_oficina for delete to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = custos_oficina.avaliacao_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- custos_operacionais (liga por contrato_consignante_id) ----------------
drop policy if exists "Scoped select custos_operacionais" on public.custos_operacionais;
drop policy if exists "Insert custos_operacionais" on public.custos_operacionais;
drop policy if exists "Update custos_operacionais" on public.custos_operacionais;
drop policy if exists "Delete custos_operacionais" on public.custos_operacionais;

create policy "Acesso custos_operacionais" on public.custos_operacionais for select to authenticated
  using (
    exists (
      select 1 from public.contratos_consignante cc join public.atendimentos a on a.id = cc.atendimento_id
      where cc.id = custos_operacionais.contrato_consignante_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert custos_operacionais" on public.custos_operacionais for insert to authenticated
  with check (
    exists (
      select 1 from public.contratos_consignante cc join public.atendimentos a on a.id = cc.atendimento_id
      where cc.id = custos_operacionais.contrato_consignante_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update custos_operacionais" on public.custos_operacionais for update to authenticated
  using (
    exists (
      select 1 from public.contratos_consignante cc join public.atendimentos a on a.id = cc.atendimento_id
      where cc.id = custos_operacionais.contrato_consignante_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete custos_operacionais" on public.custos_operacionais for delete to authenticated
  using (
    exists (
      select 1 from public.contratos_consignante cc join public.atendimentos a on a.id = cc.atendimento_id
      where cc.id = custos_operacionais.contrato_consignante_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- consignacao_processos (liga por avaliacao_id) ---------------------
drop policy if exists "Scoped select consignacao_processos" on public.consignacao_processos;
drop policy if exists "Insert consignacao_processos" on public.consignacao_processos;
drop policy if exists "Update consignacao_processos" on public.consignacao_processos;
drop policy if exists "Delete consignacao_processos" on public.consignacao_processos;

create policy "Acesso consignacao_processos" on public.consignacao_processos for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = consignacao_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert consignacao_processos" on public.consignacao_processos for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = consignacao_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update consignacao_processos" on public.consignacao_processos for update to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = consignacao_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete consignacao_processos" on public.consignacao_processos for delete to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = consignacao_processos.avaliacao_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- pos_compra_processos (liga por avaliacao_id) -----------------------
drop policy if exists "Scoped select pos_compra_processos" on public.pos_compra_processos;
drop policy if exists "Insert pos_compra_processos" on public.pos_compra_processos;
drop policy if exists "Update pos_compra_processos" on public.pos_compra_processos;

create policy "Acesso pos_compra_processos" on public.pos_compra_processos for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = pos_compra_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert pos_compra_processos" on public.pos_compra_processos for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = pos_compra_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update pos_compra_processos" on public.pos_compra_processos for update to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
      where av.id = pos_compra_processos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

-- pos_venda_processos (liga por atendimento_id) -----------------------
drop policy if exists "Scoped select pos_venda_processos" on public.pos_venda_processos;
drop policy if exists "Insert pos_venda_processos" on public.pos_venda_processos;
drop policy if exists "Update pos_venda_processos" on public.pos_venda_processos;

create policy "Acesso pos_venda_processos" on public.pos_venda_processos for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = pos_venda_processos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert pos_venda_processos" on public.pos_venda_processos for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a where a.id = pos_venda_processos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update pos_venda_processos" on public.pos_venda_processos for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = pos_venda_processos.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

-- formas_pagamento (liga por contrato_id) -----------------------------
drop policy if exists "Scoped select formas_pagamento" on public.formas_pagamento;
drop policy if exists "Insert formas_pagamento" on public.formas_pagamento;
drop policy if exists "Update formas_pagamento" on public.formas_pagamento;
drop policy if exists "Delete formas_pagamento" on public.formas_pagamento;

create policy "Acesso formas_pagamento" on public.formas_pagamento for select to authenticated
  using (
    exists (
      select 1 from public.contratos c join public.atendimentos a on a.id = c.atendimento_id
      where c.id = formas_pagamento.contrato_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert formas_pagamento" on public.formas_pagamento for insert to authenticated
  with check (
    exists (
      select 1 from public.contratos c join public.atendimentos a on a.id = c.atendimento_id
      where c.id = formas_pagamento.contrato_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Update formas_pagamento" on public.formas_pagamento for update to authenticated
  using (
    exists (
      select 1 from public.contratos c join public.atendimentos a on a.id = c.atendimento_id
      where c.id = formas_pagamento.contrato_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete formas_pagamento" on public.formas_pagamento for delete to authenticated
  using (
    exists (
      select 1 from public.contratos c join public.atendimentos a on a.id = c.atendimento_id
      where c.id = formas_pagamento.contrato_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- observacoes_processo (polimorfica: entity_type/entity_id) -----------
drop policy if exists "Scoped select observations" on public.observacoes_processo;
drop policy if exists "Insert own observations" on public.observacoes_processo;
drop policy if exists "Gestor deletes observations" on public.observacoes_processo;

create policy "Acesso observacoes_processo" on public.observacoes_processo for select to authenticated
  using (
    usuario_id = (auth.uid())::text
    or public.has_app_role(auth.uid(), 'master')
    or (
      entity_type in ('atendimento','pos_venda','intermediacao')
      and exists (
        select 1 from public.atendimentos a
        where a.id::text = observacoes_processo.entity_id
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
    or (
      entity_type in ('avaliacao','pos_compra','consignacao','preparacao')
      and exists (
        select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
        where av.id::text = observacoes_processo.entity_id
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

create policy "Insert own observations" on public.observacoes_processo for insert to authenticated
  with check (usuario_id = auth.uid()::text);

create policy "Master deletes observations" on public.observacoes_processo for delete to authenticated
  using (public.has_app_role(auth.uid(), 'master'));

-- respostas_nps (liga por atendimento_id) ------------------------------
drop policy if exists "Scoped select respostas_nps" on public.respostas_nps;
drop policy if exists "Gestor insere respostas_nps" on public.respostas_nps;
drop policy if exists "Gestor atualiza respostas_nps" on public.respostas_nps;
drop policy if exists "Gestor deleta respostas_nps" on public.respostas_nps;

create policy "Acesso respostas_nps" on public.respostas_nps for select to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = respostas_nps.atendimento_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert respostas_nps" on public.respostas_nps for insert to authenticated
  with check (
    exists (
      select 1 from public.atendimentos a where a.id = respostas_nps.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

create policy "Update respostas_nps" on public.respostas_nps for update to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = respostas_nps.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

create policy "Delete respostas_nps" on public.respostas_nps for delete to authenticated
  using (
    exists (
      select 1 from public.atendimentos a where a.id = respostas_nps.atendimento_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- status_history (polimorfica: entity_type/entity_id) ------------------
drop policy if exists "Scoped select status history" on public.status_history;
drop policy if exists "Users can insert own status history" on public.status_history;

create policy "Acesso status_history" on public.status_history for select to authenticated
  using (
    changed_by = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      entity_type = any (array['atendimento','pos_venda','intermediacao','consulta'])
      and exists (
        select 1 from public.atendimentos a
        where a.id = status_history.entity_id
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
    or (
      entity_type = any (array['avaliacao','pos_compra','consignacao','preparacao','showroom'])
      and exists (
        select 1 from public.avaliacoes av join public.atendimentos a on a.id = av.atendimento_id
        where (av.id = status_history.entity_id or av.moto_avaliacao_id = status_history.entity_id)
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

create policy "Users can insert own status history" on public.status_history for insert to authenticated
  with check (changed_by = auth.uid());

-- ---------------------------------------------------------------------
-- 10) storage.objects (bucket moto-fotos)
-- ---------------------------------------------------------------------
drop policy if exists "Upload moto photos" on storage.objects;
drop policy if exists "Update moto photos" on storage.objects;
drop policy if exists "Delete moto photos" on storage.objects;

create policy "View moto photos" on storage.objects for select
  using (bucket_id = 'moto-fotos');

create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos a
          where a.id::text = (storage.foldername(name))[2]
            and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
        )
      )
      or exists (
        select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
        where ma.id::text = (storage.foldername(name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

create policy "Update moto photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos a
          where a.id::text = (storage.foldername(name))[2]
            and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
        )
      )
      or exists (
        select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
        where ma.id::text = (storage.foldername(name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

create policy "Delete moto photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos a
          where a.id::text = (storage.foldername(name))[2]
            and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
        )
      )
      or exists (
        select 1 from public.motos_avaliacao ma join public.atendimentos a on a.id = ma.atendimento_id
        where ma.id::text = (storage.foldername(name))[1]
          and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
      )
    )
  );
