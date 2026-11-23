-- Acesso do perfil Administrativo (pedido do usuário, 2026-11-22). Aplicar
-- DEPOIS de 20261122130000_app_role_administrativo.sql (transação separada).
--
-- Administrativo: Estoque, Consulta, Pós-Venda, Intermediação, Pós-Compra,
-- Consignação e Preparação (restrição de telas feita no front). No banco
-- enxerga os registros das lojas das suas empresas, como gerente/avaliador.
-- Corpos iguais aos de produção em 2026-11-22, só acrescentando o perfil.

create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select public.has_app_role(_user_id, 'master')
    or (
      (public.has_app_role(_user_id, 'gerente') or public.has_app_role(_user_id, 'avaliador')
        or public.has_app_role(_user_id, 'administrativo'))
      and exists (
        select 1 from public.user_empresas ue
        join public.loja_empresas le on le.empresa_id = ue.empresa_id
        where ue.user_id = _user_id and le.id = _loja_id
      )
    )
$function$;

create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja text)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select public.has_app_role(_user_id, 'master')
    or (
      (public.has_app_role(_user_id, 'gerente') or public.has_app_role(_user_id, 'avaliador')
        or public.has_app_role(_user_id, 'administrativo'))
      and public.user_has_empresa(_user_id, _loja)
    )
$function$;
