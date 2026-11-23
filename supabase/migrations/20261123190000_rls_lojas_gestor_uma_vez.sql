-- Lentidão do Showroom (2026-11-23): as políticas de RLS chamavam
-- has_master_or_gerente_empresa(auth.uid(), loja_id) LINHA A LINHA. Desde os perfis
-- Avaliador/Administrativo (2026-11-22) cada chamada faz 4 consultas de perfil + 1 de loja:
-- ~0,25 ms por linha, ~600 ms só para ler atendimentos_motos como gerente.
--
-- Agora a política calcula UMA VEZ por consulta (subselect sem referência à linha = InitPlan):
--   master?                       -> (select has_app_role(auth.uid(), 'master'))
--   lojas de gerente/aval./adm.   -> (select bpm_lojas_gestor(auth.uid()))
-- Mesma regra de antes: master vê tudo; gerente/avaliador/administrativo veem as lojas
-- das empresas dele (user_empresas -> loja_empresas).

-- 1. Lojas visíveis para gerente/avaliador/administrativo (vazio para os demais perfis).
create or replace function public.bpm_lojas_gestor(_user_id uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $function$
  select coalesce(array_agg(distinct le.id), '{}'::uuid[])
    from public.user_roles ur
    join public.user_empresas ue on ue.user_id = ur.user_id
    join public.loja_empresas le on le.empresa_id = ue.empresa_id
   where ur.user_id = _user_id
     and ur.ativo
     and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
     and ur.app_role in ('gerente', 'avaliador', 'administrativo')
$function$;

grant execute on function public.bpm_lojas_gestor(uuid) to authenticated, service_role;

-- 2. A função antiga continua (usada por outras funções), agora com uma consulta só.
create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from public.user_roles ur
     where ur.user_id = _user_id and ur.ativo
       and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
       and (ur.app_role = 'master'
         or (ur.app_role in ('gerente', 'avaliador', 'administrativo')
             and exists (select 1 from public.user_empresas ue
                           join public.loja_empresas le on le.empresa_id = ue.empresa_id
                          where ue.user_id = _user_id and le.id = _loja_id))))
$function$;

-- 3. Políticas: troca a chamada linha a linha pela versão calculada uma vez.
do $$
declare
  p record;
  padrao constant text := 'has_master_or_gerente_empresa\(auth\.uid\(\), (a\.loja_id|loja_id|\(loja_id\)::uuid)\)';
  troca  constant text := '(COALESCE(((SELECT public.has_app_role(auth.uid(), ''master''::public.app_role)) OR (\1 = ANY ((SELECT public.bpm_lojas_gestor(auth.uid()))::uuid[]))), false))';
  novo_using text;
  novo_check text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where coalesce(qual, '') || coalesce(with_check, '') like '%has_master_or_gerente_empresa(auth.uid(), %'
  loop
    novo_using := regexp_replace(p.qual, padrao, troca, 'g');
    novo_check := regexp_replace(p.with_check, padrao, troca, 'g');
    if novo_using is not null and novo_using is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, novo_using);
    end if;
    if novo_check is not null and novo_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, novo_check);
    end if;
    n := n + 1;
  end loop;
  raise notice 'políticas ajustadas: %', n;
end $$;
