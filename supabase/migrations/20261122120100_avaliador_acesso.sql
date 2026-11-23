-- Acesso do perfil Avaliador (pedido do usuário, 2026-11-22). Aplicar DEPOIS
-- de 20261122120000_app_role_avaliador.sql (em transação separada).
--
-- Avaliador: Relatórios, Avaliações, Novidades, Estoque, Preparação,
-- Publicações e NPS — edita avaliações e envia NPS; o resto é só consulta
-- (restrição feita nas telas, como já acontece hoje entre gerente e master).
-- No banco ele enxerga os registros das lojas das suas empresas, igual ao
-- gerente: entra na mesma função usada pelas políticas (RLS).
--
-- Corpos copiados da produção em 2026-11-22 (diferem das migrations antigas
-- do repositório); só foi acrescentado o avaliador. user_roles/user_empresas
-- não precisam de ajuste: em produção já são legíveis por autenticados /
-- colegas da mesma empresa.

create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select public.has_app_role(_user_id, 'master')
    or (
      (public.has_app_role(_user_id, 'gerente') or public.has_app_role(_user_id, 'avaliador'))
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
      (public.has_app_role(_user_id, 'gerente') or public.has_app_role(_user_id, 'avaliador'))
      and public.user_has_empresa(_user_id, _loja)
    )
$function$;

-- notify_role: só master/gerente podiam chamar, mas quem pede avaliação é o
-- vendedor — a notificação "Avaliação Solicitada" falhava calada para ele.
-- Passa a aceitar qualquer usuário ativo do BPM.
create or replace function public.notify_role(
  _role public.app_role,
  _title text,
  _message text,
  _entity_id uuid default null::uuid,
  _entity_type text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and ativo and projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  ) then
    raise exception 'Unauthorized';
  end if;

  insert into public.notifications (user_id, title, message, entity_id, entity_type)
  select ur.user_id, _title, _message, _entity_id, _entity_type
  from public.user_roles ur
  where ur.app_role = _role
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
end;
$function$;
