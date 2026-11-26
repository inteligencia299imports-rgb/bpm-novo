-- Agente de dados: perfil de acesso por usuário (2026-11-27). Primeiro perfil: "vendedor" (BPM) —
-- só o que um vendedor vê. Bloqueia tabelas de compra/consignação/custos e esconde as colunas de
-- custo, valor de compra e valores de avaliação. Tudo no banco, no papel do usuário (o agente não
-- contorna). Depois de mudar o perfil de alguém: select agente.configurar_usuario('<chave_telefone>');

alter table public.agente_dados_usuarios add column if not exists perfil text check (perfil in ('vendedor'));

create table if not exists agente.restricao_perfil (
  perfil text not null,
  tabela text not null,
  coluna text,            -- null = tabela inteira bloqueada
  unique (perfil, tabela, coluna)
);
revoke all on agente.restricao_perfil from public;

insert into agente.restricao_perfil (perfil, tabela, coluna)
select 'vendedor', t, null from unnest(array['contratos_consignacao', 'contratos_consignante', 'consignacao_processos',
  'custos_operacionais', 'pos_compra_processos', 'consultas_veiculares']) t
union all
select 'vendedor', 'avaliacoes', c from unnest(array['menor_valor', 'maior_valor', 'quanto_pede', 'quanto_vende_errado',
  'avaliacao_consignacao', 'avaliacao_compra', 'previsao_custos_loja', 'previsao_custos_cliente', 'negociacao',
  'valor_fechamento', 'valor_quitacao', 'valor_consignacao_nota', 'valor_nf_entrada', 'observacao_avaliador',
  'aprovacao_observacao', 'quitacao_instituicao_id', 'codigo_seguranca_crv', 'crlv_url', 'atpv_url', 'procuracao_url',
  'resultado_consulta']) c
union all
select 'vendedor', 'estoque_motos_novas', c from unnest(array['valor_custo', 'numero_nf_entrada', 'nfe_item_id',
  'icms_st_bc_retido', 'icms_st_valor_substituto', 'icms_st_valor_retido']) c
union all
select 'vendedor', 'formas_pagamento_contrato', 'taxa_retorno_pct'
on conflict do nothing;

