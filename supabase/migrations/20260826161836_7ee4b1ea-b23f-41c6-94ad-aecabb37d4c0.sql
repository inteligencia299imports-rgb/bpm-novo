-- Corrige notify_role/notify_consulta apos a troca de app_role/user_roles.
-- notify_role foi derrubada em cascata (parametro tipado como app_role, tipo
-- recriado na migration anterior). notify_consulta sobreviveu mas referenciava
-- user_roles.recebe_notif_consulta, coluna que nao existe na nova tabela
-- user_roles (nao especificada pelo usuario) - passa a notificar todos os
-- masters ativos do projeto BPM.

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
  if not (public.has_app_role(auth.uid(), 'master') or public.has_app_role(auth.uid(), 'gerente')) then
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

create or replace function public.notify_consulta(
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
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.notifications (user_id, title, message, entity_id, entity_type)
  select ur.user_id, _title, _message, _entity_id, _entity_type
  from public.user_roles ur
  where ur.app_role = 'master'
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
end;
$function$;
