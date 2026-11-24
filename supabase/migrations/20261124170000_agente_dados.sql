-- Agente de dados (WhatsApp do número do Cérebro): só CONSULTA no DB 299.
--
-- Segurança em camadas, no banco (não depende do modelo de IA):
--   1. Dois papéis sem login: agente_leitura (todos) e agente_rh (+ salários/folha). Têm só SELECT.
--   2. As consultas rodam em funções SECURITY DEFINER desses papéis (schema "agente"), em transação
--      somente leitura (INSERT/UPDATE/DELETE/DDL/SELECT FOR UPDATE são recusados pelo Postgres),
--      com tempo limite, uma consulta por vez (sem ";") e teto de linhas.
--   3. Tokens, senhas e acessos ficam fora até do agente_rh (privilégio por coluna).
--   4. Só a service_role (função do agente) executa as consultas; anon/authenticated não.
--   5. Usuários autorizados (agente_dados_usuarios) e registro de tudo (agente_dados_log).

-- ---------------------------------------------------------------- papéis
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agente_leitura') then
    create role agente_leitura nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agente_rh') then
    create role agente_rh nologin bypassrls;
  end if;
end $$;
grant agente_leitura to postgres;
grant agente_rh to postgres;

create schema if not exists agente;
revoke all on schema agente from public;
grant usage, create on schema agente to agente_leitura, agente_rh;
grant usage on schema agente to service_role;

grant usage on schema public to agente_leitura, agente_rh;
grant select on all tables in schema public to agente_leitura, agente_rh;

-- Backups de manutenção (bkp_*) fora: só confundem as respostas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'bkp\_%' loop
    execute format('revoke select on public.%I from agente_leitura, agente_rh', t);
  end loop;
end $$;

-- Tokens, senhas e acessos: fora para os dois papéis.
revoke select on public.empresas_focus_config from agente_leitura, agente_rh;
do $$
declare
  alvo record;
  cols text;
begin
  for alvo in
    select * from (values ('tb_usuarios_cashback', array['senha']), ('envios_contracheque_hcm', array['webhook_response'])) v(tabela, fora)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = alvo.tabela and column_name <> all (alvo.fora);
    execute format('revoke select on public.%I from agente_leitura, agente_rh', alvo.tabela);
    execute format('grant select (%s) on public.%I to agente_leitura, agente_rh', cols, alvo.tabela);
  end loop;
end $$;

-- Salários e folha: só o agente_rh.
do $$
declare
  t text;
  cols text;
begin
  foreach t in array array['folhas_fechamento_hcm', 'folha_pdf_anexos_hcm', 'envios_contracheque_hcm', 'folhas_processadas_hcm',
                           'rubricas_financeiras_hcm', 'comissoes_hcm', 'emprestimos_hcm', 'descontos_autorizados_hcm'] loop
    execute format('revoke select on public.%I from agente_leitura', t);
  end loop;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'funcionarios_hcm' and column_name <> 'salario_base';
  execute 'revoke select on public.funcionarios_hcm from agente_leitura';
  execute format('grant select (%s) on public.funcionarios_hcm to agente_leitura', cols);
end $$;
-- (envios_contracheque_hcm já ficou sem webhook_response para o agente_rh no bloco anterior.)

-- Schemas internos nunca: auth, vault, storage, net, cron, supabase_functions (não há grant; reforço).
do $$
declare s text;
begin
  foreach s in array array['auth', 'vault', 'storage', 'net', 'cron', 'supabase_functions', 'extensions', 'graphql'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      execute format('revoke all on schema %I from agente_leitura, agente_rh', s);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- funções de consulta
-- Uma consulta SELECT/WITH por vez, somente leitura, 25 s no máximo, até 2.001 linhas (a 2.001ª só
-- indica que passou do teto). Devolve jsonb (lista de linhas).
create or replace function agente.consultar_leitura(_q text)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '25s'
as $$
declare
  q text := regexp_replace(btrim(coalesce(_q, '')), ';\s*$', '');
  r jsonb;
begin
  if q = '' or length(q) > 20000 then raise exception 'Consulta vazia ou longa demais.'; end if;
  if position(';' in q) > 0 then raise exception 'Apenas uma consulta por vez.'; end if;
  if q !~* '^\s*(select|with)\M' then raise exception 'Apenas consultas de leitura (SELECT).'; end if;
  perform set_config('transaction_read_only', 'on', true);
  execute format(E'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s\n) _q limit 2001) t', q) into r;
  return r;
end;
$$;

create or replace function agente.consultar_rh(_q text)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '25s'
as $$
declare
  q text := regexp_replace(btrim(coalesce(_q, '')), ';\s*$', '');
  r jsonb;
begin
  if q = '' or length(q) > 20000 then raise exception 'Consulta vazia ou longa demais.'; end if;
  if position(';' in q) > 0 then raise exception 'Apenas uma consulta por vez.'; end if;
  if q !~* '^\s*(select|with)\M' then raise exception 'Apenas consultas de leitura (SELECT).'; end if;
  perform set_config('transaction_read_only', 'on', true);
  execute format(E'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s\n) _q limit 2001) t', q) into r;
  return r;
end;
$$;

alter function agente.consultar_leitura(text) owner to agente_leitura;
alter function agente.consultar_rh(text) owner to agente_rh;
revoke all on function agente.consultar_leitura(text) from public;
revoke all on function agente.consultar_rh(text) from public;
grant execute on function agente.consultar_leitura(text) to service_role;
grant execute on function agente.consultar_rh(text) to service_role;

-- Porta de entrada pela API (schema public), só para a service_role (função do agente).
create or replace function public.agente_consultar(_q text, _rh boolean default false)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select case when _rh then agente.consultar_rh(_q) else agente.consultar_leitura(_q) end;
$$;
revoke all on function public.agente_consultar(text, boolean) from public, anon, authenticated;
grant execute on function public.agente_consultar(text, boolean) to service_role;

-- ---------------------------------------------------------------- usuários, conversa e log
create table if not exists public.agente_dados_usuarios (
  chave_telefone text primary key,         -- nps_bot_chave_telefone (DDD + 8 dígitos)
  telefone text not null,
  nome text not null,
  rh boolean not null default false,       -- pode ver salários/folha
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.agente_dados_usuarios enable row level security;

-- Os usuários autorizados são cadastrados direto na tabela (dados pessoais: telefones não ficam no repositório).

-- Histórico curto da conversa (contexto das próximas perguntas).
create table if not exists public.agente_dados_mensagens (
  id bigint generated always as identity primary key,
  chave_telefone text not null,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists agente_dados_mensagens_tel on public.agente_dados_mensagens (chave_telefone, id desc);
alter table public.agente_dados_mensagens enable row level security;

-- Registro de cada pergunta: quem, o quê, as consultas feitas e o resultado.
create table if not exists public.agente_dados_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  chave_telefone text,
  nome text,
  tipo_entrada text,                       -- texto, audio, imagem, documento, botao
  pergunta text,
  resposta text,
  consultas jsonb not null default '[]'::jsonb,
  arquivos jsonb not null default '[]'::jsonb,
  erro text,
  tokens_entrada integer,
  tokens_saida integer,
  duracao_ms integer
);
create index if not exists agente_dados_log_data on public.agente_dados_log (created_at desc);
alter table public.agente_dados_log enable row level security;

-- O próprio agente não lê as tabelas dele (conversas e log de outros usuários).
revoke select on public.agente_dados_usuarios, public.agente_dados_mensagens, public.agente_dados_log from agente_leitura, agente_rh;