CREATE OR REPLACE FUNCTION agente.configurar_usuario(_chave text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  u record;
  papel text;
  fn text;
  ref text;
  t record;
  cols text;
  deps text;
  sql_visao text;
  -- HCM por departamento: tabela → filtro (o que não está aqui e é HCM pessoal fica fora).
  filtradas text[] := array['funcionarios_hcm', 'pontos', 'folhas_ponto_hcm', 'advertencias_hcm', 'documentos_hcm',
                            'solicitacoes_atestado_hcm', 'solicitacoes_ferias_hcm', 'comissoes_hcm', 'emprestimos_hcm',
                            'descontos_autorizados_hcm', 'envios_contracheque_hcm', 'folhas_fechamento_hcm'];
  fora_por_departamento text[] := array['folha_pdf_anexos_hcm', 'folhas_processadas_hcm', 'logs_sistema_hcm'];
begin
  select * into u from public.agente_dados_usuarios where chave_telefone = _chave;
  if not found then raise exception 'Usuário % não cadastrado no agente.', _chave; end if;
  papel := 'agente_u_' || regexp_replace(_chave, '\D', '', 'g');
  fn := 'consultar_' || papel;

  -- Recria do zero (idempotente).
  execute format('drop schema if exists %I cascade', papel);
  if exists (select 1 from pg_roles where rolname = papel) then
    execute format('drop owned by %I', papel);
    execute format('drop role %I', papel);
  end if;
  if u.sistemas is null then
    return format('%s: acesso a todos os sistemas (sem papel próprio).', u.nome);
  end if;

  execute format('create role %I nologin bypassrls', papel);
  execute format('grant %I to postgres', papel);
  execute format('grant usage, create on schema agente to %I', papel);
  execute format('grant usage on schema public to %I', papel);
  ref := case when u.rh then 'agente_rh' else 'agente_leitura' end;

  -- Tabelas dos sistemas liberados (mesmas restrições de coluna do papel de referência).
  for t in
    select ts.tabela
      from agente.tabela_sistema ts
      join pg_class c on c.relname = ts.tabela and c.relnamespace = 'public'::regnamespace
     where ts.sistema = any (u.sistemas || array['comum', 'nps'])
  loop
    if u.hcm_so_departamentos and (t.tabela = any (filtradas) or t.tabela = any (fora_por_departamento)) then
      continue;
    end if;
    -- Perfil (ex.: vendedor): tabela inteira bloqueada ou colunas a esconder (agente.restricao_perfil).
    if u.perfil is not null and exists (select 1 from agente.restricao_perfil r
                                          where r.perfil = u.perfil and r.tabela = t.tabela and r.coluna is null) then
      continue;
    end if;
    if has_table_privilege(ref, format('public.%I', t.tabela), 'select')
       and not exists (select 1 from agente.restricao_perfil r where r.perfil = u.perfil and r.tabela = t.tabela) then
      execute format('grant select on public.%I to %I', t.tabela, papel);
    else
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
        from pg_attribute a
       where a.attrelid = format('public.%I', t.tabela)::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege(ref, a.attrelid, a.attnum, 'select')
         and not exists (select 1 from agente.restricao_perfil r
                          where r.perfil = u.perfil and r.tabela = t.tabela and r.coluna = a.attname);
      if cols is not null then
        execute format('grant select (%s) on public.%I to %I', cols, t.tabela, papel);
      end if;
    end if;
  end loop;

  -- HCM só dos departamentos que a pessoa gere no HCM: visões com o mesmo nome num schema do papel
  -- (vêm antes de public no search_path da consulta). Inclui salários e folha desses departamentos.
  if u.hcm_so_departamentos then
    execute format('create schema %I', papel);
    execute format('grant usage on schema %I to %I', papel, papel);
    deps := format('(select d.nome from public.departamentos_hcm d join public.user_departamento_hcm ud on ud.departamento_id = d.id where ud.id_user_roles = %L::uuid)', u.user_roles_id);
    for t in
      select ts.tabela
        from agente.tabela_sistema ts
       where ts.tabela = any (filtradas) and ts.sistema = any (u.sistemas)
         and to_regclass(format('public.%I', ts.tabela)) is not null
    loop
      if t.tabela = 'funcionarios_hcm' then
        sql_visao := format('select * from public.funcionarios_hcm where departamento in %s', deps);
      elsif t.tabela = 'pontos' then
        sql_visao := format('select * from public.pontos where user_id in (select f.usuario_id from public.funcionarios_hcm f where f.departamento in %s)', deps);
      else
        select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
          from pg_attribute a
         where a.attrelid = format('public.%I', t.tabela)::regclass and a.attnum > 0 and not a.attisdropped
           and a.attname <> 'webhook_response';
        sql_visao := format('select %s from public.%I where funcionario_id in (select f.id from public.funcionarios_hcm f where f.departamento in %s)', cols, t.tabela, deps);
      end if;
      execute format('create view %I.%I with (security_barrier) as %s', papel, t.tabela, sql_visao);
      execute format('grant select on %I.%I to %I', papel, t.tabela, papel);
    end loop;
  end if;

  -- Função de consulta do papel (mesmas travas das demais: só SELECT, somente leitura, 25 s, 2.001 linhas).
  execute format($f$
    create function agente.%I(_q text)
    returns jsonb
    language plpgsql
    security definer
    set search_path = %I, public
    set statement_timeout = '25s'
    as $b$
    declare
      q text := regexp_replace(btrim(coalesce(_q, '')), ';\s*$', '');
      r jsonb;
    begin
      if q = '' or length(q) > 20000 then raise exception 'Consulta vazia ou longa demais.'; end if;
      if position(';' in q) > 0 then raise exception 'Apenas uma consulta por vez.'; end if;
      if q !~* '^\s*(select|with)\M' then raise exception 'Apenas consultas de leitura (SELECT).'; end if;
      perform set_config('transaction_read_only', 'on', true);
      execute format(E'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%%s\n) _q limit 2001) t', q) into r;
      return r;
    end;
    $b$
  $f$, fn, papel);
  execute format('alter function agente.%I(text) owner to %I', fn, papel);
  execute format('revoke all on function agente.%I(text) from public', fn);
  execute format('grant execute on function agente.%I(text) to service_role', fn);

  return format('%s: sistemas %s%s.', u.nome, array_to_string(u.sistemas, ', '),
    case when u.hcm_so_departamentos then ' (HCM só dos departamentos que gere)' else '' end);
end;
$function$;

-- Daniel (vendedor, só BPM).
insert into public.agente_dados_usuarios (chave_telefone, telefone, nome, rh, ativo, alertas, sistemas, hcm_so_departamentos, perfil)
values ('6196462857', '5561996462857', 'Daniel', false, true, false, array['bpm'], false, 'vendedor')
on conflict (chave_telefone) do update set ativo = true, sistemas = excluded.sistemas, rh = false, perfil = excluded.perfil;
select agente.configurar_usuario('6196462857');
