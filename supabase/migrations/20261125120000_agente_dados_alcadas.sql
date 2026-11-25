-- Agente de dados: alçadas por usuário (quais sistemas cada um consulta) e HCM por departamento.
--
-- agente_dados_usuarios.sistemas = null  → acesso a todos os sistemas (papéis agente_leitura / agente_rh, como antes).
-- agente_dados_usuarios.sistemas = {...} → papel próprio (agente_u_<telefone>) com SELECT só nas tabelas desses
--   sistemas + "comum" + "nps" (NPS liberado para todos). Tabela não classificada = só acesso total.
-- hcm_so_departamentos = true → funcionários, ponto, folha, salários, comissões etc. só dos departamentos
--   que a pessoa gere no HCM (user_departamento_hcm de user_roles_id), por visões filtradas num schema
--   próprio. A tabela original fica sem acesso para esse papel. Sem departamento vinculado = nenhum registro.
-- Tudo no banco: o agente não consegue contornar (a consulta roda com o papel do usuário).
-- Depois de mudar sistemas/departamentos de alguém: select agente.configurar_usuario('<chave_telefone>');

alter table public.agente_dados_usuarios
  add column if not exists sistemas text[],
  add column if not exists hcm_so_departamentos boolean not null default false,
  add column if not exists user_roles_id uuid;

-- ---------------------------------------------------------------- tabelas por sistema
create table if not exists agente.tabela_sistema (
  tabela text primary key,
  sistema text not null check (sistema in ('comum', 'nps', 'bpm', 'crm', 'ofc', 'sisfin', 'mini', 'hcm', 'ponto'))
);
revoke all on agente.tabela_sistema from public;

insert into agente.tabela_sistema (tabela, sistema)
select t, s from (values
  ('comum', array['empresas', 'empresas_grupo_regional', 'loja_empresas', 'user_roles', 'user_empresas', 'clientes_fornecedores',
                  'clientes_fornecedores_documentos', 'clientes_fornecedores_enderecos', 'municipios_ibge', 'ramos_atividade',
                  'formas_pagamento', 'projetos']),
  ('nps', array['nps_bot_conversas', 'nps_bot_destinatarios', 'nps_bot_lojas', 'nps_bot_mensagens', 'nps_bot_notificacoes',
                'nps_bot_optout', 'respostas_nps', 'respostas_nps_backup', 'vw_envio_nps', 'vw_nps', 'vw_nps_backup', 'vw_nps_bot_fila']),
  ('bpm', array['agregados_motos', 'atendimentos_motos', 'avaliacoes', 'consignacao_processos', 'consultas_veiculares', 'contratos',
                'contratos_agregados', 'contratos_consignacao', 'contratos_consignante', 'custos_operacionais', 'estoque_motos',
                'estoque_motos_novas', 'formas_pagamento_contrato', 'marcas_motos', 'modelos_motos', 'moto_fotos', 'motos_interesse',
                'observacoes_preparacao', 'pos_compra_processos', 'pos_venda_processos', 'renave_chamadas', 'site_motos',
                'site_motos_base', 'site_motos_dados', 'site_motos_fotos', 'site_motos_publicas', 'status_history']),
  ('crm', array['atendimento_equipamentos', 'atendimento_equipamentos_itens', 'cores_equipamentos', 'estoque_equipamentos',
                'estoque_equipamentos_eventos', 'itens_equipamentos', 'marcas_equipamentos', 'modelos_equipamentos',
                'tamanhos_equipamentos', 'tipos_equipamentos', 'transferencias_estoque_equipamentos', 'status_history_equipamentos',
                'devolucoes_venda', 'devolucoes_venda_itens', 'kits_composicao', 'garantia', 'estoque_eventos', 'estoque_movimentacoes',
                'tb_cashback', 'tb_cashback_creditos', 'tb_vendas_cashback', 'vw_cashback_extrato', 'vw_tb_vendas_cashback_dedup',
                'vw_vendas_cashback']),
  ('ofc', array['atendimento_servicos', 'atendimento_servicos_checklist_recepcao', 'atendimento_servicos_itens',
                'atendimento_servicos_pecas_pendentes', 'custos_oficina', 'devolucoes_pecas', 'devolucoes_pecas_itens', 'estoque_pecas',
                'estoque_pecas_lotes', 'estoque_pecas_movimentos', 'garantias_fornecedor', 'item_pecas', 'marca_pecas', 'kits_servicos',
                'kits_servicos_produtos', 'kits_servicos_servicos', 'os_checklist_finalizacao', 'os_execucao_intervalos',
                'os_executor_trocas', 'requisicoes_pecas', 'requisicoes_pecas_baixas', 'requisicoes_pecas_itens', 'servicos', 'tipo_os',
                'transferencias_estoque_pecas', 'valor_hora_concessionaria', 'status_history_servicos', 'veiculos', 'veiculo_historico',
                'veiculo_revisoes', 'vw_veiculos_km_atual', 'revisao_planos', 'vw_plano_revisoes_alvo']),
  ('sisfin', array['centros_custo', 'cfops', 'compromissos', 'compromissos_parcelas', 'conciliacoes', 'contas_bancarias',
                   'extrato_lancamentos', 'formas_pagamento_instituicoes', 'icms_uf', 'icms_uf_ncm', 'naturezas_operacao',
                   'naturezas_operacao_regras', 'naturezas_operacao_regras_fiscais', 'nfe_entradas', 'nfe_itens', 'nfe_recebidas',
                   'nfe_recebidas_manifestacoes', 'notas_fiscais', 'notas_fiscais_cartas_correcao', 'notas_fiscais_difal_anexos',
                   'operacoes_fiscais', 'plano_contas', 'sped_arquivos_externos', 'status_history_compromissos', 'status_history_depositos',
                   'pedidos_compra', 'pedido_compra_itens', 'pedido_compra_pagamentos_previstos', 'produto_fornecedor',
                   'status_history_pedidos']),
  ('mini', array['alugueis_mini', 'alugueis_produtos_mini', 'cupons_mini', 'modelos_mini', 'pacotes_mini', 'pacotes_produtos_mini',
                 'planos_mini', 'produtos_mini', 'vendas_produtos_mini', 'status_history_mini', 'caixa_sessoes', 'sangrias_caixa']),
  ('hcm', array['advertencias_hcm', 'configuracoes_sistema_hcm', 'departamentos_hcm', 'documentos_hcm', 'logs_sistema_hcm',
                'parametros_ciclo_hcm', 'solicitacoes_atestado_hcm', 'solicitacoes_ferias_hcm', 'user_departamento_hcm', 'usuarios_hcm',
                'funcionarios_hcm', 'comissoes_hcm', 'emprestimos_hcm', 'descontos_autorizados_hcm', 'envios_contracheque_hcm',
                'folhas_fechamento_hcm', 'rubricas_financeiras_hcm', 'folha_pdf_anexos_hcm', 'folhas_processadas_hcm']),
  ('ponto', array['folhas_ponto_hcm', 'pontos'])
) v(s, ts), unnest(v.ts) t
on conflict (tabela) do update set sistema = excluded.sistema;

