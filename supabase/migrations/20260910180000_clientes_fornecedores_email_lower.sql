-- E-mail de clientes_fornecedores sempre em minúsculo (contato `email` e NF `email_nf`),
-- tanto na inclusão quanto na edição — qualquer caminho: front, edge functions, SQL.
create or replace function public.clientes_fornecedores_email_lower()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := lower(new.email);
  end if;
  if new.email_nf is not null then
    new.email_nf := lower(new.email_nf);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_fornecedores_email_lower on public.clientes_fornecedores;
create trigger trg_clientes_fornecedores_email_lower
  before insert or update of email, email_nf on public.clientes_fornecedores
  for each row
  execute function public.clientes_fornecedores_email_lower();

-- Backfill dos cadastros existentes.
update public.clientes_fornecedores
set email = lower(email)
where email is not null and email <> lower(email);

update public.clientes_fornecedores
set email_nf = lower(email_nf)
where email_nf is not null and email_nf <> lower(email_nf);
