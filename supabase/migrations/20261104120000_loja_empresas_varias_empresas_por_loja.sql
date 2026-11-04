-- Uma loja pode faturar por mais de uma empresa (pedido do usuário, 2026-11-04):
-- as lojas 299i, 299s e Aventura (MMATOS) passam a vender também as seminovas
-- da FAG — a moto que entra na troca da FAG continua na FAG, sem NF-e de
-- transferência pra MMATOS.
--
-- Até aqui a chave primária era (loja, sistema): uma empresa por loja. Todas as
-- FKs apontam pra loja_empresas.id, então a chave passa a ser o id, com
-- (loja, sistema, empresa_id) único. `padrao` marca a empresa sugerida quando a
-- loja é escolhida (o atendimento da 299i continua abrindo na MMATOS); só uma
-- padrão por loja/sistema.
--
-- PASSO 1 (antes do deploy do front): estrutura. Não muda nada para o front atual.
alter table public.loja_empresas add column if not exists padrao boolean not null default true;

-- loja_empresas_id_key (unique em id) fica: as FKs dependem dele.
alter table public.loja_empresas drop constraint if exists loja_empresas_pkey;
alter table public.loja_empresas add constraint loja_empresas_pkey primary key (id);
create unique index if not exists loja_empresas_loja_sistema_empresa_key
  on public.loja_empresas (loja, sistema, empresa_id);
create unique index if not exists loja_empresas_loja_sistema_padrao_key
  on public.loja_empresas (loja, sistema) where padrao;

-- PASSO 2 (só depois do front novo no ar — o front antigo mapeia loja -> uma
-- única empresa pelo nome e passaria a abrir atendimento da 299i na FAG):
--
-- insert into public.loja_empresas (loja, sistema, empresa_id, ativo, vende, padrao, restrito_master)
-- select l.loja, 'motos', '30496c3b-721f-4795-98fd-2785d3821f3b', true, true, false, false
--   from (values ('299i'), ('299s'), ('Aventura')) as l(loja)
--  where not exists (
--    select 1 from public.loja_empresas x
--     where x.loja = l.loja and x.sistema = 'motos'
--       and x.empresa_id = '30496c3b-721f-4795-98fd-2785d3821f3b'
--  );
