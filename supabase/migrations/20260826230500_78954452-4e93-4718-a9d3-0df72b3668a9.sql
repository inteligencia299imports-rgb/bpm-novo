-- Troca user_roles.loja_principal (texto solto) por loja_id, referenciando
-- loja_empresas -- assim a loja principal do usuario passa pelo mesmo
-- caminho que resolve loja -> empresa para o resto do sistema.

alter table public.user_roles
  add column if not exists loja_id uuid references public.loja_empresas (id);

-- Preserva valores ja preenchidos em loja_principal, resolvendo contra
-- loja_empresas (sistema = 'motos', que e o unico sistema deste projeto).
update public.user_roles ur
set loja_id = le.id
from public.loja_empresas le
where le.loja = ur.loja_principal
  and le.sistema = 'motos'
  and ur.loja_principal is not null
  and ur.loja_id is null;

alter table public.user_roles
  drop column if exists loja_principal;
