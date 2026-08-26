-- Corrige recursao infinita nas politicas de user_empresas/user_roles:
-- as politicas continham subqueries diretas contra user_empresas dentro da
-- propria politica de user_empresas (e um self-join equivalente em
-- user_roles), o que forca reavaliacao da mesma politica indefinidamente.
-- Solucao: mover as checagens para funcoes SECURITY DEFINER, que nao sofrem
-- RLS (mesmo padrao ja usado por has_app_role/user_has_empresa).

create or replace function public.user_shares_empresa(_user_id uuid, _empresa_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_empresas ue
    where ue.user_id = _user_id and ue.empresa_id = _empresa_id
  )
$$;

create or replace function public.users_share_any_empresa(_user_id_a uuid, _user_id_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_empresas ue1
    join public.user_empresas ue2 on ue2.empresa_id = ue1.empresa_id
    where ue1.user_id = _user_id_a and ue2.user_id = _user_id_b
  )
$$;

drop policy if exists "Usuario ve propria role" on public.user_roles;
create policy "Usuario ve propria role" on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      public.has_app_role(auth.uid(), 'gerente')
      and public.users_share_any_empresa(auth.uid(), user_roles.user_id)
    )
  );

drop policy if exists "Usuario ve propria empresa" on public.user_empresas;
create policy "Usuario ve propria empresa" on public.user_empresas for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      public.has_app_role(auth.uid(), 'gerente')
      and public.user_shares_empresa(auth.uid(), user_empresas.empresa_id)
    )
  );
