-- Sexo do cliente padronizado em minúsculo: 'masculino' / 'feminino'.
-- Havia três formatos no mesmo campo (achado 2026-10-09): 'masculino' (crm-novo,
-- sisfin, ofc), 'Masculino' (bpm-novo) e 'M'/'F' (importação de backup de
-- 02/09/2026). Decisão do usuário: tudo minúsculo. A trigger garante o formato
-- em qualquer gravação, de qualquer sistema ou importação.

create or replace function public.normaliza_sexo_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  s text := lower(trim(coalesce(new.sexo, '')));
begin
  new.sexo := case
    when s = '' then null
    when s like 'm%' then 'masculino'
    when s like 'f%' then 'feminino'
    else s
  end;
  return new;
end;
$$;

drop trigger if exists trg_normaliza_sexo_cliente on public.clientes_fornecedores;
create trigger trg_normaliza_sexo_cliente
  before insert or update of sexo on public.clientes_fornecedores
  for each row execute function public.normaliza_sexo_cliente();

-- Registros existentes.
update public.clientes_fornecedores
   set sexo = case
     when lower(trim(sexo)) like 'm%' then 'masculino'
     when lower(trim(sexo)) like 'f%' then 'feminino'
     when trim(sexo) = '' then null
     else lower(trim(sexo))
   end
 where sexo is not null and sexo not in ('masculino', 'feminino');
