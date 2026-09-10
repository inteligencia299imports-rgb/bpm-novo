-- E-mail de contato de clientes_fornecedores sempre em minúsculo, tanto na
-- inclusão quanto na edição (qualquer caminho: front, edge functions, SQL).
create or replace function public.clientes_fornecedores_email_lower()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_fornecedores_email_lower on public.clientes_fornecedores;
create trigger trg_clientes_fornecedores_email_lower
  before insert or update of email on public.clientes_fornecedores
  for each row
  execute function public.clientes_fornecedores_email_lower();

-- Backfill dos cadastros existentes.
update public.clientes_fornecedores
set email = lower(email)
where email is not null
  and email <> lower(email);
