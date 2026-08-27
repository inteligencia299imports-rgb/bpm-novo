-- loja_empresas: mapeia o codigo de loja usado dentro de cada sistema
-- (ex: 'atendimentos_motos.loja' = '299i') para a empresa correspondente
-- na tabela compartilhada public.empresas. 'sistema' identifica de qual
-- produto a loja vem; este projeto (BPM de motos) usa sistema = 'motos'.

create table if not exists public.loja_empresas (
  loja text not null,
  sistema text not null,
  empresa_id uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint loja_empresas_pkey primary key (loja, sistema),
  constraint loja_empresas_empresa_id_fkey foreign key (empresa_id) references empresas (id)
);

drop trigger if exists trg_loja_empresas_updated on public.loja_empresas;
create trigger trg_loja_empresas_updated before
update on public.loja_empresas for each row
execute function public.set_updated_at();

alter table public.loja_empresas enable row level security;

drop policy if exists "Autenticados veem loja_empresas" on public.loja_empresas;
create policy "Autenticados veem loja_empresas" on public.loja_empresas for select to authenticated using (true);
drop policy if exists "Master gerencia loja_empresas" on public.loja_empresas;
create policy "Master gerencia loja_empresas" on public.loja_empresas for all to authenticated
  using (public.has_app_role(auth.uid(), 'master')) with check (public.has_app_role(auth.uid(), 'master'));

-- Popula o mapeamento das 8 lojas ja existentes deste sistema. O nome
-- em empresas ja casa 1:1 com o codigo de loja (ver 20260826152724).
insert into public.loja_empresas (loja, sistema, empresa_id)
select e.nome, 'motos', e.id
from public.empresas e
where e.nome in ('Ducati BSB', 'Ducati FLN', 'Ducati POA', '299i', '299s', '299f', '299p', 'Aventura')
on conflict (loja, sistema) do nothing;