-- ---------------------------------------------------------------- papel de cada usuário
create or replace function agente.configurar_usuario(_chave text)
returns text
language plpgsql
set search_path = public
as $fn$
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
    if has_table_privilege(ref, format('public.%I', t.tabela), 'select') then
      execute format('grant select on public.%I to %I', t.tabela, papel);
    else
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
        from pg_attribute a
       where a.attrelid = format('public.%I', t.tabela)::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege(ref, a.attrelid, a.attnum, 'select');
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
$fn$;
revoke all on function agente.configurar_usuario(text) from public;

-- ---------------------------------------------------------------- porta de entrada (com a alçada do usuário)
drop function if exists public.agente_consultar(text, boolean);
create or replace function public.agente_consultar(_q text, _rh boolean default false, _chave text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  u record;
  fn text;
  r jsonb;
begin
  if _chave is not null then
    select sistemas into u from public.agente_dados_usuarios where chave_telefone = _chave and ativo;
    if not found then raise exception 'Usuário sem acesso.'; end if;
    if u.sistemas is not null then
      fn := 'consultar_agente_u_' || regexp_replace(_chave, '\D', '', 'g');
      if to_regprocedure(format('agente.%I(text)', fn)) is null then raise exception 'Perfil de acesso não configurado.'; end if;
      execute format('select agente.%I($1)', fn) using _q into r;
      return r;
    end if;
  end if;
  return case when _rh then agente.consultar_rh(_q) else agente.consultar_leitura(_q) end;
end;
$$;
revoke all on function public.agente_consultar(text, boolean, text) from public, anon, authenticated;
grant execute on function public.agente_consultar(text, boolean, text) to service_role;
