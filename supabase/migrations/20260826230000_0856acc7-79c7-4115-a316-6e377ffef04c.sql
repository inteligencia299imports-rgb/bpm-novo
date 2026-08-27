-- loja_empresas tem chave primaria composta (loja, sistema), entao nao
-- pode ser referenciada por uma FK de uma unica coluna. Adiciona um id
-- substituto para servir de alvo de referencia (ex: user_roles.loja_id).

alter table public.loja_empresas
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.loja_empresas
  add constraint loja_empresas_id_key unique (id);
