-- ===================================================================
-- PORT: modulo BPM (motos) -> banco de producao compartilhado gnpkkgygjfxlipqbtybg
-- Gerado de homolog frvclkoljxovzsrnjtlt em 2026-08-31T02:48:17.596Z
-- REVISAR antes de aplicar. Roda inteiro em UMA transacao.
-- formas_pagamento_contrato (formas de pgto do contrato): OFF -- nao portada nesta rodada
-- ===================================================================
begin;
set local check_function_bodies = off;
set local statement_timeout = 0;

-- ------------------------------------------------------------------
-- 1. Funcoes ausentes em producao
-- ------------------------------------------------------------------
-- atendimento_has_avaliacao(_atendimento_id uuid)
CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao(_atendimento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.avaliacoes WHERE atendimento_id = _atendimento_id);
$function$;

-- atendimento_has_avaliacao_preparacao(_atendimento_id uuid)
CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao_preparacao(_atendimento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.avaliacoes
    WHERE atendimento_id = _atendimento_id
      AND situacao IN ('adquirida','estoque')
  );
$function$;

-- current_app_role(_user_id uuid)
CREATE OR REPLACE FUNCTION public.current_app_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ur.app_role from public.user_roles ur
  where ur.user_id = _user_id
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  limit 1
$function$;

-- delete_atendimento_cascade(_atendimento_id uuid)
CREATE OR REPLACE FUNCTION public.delete_atendimento_cascade(_atendimento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
  _loja_id uuid;
BEGIN
  SELECT loja_id INTO _loja_id FROM public.atendimentos_motos WHERE id = _atendimento_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja_id) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  SELECT array_agg(id) INTO _avaliacao_ids FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _contrato_consignante_ids FROM public.contratos_consignante WHERE atendimento_id = _atendimento_id;

  IF _contrato_consignante_ids IS NOT NULL THEN
    DELETE FROM public.custos_operacionais WHERE contrato_consignante_id = ANY(_contrato_consignante_ids);
  END IF;

  IF _avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque_motos SET avaliacao_id = NULL WHERE avaliacao_id = ANY(_avaliacao_ids);
  END IF;
  UPDATE public.estoque_motos SET atendimento_venda_id = NULL WHERE atendimento_venda_id = _atendimento_id;

  DELETE FROM public.respostas_nps WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.notifications WHERE entity_id = _atendimento_id;

  DELETE FROM public.observacoes WHERE id_operacao = _atendimento_id;

  DELETE FROM public.status_history WHERE entity_id = _atendimento_id;
  IF _avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.status_history WHERE entity_id = ANY(_avaliacao_ids);

    DELETE FROM public.notifications WHERE entity_id = ANY(_avaliacao_ids);
  END IF;

  DELETE FROM public.atendimentos_motos WHERE id = _atendimento_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'delete_atendimento_cascade falhou: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END;
$function$;

-- delete_avaliacao_cascade(_avaliacao_id uuid)
CREATE OR REPLACE FUNCTION public.delete_avaliacao_cascade(_avaliacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _atendimento_id uuid;
  _contrato_ids uuid[];
  _loja_id uuid;
BEGIN
  SELECT a.loja_id, av.atendimento_id INTO _loja_id, _atendimento_id
  FROM public.avaliacoes av JOIN public.atendimentos_motos a ON a.id = av.atendimento_id
  WHERE av.id = _avaliacao_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja_id) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  DELETE FROM public.contratos_consignacao WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.estoque_motos WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.status_history WHERE entity_id = _avaliacao_id AND entity_type IN ('avaliacao', 'consulta', 'consignacao');
  DELETE FROM public.moto_fotos WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.avaliacoes WHERE id = _avaliacao_id;

  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;
  IF _contrato_ids IS NOT NULL THEN
    NULL; -- formas_pagamento_contrato OFF
  END IF;
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');
  DELETE FROM public.atendimentos_motos WHERE id = _atendimento_id;
END;
$function$;

-- has_app_role(_user_id uuid, _role app_role)
CREATE OR REPLACE FUNCTION public.has_app_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and ativo
      and app_role = _role
      and projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac'
  )
$function$;

-- has_master_or_gerente_empresa(_user_id uuid, _loja text)
CREATE OR REPLACE FUNCTION public.has_master_or_gerente_empresa(_user_id uuid, _loja text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_app_role(_user_id, 'master')
    or (public.has_app_role(_user_id, 'gerente') and public.user_has_empresa(_user_id, _loja))
$function$;

-- has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
CREATE OR REPLACE FUNCTION public.has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_app_role(_user_id, 'master')
    or (public.has_app_role(_user_id, 'gerente') and exists (select 1 from public.user_empresas ue join public.loja_empresas le on le.empresa_id = ue.empresa_id where ue.user_id = _user_id and le.id = _loja_id))
$function$;

-- next_report_cycle(_start date)
CREATE OR REPLACE FUNCTION public.next_report_cycle(_start date)
 RETURNS TABLE(cycle_start date, cycle_end date, next_start date)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    _start,
    CASE
      WHEN _start >= DATE '2026-07-01' THEN (date_trunc('month', _start)::date + interval '1 month' - interval '1 day')::date
      WHEN _start =  DATE '2026-05-21' THEN DATE '2026-06-30'
      ELSE (_start + interval '1 month' - interval '1 day')::date
    END,
    CASE
      WHEN _start >= DATE '2026-07-01' THEN (date_trunc('month', _start)::date + interval '1 month')::date
      WHEN _start =  DATE '2026-05-21' THEN DATE '2026-07-01'
      ELSE (_start + interval '1 month')::date
    END;
$function$;

-- norm_loja(_loja text)
CREATE OR REPLACE FUNCTION public.norm_loja(_loja text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN upper(_loja) LIKE '%DUCATI%' THEN 'Ducati' ELSE '299' END;
$function$;

-- notify_consulta(_title text, _message text, _entity_id uuid, _entity_type text)
CREATE OR REPLACE FUNCTION public.notify_consulta(_title text, _message text, _entity_id uuid DEFAULT NULL::uuid, _entity_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.notifications (user_id, title, message, entity_id, entity_type)
  select ur.user_id, _title, _message, _entity_id, _entity_type
  from public.user_roles ur
  where ur.app_role = 'master'
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
end;
$function$;

-- notify_role(_role app_role, _title text, _message text, _entity_id uuid, _entity_type text)
CREATE OR REPLACE FUNCTION public.notify_role(_role app_role, _title text, _message text, _entity_id uuid DEFAULT NULL::uuid, _entity_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_app_role(auth.uid(), 'master') or public.has_app_role(auth.uid(), 'gerente')) then
    raise exception 'Unauthorized';
  end if;

  insert into public.notifications (user_id, title, message, entity_id, entity_type)
  select ur.user_id, _title, _message, _entity_id, _entity_type
  from public.user_roles ur
  where ur.app_role = _role
    and ur.ativo
    and ur.projeto_id = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
end;
$function$;

-- relatorio_avaliacoes_avaliadores(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_avaliadores(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v record;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := 'todos'; END IF;
  FOR v IN
    SELECT DISTINCT av.avaliador_id, ur.nome
    FROM avaliacoes av LEFT JOIN user_roles ur ON ur.user_id = av.avaliador_id
    WHERE av.avaliador_id IS NOT NULL
  LOOP
    DECLARE v_avaliacoes bigint; v_aq_trocar bigint; v_aq_vender bigint; v_aq_propria bigint; v_aq_consignada bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.avaliador_id = v.avaliador_id AND av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND (_date_from IS NULL OR av.created_at >= _date_from) AND (_date_to IS NULL OR av.created_at <= _date_to);
      WITH base AS (
        SELECT av.id, av.tipo_aquisicao, a.interesse,
          COALESCE((SELECT MIN(sh.created_at) FROM status_history sh WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'), av.updated_at, av.created_at) AS data_aq
        FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
        WHERE av.avaliador_id = v.avaliador_id AND av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
      ), filt AS (SELECT * FROM base WHERE (_date_from IS NULL OR data_aq >= _date_from) AND (_date_to IS NULL OR data_aq <= _date_to))
      SELECT COUNT(*) FILTER (WHERE interesse = 'trocar'), COUNT(*) FILTER (WHERE interesse = 'vender'),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aq_trocar, v_aq_vender, v_aq_propria, v_aq_consignada FROM filt;
      IF v_avaliacoes > 0 OR (COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0)) > 0 THEN
        result := result || jsonb_build_object('nome', COALESCE(v.nome,'-'), 'avaliacoes', v_avaliacoes, 'aqTrocar', COALESCE(v_aq_trocar,0), 'aqVender', COALESCE(v_aq_vender,0), 'aqPropria', COALESCE(v_aq_propria,0), 'aqConsignada', COALESCE(v_aq_consignada,0), 'total', COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0), 'conversao', CASE WHEN v_avaliacoes > 0 THEN round((COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0))::numeric / v_avaliacoes, 4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_avaliacoes_kpis(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_loja text := lower(trim(coalesce(_loja, '')));
  v_result json;
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := NULL; END IF;

  WITH base AS (
    SELECT
      av.id,
      CASE
        WHEN coalesce(translate(lower(trim(av.tipo_aquisicao)),
                                'áàâãäéèêëíìîïóòôõöúùûüç',
                                'aaaaaeeeeiiiiooooouuuuc'), '') IN ('', 'propria')
          THEN 'propria'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('consignada','consignacao','consignado')
          THEN 'consignada'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('convertida','convertido')
          THEN 'convertida'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('test-ride','test ride','testride')
          THEN 'test-ride'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') = 'repasse'
          THEN 'repasse'
        ELSE 'propria'
      END AS tipo_norm,
      av.situacao,
      av.created_at,
      av.updated_at,
      a.interesse,
      COALESCE(
        (SELECT MIN(sh.created_at) FROM status_history sh
          WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
        av.updated_at, av.created_at
      ) AS data_aquisicao
    FROM avaliacoes av
    JOIN atendimentos_motos a ON a.id = av.atendimento_id
    JOIN loja_empresas le ON le.id = a.loja_id
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND (v_loja IS NULL OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
  ),
  filtrado_avaliacoes AS (
    SELECT * FROM base
    WHERE (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to   IS NULL OR created_at <= _date_to)
  ),
  filtrado_aquisicoes AS (
    SELECT * FROM base
    WHERE situacao = 'adquirida'
      AND (_date_from IS NULL OR data_aquisicao >= _date_from)
      AND (_date_to   IS NULL OR data_aquisicao <= _date_to)
  )
  SELECT json_build_object(
    'total_avaliacoes',       (SELECT COUNT(*) FROM filtrado_avaliacoes),
    'total_aquisicoes',       (SELECT COUNT(*) FROM filtrado_aquisicoes),
    'aquisicoes_propria',     (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm IN ('propria','convertida','repasse','test-ride')),
    'aquisicoes_consignada',  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm = 'consignada'),
    'aquisicoes_convertida',  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm = 'convertida'),
    'entrada_direta',         (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'vender'),
    'troca',                  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'trocar'),
    'retiradas',              (SELECT COUNT(*) FROM filtrado_avaliacoes WHERE situacao = 'retirada')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- relatorio_avaliacoes_kpis_comparado(_date_from timestamp with time zone, _date_to timestamp with time zone, _prev_from timestamp with time zone, _prev_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis_comparado(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_avaliacoes_kpis(_date_from, _date_to, _loja)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_avaliacoes_kpis(_prev_from, _prev_to, _loja)::jsonb)),
           '{}'::jsonb)
       END;
$function$;

-- relatorio_avaliacoes_mensal(_loja text)
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_mensal(_loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := 'todos'; END IF;
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := v_cs_d::timestamptz;
    v_cycle_end := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_avaliacoes bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint; v_neg_trocar bigint; v_neg_vender bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      WITH base AS (
        SELECT av.id, av.tipo_aquisicao,
          COALESCE((SELECT MIN(sh.created_at) FROM status_history sh WHERE sh.entity_id = av.id AND sh.entity_type='avaliacao' AND sh.status='adquirida'), av.updated_at, av.created_at) AS data_aq
        FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
        WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
      ) SELECT COUNT(*), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aquisicoes, v_proprias, v_consignadas FROM base WHERE data_aq >= v_cycle_start AND data_aq <= v_cycle_end;
      SELECT count(*) FILTER (WHERE a.interesse='trocar'), count(*) FILTER (WHERE a.interesse='vender') INTO v_neg_trocar, v_neg_vender
      FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      result := result || jsonb_build_object('label', v_label, 'mes', v_label, 'avaliacoes', v_avaliacoes, 'aquisicoes', v_aquisicoes, 'proprias', v_proprias, 'consignadas', v_consignadas, 'negTrocar', v_neg_trocar, 'negVender', v_neg_vender);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_avaliacoes_por_avaliador(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_por_avaliador(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH v_loja AS (
    SELECT lower(trim(coalesce(_loja, 'todos'))) AS l
  ),
  base AS (
    SELECT av.id, av.avaliador_id, av.tipo_aquisicao, av.created_at, av.updated_at, a.interesse,
      COALESCE((SELECT MIN(sh.created_at) FROM status_history sh
                WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
               av.updated_at, av.created_at) AS data_aq
    FROM avaliacoes av
    JOIN atendimentos_motos a ON a.id = av.atendimento_id
    JOIN loja_empresas le ON le.id = a.loja_id
    CROSS JOIN v_loja
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND av.avaliador_id IS NOT NULL
      AND (v_loja.l IN ('', 'todos')
           OR norm_loja(le.loja) = norm_loja(v_loja.l)
           OR lower(le.loja) = v_loja.l)
  ),
  aval_periodo AS (
    SELECT avaliador_id, COUNT(*) AS avaliacoes
    FROM base
    WHERE (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to IS NULL OR created_at <= _date_to)
    GROUP BY avaliador_id
  ),
  aq_periodo AS (
    SELECT avaliador_id,
      COUNT(*) FILTER (WHERE interesse = 'trocar') AS aqTrocar,
      COUNT(*) FILTER (WHERE interesse = 'vender') AS aqVender,
      COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')) AS aqPropria,
      COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação')) AS aqConsignada
    FROM base
    WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
      AND (_date_from IS NULL OR data_aq >= _date_from)
      AND (_date_to IS NULL OR data_aq <= _date_to)
    GROUP BY avaliador_id
  ),
  merged AS (
    SELECT COALESCE(a.avaliador_id, q.avaliador_id) AS avaliador_id,
      COALESCE(a.avaliacoes, 0) AS avaliacoes,
      COALESCE(q.aqTrocar, 0) AS aqTrocar,
      COALESCE(q.aqVender, 0) AS aqVender,
      COALESCE(q.aqPropria, 0) AS aqPropria,
      COALESCE(q.aqConsignada, 0) AS aqConsignada
    FROM aval_periodo a
    FULL OUTER JOIN aq_periodo q ON q.avaliador_id = a.avaliador_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'avaliador_id', avaliador_id,
    'avaliacoes', avaliacoes,
    'aqTrocar', aqTrocar,
    'aqVender', aqVender,
    'aqPropria', aqPropria,
    'aqConsignada', aqConsignada
  )), '[]'::jsonb) FROM merged;
$function$;

-- relatorio_estoque_kpis()
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN (
    WITH active AS (
      SELECT * FROM estoque WHERE status IN ('disponivel','indisponivel','servico','bloqueio_juridico')
    ),
    stats AS (
      SELECT
        count(*) as total,
        COALESCE(SUM(preco), 0) as soma_total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='indisponivel') as qtd_indisponivel,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='indisponivel'), 0) as soma_indisponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='indisponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='indisponivel')) ELSE 0 END as media_dias_indisponivel,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes
      WHERE situacao IN ('adquirida','estoque')
        AND COALESCE(preparacao_status, 'em_aberto') IN ('em_aberto','pendente','oficina','servico_externo','aguardando_aceite','aguardando_liberacao_estoque')
    )
    SELECT jsonb_build_object(
      'total', s.total,
      'mediaDias', s.media_dias,
      'somaTotal', round(s.soma_total,2),
      'disponivel', jsonb_build_object('qtd', s.qtd_disponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_disponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_disponivel,2), 'mediaDias', s.media_dias_disponivel),
      'bloqueio', jsonb_build_object('qtd', s.qtd_bloqueio, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_bloqueio::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_bloqueio,2), 'mediaDias', s.media_dias_bloqueio),
      'indisponivel', jsonb_build_object('qtd', s.qtd_indisponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_indisponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_indisponivel,2), 'mediaDias', s.media_dias_indisponivel),
      'servico', jsonb_build_object('qtd', s.qtd_servico, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_servico::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_servico,2), 'mediaDias', s.media_dias_servico),
      'qtdPreparacao', p.qtd,
      'somaQuantoPede', round(p.soma_quanto_pede,2),
      'mediaDiasPrep', p.media_dias,
      'patrimonioDisponivel', round(s.soma_disponivel,2),
      'patrimonioParado', round(s.soma_bloqueio + s.soma_indisponivel + s.soma_servico,2)
    )
    FROM stats s, prep p
  );
END;
$function$;

-- relatorio_estoque_kpis(p_cutoff timestamp with time zone)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis(p_cutoff timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
BEGIN
  RETURN (
    WITH active AS (
      SELECT *
      FROM estoque
      WHERE status IN ('disponivel','indisponivel','servico','bloqueio_juridico')
        AND data_entrada <= v_cutoff
        AND (data_venda IS NULL OR data_venda > v_cutoff)
    ),
    stats AS (
      SELECT
        count(*) as total,
        COALESCE(SUM(preco), 0) as soma_total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='indisponivel') as qtd_indisponivel,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='indisponivel'), 0) as soma_indisponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='indisponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='indisponivel')) ELSE 0 END as media_dias_indisponivel,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM now() - created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes
      WHERE situacao IN ('adquirida','estoque')
        AND COALESCE(preparacao_status, 'em_aberto') IN (
          'em_aberto','pendente','oficina','servico_externo',
          'aguardando_aceite','aguardando_liberacao_estoque'
        )
    )
    SELECT jsonb_build_object(
      'total', s.total,
      'mediaDias', s.media_dias,
      'somaTotal', round(s.soma_total,2),
      'disponivel', jsonb_build_object('qtd', s.qtd_disponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_disponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_disponivel,2), 'mediaDias', s.media_dias_disponivel),
      'bloqueio', jsonb_build_object('qtd', s.qtd_bloqueio, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_bloqueio::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_bloqueio,2), 'mediaDias', s.media_dias_bloqueio),
      'indisponivel', jsonb_build_object('qtd', s.qtd_indisponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_indisponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_indisponivel,2), 'mediaDias', s.media_dias_indisponivel),
      'servico', jsonb_build_object('qtd', s.qtd_servico, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_servico::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_servico,2), 'mediaDias', s.media_dias_servico),
      'qtdPreparacao', p.qtd,
      'somaQuantoPede', round(p.soma_quanto_pede,2),
      'mediaDiasPrep', p.media_dias,
      'patrimonioDisponivel', round(s.soma_disponivel,2),
      'patrimonioParado', round(s.soma_bloqueio + s.soma_indisponivel + s.soma_servico,2)
    )
    FROM stats s, prep p
  );
END;
$function$;

-- relatorio_estoque_kpis(p_cutoff timestamp with time zone, p_loja text, p_tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis(p_cutoff timestamp with time zone DEFAULT now(), p_loja text DEFAULT 'todos'::text, p_tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_loja   text := COALESCE(NULLIF(trim(p_loja), ''), 'todos');
  v_tipo   text := COALESCE(NULLIF(trim(p_tipo), ''), 'todos');
BEGIN
  RETURN (
    WITH active AS (
      SELECT *
      FROM estoque
      WHERE status IN ('disponivel','servico','indisponivel_manual','bloqueio_juridico')
        AND data_entrada <= v_cutoff
        AND (data_venda IS NULL OR data_venda > v_cutoff)
        AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
        AND (
          v_loja = 'todos'
          OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
          OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
          OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
          OR lower(coalesce(loja,'')) = lower(v_loja)
        )
    ),
    stats AS (
      SELECT
        count(*) as total,
        COALESCE(SUM(preco), 0) as soma_total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        count(*) FILTER (WHERE status='indisponivel_manual') as qtd_indisponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='indisponivel_manual'), 0) as soma_indisponivel,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico,
        CASE WHEN count(*) FILTER (WHERE status='indisponivel_manual') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='indisponivel_manual')) ELSE 0 END as media_dias_indisponivel
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes
      WHERE situacao IN ('adquirida','estoque')
        AND COALESCE(preparacao_status, 'em_aberto') IN ('em_aberto','pendente','oficina','servico_externo')
    )
    SELECT jsonb_build_object(
      'total', stats.total,
      'somaTotal', stats.soma_total,
      'mediaDias', stats.media_dias,
      'disponivel', jsonb_build_object(
        'qtd', stats.qtd_disponivel,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_disponivel::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_disponivel,
        'mediaDias', stats.media_dias_disponivel
      ),
      'bloqueio', jsonb_build_object(
        'qtd', stats.qtd_bloqueio,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_bloqueio::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_bloqueio,
        'mediaDias', stats.media_dias_bloqueio
      ),
      'servico', jsonb_build_object(
        'qtd', stats.qtd_servico,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_servico::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_servico,
        'mediaDias', stats.media_dias_servico
      ),
      'indisponivel', jsonb_build_object(
        'qtd', stats.qtd_indisponivel,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_indisponivel::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_indisponivel,
        'mediaDias', stats.media_dias_indisponivel
      ),
      'qtdPreparacao', prep.qtd,
      'somaQuantoPede', prep.soma_quanto_pede,
      'mediaDiasPrep', prep.media_dias,
      'patrimonioDisponivel', stats.soma_disponivel,
      'patrimonioParado', stats.soma_bloqueio + stats.soma_servico + stats.soma_indisponivel
    )
    FROM stats, prep
  );
END;
$function$;

-- relatorio_estoque_kpis_comparado(p_cutoff timestamp with time zone, p_prev_cutoff timestamp with time zone, p_loja text, p_tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis_comparado(p_cutoff timestamp with time zone, p_prev_cutoff timestamp with time zone DEFAULT NULL::timestamp with time zone, p_loja text DEFAULT 'todos'::text, p_tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_estoque_kpis(p_cutoff, p_loja, p_tipo)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN p_prev_cutoff IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_estoque_kpis(p_prev_cutoff, p_loja, p_tipo)::jsonb)),
           '{}'::jsonb)
       END;
$function$;

-- relatorio_estoque_mensal()
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque WHERE data_entrada >= v_cs AND data_entrada <= v_ce;
      SELECT count(*) INTO v_saidas FROM estoque WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce;
      SELECT count(*) INTO v_disponiveis FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      SELECT COALESCE(SUM(preco), 0) INTO v_patrimonio FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      result := result || jsonb_build_object(
        'label', v_label, 'entradas', v_entradas, 'saidas', v_saidas, 'disponiveis', v_disponiveis,
        'giro', CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END,
        'patrimonioDisp', round(v_patrimonio, 2));
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_estoque_mensal(p_cutoff timestamp with time zone)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_cutoff::date LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    EXIT WHEN v_ce > v_cutoff;
    v_label := to_char(v_ce_d, 'DD/MM');
    DECLARE v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque WHERE data_entrada >= v_cs AND data_entrada <= v_ce;
      SELECT count(*) INTO v_saidas FROM estoque WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce;
      SELECT count(*) INTO v_disponiveis FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      SELECT COALESCE(SUM(preco), 0) INTO v_patrimonio FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      result := result || jsonb_build_object(
        'label', v_label, 'entradas', v_entradas, 'saidas', v_saidas, 'disponiveis', v_disponiveis,
        'giro', CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END,
        'patrimonioDisp', round(v_patrimonio, 2));
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_estoque_mensal(p_cutoff timestamp with time zone, p_loja text, p_tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamp with time zone DEFAULT now(), p_loja text DEFAULT 'todos'::text, p_tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today      timestamptz := COALESCE(p_cutoff, now());
  v_loja       text := COALESCE(NULLIF(trim(p_loja), ''), 'todos');
  v_tipo       text := COALESCE(NULLIF(trim(p_tipo), ''), 'todos');
  v_start      date := '2025-12-21';
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz;
  v_entradas int; v_saidas int; v_estoque int; v_apenas_disp int;
  v_patrimonio numeric; v_giro numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  WHILE v_start <= v_today::date LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := v_cs_d::timestamptz;
    v_cycle_end := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds';
    EXIT WHEN v_cycle_end >= v_today;

    SELECT count(*) INTO v_entradas FROM estoque
    WHERE data_entrada >= v_cycle_start AND data_entrada <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    SELECT count(*) INTO v_saidas FROM estoque
    WHERE data_venda IS NOT NULL AND data_venda >= v_cycle_start AND data_venda <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    SELECT count(*), COALESCE(SUM(preco), 0), count(*) FILTER (WHERE status = 'disponivel')
    INTO v_estoque, v_patrimonio, v_apenas_disp
    FROM estoque
    WHERE status IN ('disponivel','servico','indisponivel_manual','bloqueio_juridico')
      AND data_entrada <= v_cycle_end AND (data_venda IS NULL OR data_venda > v_cycle_end)
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    v_giro := CASE WHEN v_estoque > 0 THEN round((v_saidas::numeric / v_estoque) * 100, 1) ELSE 0 END;

    v_result := v_result || jsonb_build_object(
      'label', to_char(v_ce_d, 'DD/MM'),
      'entradas', v_entradas, 'saidas', v_saidas,
      'disponiveis', v_estoque, 'apenasDisponiveis', v_apenas_disp,
      'patrimonioDisp', v_patrimonio, 'giro', v_giro);

    v_start := v_next;
  END LOOP;
  RETURN v_result;
END;
$function$;

-- relatorio_showroom_kpis(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_kpis(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_qtd_atendimentos bigint; v_qtd_vendas bigint; v_qtd_sinais bigint;
  v_faturamento_previsto numeric := 0; v_faturamento_realizado numeric := 0;
  v_margem_prevista numeric := 0; v_margem_realizada numeric := 0; v_total_quanto_vende numeric := 0; rec record;
BEGIN
  SELECT count(*) INTO v_qtd_atendimentos FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
  WHERE (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
    AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_qtd_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id = a.id
  WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
    AND e.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
    AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to);
  SELECT count(*) INTO v_qtd_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.situacao = 'sinal' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja);
  FOR rec IN SELECT a.id as atend_id, e.id as estoque_id, e.preco as estoque_preco, e.valor_venda as estoque_valor_venda, e.tipo as estoque_tipo, av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
    FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id = a.id LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
      AND e.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
      AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to)
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_preco_estoque numeric := COALESCE(rec.estoque_preco, 0); v_valor_venda_real numeric := COALESCE(rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric; v_custo_oficina_loja_prev numeric; v_custo_processo_loja numeric; v_custo_prev_cliente numeric; v_custo_real_cliente numeric; v_custo_op_loja numeric; v_fat_real numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
      ELSE v_custo_oficina_loja_exec := 0; v_custo_oficina_loja_prev := 0; v_custo_processo_loja := 0; v_custo_prev_cliente := 0; v_custo_real_cliente := 0;
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel)='loja';
      v_faturamento_previsto := v_faturamento_previsto + v_quanto_vende; v_total_quanto_vende := v_total_quanto_vende + v_quanto_vende;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_faturamento_realizado := v_faturamento_realizado + v_fat_real;
      v_margem_prevista := v_margem_prevista + (v_quanto_vende - v_valor_fechamento);
      v_margem_realizada := v_margem_realizada + (v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja));
    END;
  END LOOP;
  RETURN jsonb_build_object('qtdAtendimentos', v_qtd_atendimentos, 'qtdVendas', v_qtd_vendas, 'qtdSinais', v_qtd_sinais,
    'taxaConversao', CASE WHEN v_qtd_atendimentos > 0 THEN round((v_qtd_vendas::numeric / v_qtd_atendimentos), 4) ELSE 0 END,
    'faturamentoPrevisto', round(v_faturamento_previsto,2), 'faturamentoRealizado', round(v_faturamento_realizado,2),
    'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_total_quanto_vende > 0 THEN round(v_margem_prevista / v_total_quanto_vende, 4) ELSE 0 END,
    'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_faturamento_realizado > 0 THEN round(v_margem_realizada / v_faturamento_realizado, 4) ELSE 0 END);
END;
$function$;

-- relatorio_showroom_kpis_comparado(_date_from timestamp with time zone, _date_to timestamp with time zone, _prev_from timestamp with time zone, _prev_to timestamp with time zone, _loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_kpis_comparado(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_showroom_kpis(_date_from, _date_to, _loja, _tipo)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_showroom_kpis(_prev_from, _prev_to, _loja, _tipo)::jsonb)),
           '{}'::jsonb)
       END;
$function$;

-- relatorio_showroom_mensal(_loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_mensal(_loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := (v_cs_d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
    v_cycle_end := ((v_ce_d::timestamp + interval '23 hours 59 minutes 59 seconds 999 milliseconds') AT TIME ZONE 'America/Sao_Paulo');
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');

    DECLARE
      v_atend bigint; v_vendas bigint;
      v_faturamento numeric := 0; v_faturamento_real numeric := 0;
      v_margem_prevista numeric := 0; v_margem_realizada numeric := 0;
      v_total_qv numeric := 0; rec record;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
      WHERE (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
        AND a.created_at >= v_cycle_start AND a.created_at <= v_cycle_end;

      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
        AND e.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
        AND e.data_venda >= v_cycle_start AND e.data_venda <= v_cycle_end;

      FOR rec IN
        SELECT a.id as atend_id, e.preco, e.valor_venda as estoque_valor_venda,
               av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
        FROM atendimentos_motos a
        JOIN loja_empresas le ON le.id = a.loja_id
        JOIN estoque e ON e.atendimento_venda_id = a.id
        LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
        WHERE a.situacao = 'vendido'
          AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
          AND e.data_venda IS NOT NULL
          AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
          AND e.data_venda >= v_cycle_start AND e.data_venda <= v_cycle_end
      LOOP
        DECLARE
          vvr numeric := COALESCE(rec.estoque_valor_venda, rec.preco, 0);
          qv numeric := COALESCE(rec.quanto_vende, 0);
          vf numeric := COALESCE(rec.valor_fechamento, 0);
          cole numeric; colp numeric; cpl numeric; cpc numeric; crc numeric; cop numeric; fr numeric;
        BEGIN
          IF rec.avaliacao_id IS NOT NULL THEN
            SELECT COALESCE(SUM(valor_executado), 0) INTO cole FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO colp FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpl FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
            SELECT COALESCE(SUM(valor_executado), 0) INTO crc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
          ELSE cole := 0; colp := 0; cpl := 0; cpc := 0; crc := 0;
          END IF;
          SELECT COALESCE(SUM(co.valor), 0) INTO cop FROM custos_operacionais co
          JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
          WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel) = 'loja';
          v_faturamento := v_faturamento + vvr;
          v_total_qv := v_total_qv + qv;
          v_margem_prevista := v_margem_prevista + (qv - vf);
          fr := vvr + (cpc - crc) + (colp - cole);
          v_faturamento_real := v_faturamento_real + fr;
          v_margem_realizada := v_margem_realizada + (fr - (vf + 445 + cole + cpl + cop));
        END;
      END LOOP;

      result := result || jsonb_build_object(
        'label', v_label,
        'atendimentos', v_atend,
        'vendas', v_vendas,
        'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END,
        'faturamento', round(v_faturamento, 2),
        'pctMargemPrevista', CASE WHEN v_total_qv > 0 THEN round(v_margem_prevista / v_total_qv, 4) ELSE 0 END,
        'pctMargemRealizada', CASE WHEN v_faturamento_real > 0 THEN round(v_margem_realizada / v_faturamento_real, 4) ELSE 0 END
      );
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_showroom_sinais(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_sinais(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; rec record;
BEGIN
  FOR rec IN
    SELECT a.nome_cliente, le.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa,'-') as placa, a.created_at as data_sinal,
      av.quanto_vende, av.valor_fechamento, av.avaliacao_compra, av.avaliacao_consignacao,
      c.valor_fechamento as contrato_valor_fechamento, cc.valor_fechamento as consignante_valor_fechamento,
      e.valor_venda as estoque_valor_venda, e.preco as estoque_preco, e.preco_acao as estoque_preco_acao,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM (
      SELECT am.*, cf.nome_razao_social as nome_cliente
      FROM atendimentos_motos am
      LEFT JOIN clientes_fornecedores cf ON cf.id = am.cliente_id
    ) a
    JOIN loja_empresas le ON le.id = a.loja_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo, mi2.estoque_moto_id FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id ORDER BY (mi2.estoque_moto_id IS NOT NULL) DESC, mi2.created_at ASC LIMIT 1) mi ON true
    LEFT JOIN LATERAL (SELECT e2.* FROM estoque e2 WHERE e2.atendimento_venda_id = a.id
      ORDER BY e2.updated_at DESC NULLS LAST, e2.created_at DESC NULLS LAST LIMIT 1) e ON true
    LEFT JOIN LATERAL (SELECT av2.* FROM avaliacoes av2 WHERE av2.id = e.avaliacao_id
      ORDER BY av2.updated_at DESC NULLS LAST, av2.created_at DESC NULLS LAST LIMIT 1) av ON true
    LEFT JOIN contratos c ON c.atendimento_id = a.id
    LEFT JOIN contratos_consignante cc ON cc.atendimento_id = a.id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    WHERE a.situacao = 'sinal'
      AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
      AND (_tipo = 'todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
    ORDER BY a.created_at DESC
  LOOP
    DECLARE v_tipo text := COALESCE(rec.tipo,'propria');
      v_quanto_vende numeric := COALESCE(NULLIF(rec.quanto_vende,0), NULLIF(rec.estoque_preco_acao,0), NULLIF(rec.estoque_preco,0), NULLIF(rec.estoque_valor_venda,0), 0);
      v_valor_fechamento numeric := COALESCE(NULLIF(rec.valor_fechamento,0), NULLIF(rec.consignante_valor_fechamento,0), NULLIF(rec.contrato_valor_fechamento,0), CASE WHEN v_tipo='consignada' THEN NULLIF(rec.avaliacao_consignacao,0) ELSE NULLIF(rec.avaliacao_compra,0) END, 0);
      v_valor_venda_real numeric := COALESCE(rec.estoque_valor_venda, rec.estoque_preco_acao, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0; v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0; v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric; v_abatimentos numeric; v_margem_realizada numeric; v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc2 ON cc2.id = co.contrato_consignante_id WHERE cc2.atendimento_id = rec.atendimento_id AND lower(co.responsavel)='loja';
      v_taxa_fixa := CASE WHEN v_tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object('nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome,'-'), 'loja', rec.loja, 'tipo', v_tipo, 'modelo', rec.modelo, 'placa', COALESCE(rec.placa,'-'), 'dataSinal', rec.data_sinal, 'quantoVende', round(v_quanto_vende,2), 'valorFechamento', round(v_valor_fechamento,2), 'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_quanto_vende>0 THEN round(v_margem_prevista/v_quanto_vende,4) ELSE 0 END, 'valorVenda', round(v_valor_venda_real,2), 'margemOficina', round(v_margem_oficina,2), 'abatimentos', round(v_abatimentos,2), 'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_fat_real>0 THEN round(v_margem_realizada/v_fat_real,4) ELSE 0 END);
    END;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_showroom_vendedores(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendedores(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint; v_faturamento numeric := 0;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id = v.user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND e.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
      SELECT COALESCE(SUM(COALESCE(e.valor_venda, e.preco, 0)),0) INTO v_faturamento FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND e.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END, 'faturamento', round(v_faturamento,2));
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_showroom_vendidas(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text, _tipo text)
CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendidas(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; rec record;
BEGIN
  FOR rec IN
    SELECT a.nome_cliente, le.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa,'-') as placa, e.data_venda as data_venda,
      av.quanto_vende, av.valor_fechamento, e.valor_venda as estoque_valor_venda, e.preco as estoque_preco,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM (
      SELECT am.*, cf.nome_razao_social as nome_cliente
      FROM atendimentos_motos am
      LEFT JOIN clientes_fornecedores cf ON cf.id = am.cliente_id
    ) a
    JOIN loja_empresas le ON le.id = a.loja_id
    LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id LIMIT 1) mi ON true
    WHERE a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja)
      AND e.data_venda IS NOT NULL
      AND (_tipo='todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
      AND (_date_from IS NULL OR e.data_venda >= _date_from)
      AND (_date_to IS NULL OR e.data_venda <= _date_to)
    ORDER BY e.data_venda DESC
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende,0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento,0);
      v_valor_venda_real numeric := COALESCE(rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0; v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0; v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric; v_abatimentos numeric; v_margem_realizada numeric; v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel)='loja';
      v_taxa_fixa := CASE WHEN rec.tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object('nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome,'-'), 'loja', rec.loja, 'tipo', rec.tipo, 'modelo', rec.modelo, 'placa', rec.placa, 'dataVenda', rec.data_venda, 'quantoVende', round(v_quanto_vende,2), 'valorFechamento', round(v_valor_fechamento,2), 'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_quanto_vende>0 THEN round(v_margem_prevista/v_quanto_vende,4) ELSE 0 END, 'valorVenda', round(v_valor_venda_real,2), 'margemOficina', round(v_margem_oficina,2), 'abatimentos', round(v_abatimentos,2), 'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_fat_real>0 THEN round(v_margem_realizada/v_fat_real,4) ELSE 0 END);
    END;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_vendedor_equipe(_date_from timestamp with time zone, _date_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_equipe(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND e.data_venda IS NOT NULL AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

-- relatorio_vendedor_kpis(_user_id uuid, _date_from timestamp with time zone, _date_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_kpis(_user_id uuid, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
BEGIN
  SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND e.data_venda IS NOT NULL AND (_date_from IS NULL OR e.data_venda >= _date_from) AND (_date_to IS NULL OR e.data_venda <= _date_to);
  SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
  RETURN jsonb_build_object('qtdAtendimentos', v_atend, 'qtdVendas', v_vendas, 'qtdSinais', v_sinais, 'taxaConversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
END;
$function$;

-- relatorio_vendedor_kpis_comparado(_user_id uuid, _date_from timestamp with time zone, _date_to timestamp with time zone, _prev_from timestamp with time zone, _prev_to timestamp with time zone, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_kpis_comparado(_user_id uuid, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _prev_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_vendedor_kpis(_user_id, _date_from, _date_to, _loja)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_vendedor_kpis(_user_id, _prev_from, _prev_to, _loja)::jsonb)),
           '{}'::jsonb)
       END;
$function$;

-- relatorio_vendedor_mensal(_user_id uuid, _loja text)
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_mensal(_user_id uuid, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_atend bigint; v_vendas bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.created_at >= v_cs AND a.created_at <= v_ce;
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND e.data_venda IS NOT NULL AND e.data_venda >= v_cs AND e.data_venda <= v_ce;
      result := result || jsonb_build_object('label', v_label, 'atendimentos', v_atend, 'vendas', v_vendas, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

-- update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

-- user_has_empresa(_user_id uuid, _loja text)
CREATE OR REPLACE FUNCTION public.user_has_empresa(_user_id uuid, _loja text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_empresas ue
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id = _user_id and e.nome = _loja
  )
$function$;

-- user_shares_empresa(_user_id uuid, _empresa_id uuid)
CREATE OR REPLACE FUNCTION public.user_shares_empresa(_user_id uuid, _empresa_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_empresas ue
    where ue.user_id = _user_id and ue.empresa_id = _empresa_id
  )
$function$;

-- users_share_any_empresa(_user_id_a uuid, _user_id_b uuid)
CREATE OR REPLACE FUNCTION public.users_share_any_empresa(_user_id_a uuid, _user_id_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_empresas ue1
    join public.user_empresas ue2 on ue2.empresa_id = ue1.empresa_id
    where ue1.user_id = _user_id_a and ue2.user_id = _user_id_b
  )
$function$;

-- ------------------------------------------------------------------
-- 2. Tabelas novas
-- ------------------------------------------------------------------
create table if not exists public.atendimentos_motos (
  id uuid not null default gen_random_uuid(),
  vendedor_id uuid not null,
  tipo_atendimento text not null,
  origem text,
  temperatura text,
  interesse text not null,
  situacao text not null default 'em_aberto'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  nps_status text not null default 'em_aberto'::text,
  nps_enviado_at timestamp with time zone,
  nps_respondido_at timestamp with time zone,
  pos_venda_status text not null default 'em_aberto'::text,
  intermediacao_parte1_status text not null default 'em_aberto'::text,
  intermediacao_parte2_status text not null default 'em_aberto'::text,
  cliente_id uuid not null,
  loja_id uuid not null,
  constraint atendimentos_pkey PRIMARY KEY (id),
  constraint atendimentos_interesse_check CHECK ((interesse = ANY (ARRAY['comprar'::text, 'vender'::text, 'trocar'::text]))),
  constraint atendimentos_situacao_check CHECK ((situacao = ANY (ARRAY['em_aberto'::text, 'pendente'::text, 'sinal'::text, 'perdido'::text, 'vendido'::text, 'dispensada'::text])))
);

create table if not exists public.avaliacoes (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  valor_fipe numeric,
  menor_valor numeric,
  maior_valor numeric,
  quanto_pede numeric,
  quanto_vende numeric,
  quanto_vende_errado numeric,
  avaliacao_consignacao numeric,
  avaliacao_compra numeric,
  previsao_custos_loja numeric,
  previsao_custos_cliente numeric,
  negociacao text,
  situacao text not null default 'sem_avaliar'::text,
  avaliador_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tipo_aquisicao text,
  valor_fechamento numeric,
  nps_status text not null default 'em_aberto'::text,
  nps_enviado_at timestamp with time zone,
  nps_respondido_at timestamp with time zone,
  pos_compra_status text not null default 'em_aberto'::text,
  consignacao_status text not null default 'em_aberto'::text,
  preparacao_status text not null default 'em_aberto'::text,
  classificacao text,
  trade_in numeric,
  marca text not null,
  modelo text not null,
  ano_fabricacao text,
  ano_modelo text,
  categoria text,
  cilindrada text,
  cor text,
  km text,
  placa text,
  tem_manual boolean,
  tem_chave_reserva boolean,
  manutencao_vencida boolean,
  crlv_url text,
  atpv_url text,
  procuracao_url text,
  consulta_realizada boolean,
  consulta_solicitada boolean,
  resultado_consulta text,
  enviada_avaliacao boolean,
  observacoes text,
  renavam text,
  chassi text,
  uf text,
  observacao_avaliador text,
  numero_crv text,
  aprovacao_status text,
  aprovacao_observacao text,
  aprovado_por uuid,
  aprovado_em timestamp with time zone,
  valor_quitacao numeric,
  valor_consignacao_nota numeric,
  constraint avaliacoes_pkey PRIMARY KEY (id),
  constraint avaliacoes_aprovacao_status_check CHECK ((aprovacao_status = ANY (ARRAY['aguardando'::text, 'aprovada'::text, 'recusada'::text]))),
  constraint avaliacoes_negociacao_check CHECK ((negociacao = ANY (ARRAY['compra'::text, 'consignacao'::text]))),
  constraint avaliacoes_situacao_check CHECK ((situacao = ANY (ARRAY['sem_avaliar'::text, 'em_aberto'::text, 'adquirida'::text, 'dispensada'::text, 'perdido'::text, 'estoque'::text])))
);

create table if not exists public.estoque_motos (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid,
  atendimento_venda_id uuid,
  preco_acao numeric,
  status text not null default 'disponivel'::text,
  observacoes text,
  data_venda timestamp with time zone,
  valor_venda numeric,
  valor_sinal numeric,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  loja_id text,
  moto_nova_id uuid,
  constraint estoque_pkey PRIMARY KEY (id),
  constraint estoque_motos_fonte_chk CHECK (((((avaliacao_id IS NOT NULL))::integer + ((moto_nova_id IS NOT NULL))::integer) = 1))
);

create table if not exists public.motos_interesse (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  origem text not null,
  marca text,
  modelo text,
  ano text,
  estoque_moto_id text,
  created_at timestamp with time zone not null default now(),
  chassi text,
  constraint motos_interesse_pkey PRIMARY KEY (id),
  constraint motos_interesse_origem_check CHECK ((origem = ANY (ARRAY['estoque'::text, 'externo'::text])))
);

create table if not exists public.motos_novas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid,
  loja_id text,
  marca text not null,
  modelo text not null,
  categoria text,
  cor text,
  cilindrada text,
  ano_fabricacao text,
  ano_modelo text,
  chassi text,
  renavam text,
  placa text,
  ncm text,
  valor numeric,
  valor_custo numeric,
  chave_nfe_origem text,
  origem_externa_id text,
  status text not null default 'disponivel'::text,
  observacoes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint motos_novas_pkey PRIMARY KEY (id)
);

create table if not exists public.moto_fotos (
  id uuid not null default gen_random_uuid(),
  tipo text not null,
  url text not null,
  created_at timestamp with time zone not null default now(),
  avaliacao_id uuid not null,
  constraint moto_fotos_pkey PRIMARY KEY (id)
);

create table if not exists public.contratos (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  cpf_cnpj text,
  ipva_tipo text,
  ipva_cotas text,
  ipva_valor numeric,
  transferencia_tipo text,
  transferencia_valor numeric,
  valor_quitacao numeric,
  valor_fechamento numeric,
  observacoes_internas text,
  observacoes_contrato text,
  data_sinal date,
  data_vencimento_sinal date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint contratos_pkey PRIMARY KEY (id)
);

create table if not exists public.contratos_consignacao (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid not null,
  cpf_cnpj text,
  email text,
  endereco text,
  cep text,
  valor_quitacao numeric,
  valor_fechamento numeric,
  observacoes_internas text,
  observacoes_contrato text,
  data_contrato date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint contratos_consignacao_pkey PRIMARY KEY (id)
);

create table if not exists public.contratos_consignante (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  nome_consignante text,
  telefone_consignante text,
  cpf_cnpj text,
  dados_bancarios text,
  titular_conta text,
  valor_fechamento numeric,
  valor_repasse numeric,
  observacoes_contrato text,
  observacoes_internas text,
  data_contrato date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint contratos_consignante_pkey PRIMARY KEY (id)
);

create table if not exists public.consignacao_processos (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid not null,
  etapa text not null,
  concluida boolean not null default false,
  data_conclusao timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint consignacao_processos_pkey PRIMARY KEY (id),
  constraint consignacao_processos_avaliacao_id_etapa_key UNIQUE (avaliacao_id, etapa)
);

create table if not exists public.pos_compra_processos (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid not null,
  etapa text not null,
  concluida boolean not null default false,
  data_conclusao timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  destino_transferencia text,
  constraint pos_compra_processos_pkey PRIMARY KEY (id),
  constraint pos_compra_processos_avaliacao_id_etapa_key UNIQUE (avaliacao_id, etapa),
  constraint pos_compra_processos_destino_transferencia_check CHECK (((destino_transferencia IS NULL) OR (destino_transferencia = ANY (ARRAY['loja'::text, 'novo_proprietario'::text]))))
);

create table if not exists public.pos_venda_processos (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  etapa text not null,
  concluida boolean not null default false,
  data_conclusao timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pos_venda_processos_pkey PRIMARY KEY (id),
  constraint pos_venda_processos_atendimento_etapa_unique UNIQUE (atendimento_id, etapa),
  constraint pos_venda_processos_atendimento_id_etapa_key UNIQUE (atendimento_id, etapa)
);

create table if not exists public.custos_oficina (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid not null,
  responsavel text not null,
  tipo text not null,
  valor_previsto numeric,
  valor_executado numeric,
  numero_os text,
  detalhes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint custos_oficina_pkey PRIMARY KEY (id)
);

create table if not exists public.custos_operacionais (
  id uuid not null default gen_random_uuid(),
  contrato_consignante_id uuid not null,
  tipo text not null,
  responsavel text not null,
  descricao text,
  valor numeric,
  created_at timestamp with time zone not null default now(),
  constraint custos_operacionais_pkey PRIMARY KEY (id)
);

create table if not exists public.consultas_veiculares (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid,
  usuario_id uuid not null,
  placa text not null,
  uf text,
  renavam text,
  fontes_consultadas jsonb not null default '{}'::jsonb,
  tempo_resposta_ms integer,
  resultado jsonb not null,
  correlation_id text,
  created_at timestamp with time zone not null default now(),
  constraint consultas_veiculares_pkey PRIMARY KEY (id)
);

create table if not exists public.respostas_nps (
  id uuid not null default gen_random_uuid(),
  atendimento_id uuid not null,
  data_resposta timestamp with time zone not null default now(),
  atendimento text,
  outros_setores text,
  produto text,
  experiencia text,
  nps text,
  melhorias text,
  espaco_livre text,
  origem text,
  created_at timestamp with time zone not null default now(),
  constraint respostas_nps_pkey PRIMARY KEY (id)
);

create table if not exists public.status_history (
  id uuid not null default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  status text not null,
  changed_by uuid,
  changed_by_name text,
  created_at timestamp with time zone not null default now(),
  observacoes text,
  constraint status_history_pkey PRIMARY KEY (id)
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  entity_id uuid,
  entity_type text,
  created_at timestamp with time zone not null default now(),
  constraint notifications_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------------
-- 3. Indices
-- ------------------------------------------------------------------
CREATE INDEX idx_estoque_motos_avaliacao ON public.estoque_motos USING btree (avaliacao_id);
CREATE INDEX idx_estoque_motos_atend_venda ON public.estoque_motos USING btree (atendimento_venda_id);
CREATE INDEX idx_estoque_motos_status ON public.estoque_motos USING btree (status);
CREATE INDEX idx_estoque_motos_moto_nova ON public.estoque_motos USING btree (moto_nova_id);
CREATE UNIQUE INDEX motos_novas_origem_externa_key ON public.motos_novas USING btree (origem_externa_id) WHERE (origem_externa_id IS NOT NULL);
CREATE INDEX idx_motos_novas_status ON public.motos_novas USING btree (status);
CREATE INDEX consultas_veiculares_avaliacao_id_idx ON public.consultas_veiculares USING btree (avaliacao_id, created_at DESC);
CREATE INDEX bpm_idx_status_history_entity ON public.status_history USING btree (entity_type, entity_id);

-- ------------------------------------------------------------------
-- 4. Foreign keys
-- ------------------------------------------------------------------
alter table public.atendimentos_motos add constraint atendimentos_motos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes_fornecedores(id);
alter table public.atendimentos_motos add constraint atendimentos_motos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES loja_empresas(id);
alter table public.atendimentos_motos add constraint atendimentos_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES auth.users(id);
alter table public.avaliacoes add constraint avaliacoes_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos_motos(id) ON DELETE CASCADE;
alter table public.avaliacoes add constraint avaliacoes_avaliador_id_fkey FOREIGN KEY (avaliador_id) REFERENCES auth.users(id);
alter table public.estoque_motos add constraint estoque_atendimento_venda_id_fkey FOREIGN KEY (atendimento_venda_id) REFERENCES atendimentos_motos(id) ON DELETE SET NULL;
alter table public.estoque_motos add constraint estoque_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE SET NULL;
alter table public.estoque_motos add constraint estoque_motos_moto_nova_id_fkey FOREIGN KEY (moto_nova_id) REFERENCES motos_novas(id) ON DELETE SET NULL;
alter table public.motos_interesse add constraint motos_interesse_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos_motos(id) ON DELETE CASCADE;
alter table public.motos_novas add constraint motos_novas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id);
alter table public.moto_fotos add constraint moto_fotos_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id);
alter table public.contratos add constraint contratos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos_motos(id) ON DELETE CASCADE;
alter table public.contratos_consignacao add constraint contratos_consignacao_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE CASCADE;
alter table public.contratos_consignante add constraint contratos_consignante_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos_motos(id) ON DELETE CASCADE;
alter table public.consignacao_processos add constraint consignacao_processos_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE CASCADE;
alter table public.pos_compra_processos add constraint pos_compra_processos_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE CASCADE;
alter table public.pos_venda_processos add constraint pos_venda_processos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos_motos(id) ON DELETE CASCADE;
alter table public.custos_oficina add constraint custos_oficina_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE CASCADE;
alter table public.custos_operacionais add constraint custos_operacionais_contrato_consignante_id_fkey FOREIGN KEY (contrato_consignante_id) REFERENCES contratos_consignante(id) ON DELETE CASCADE;
alter table public.consultas_veiculares add constraint consultas_veiculares_avaliacao_id_fkey FOREIGN KEY (avaliacao_id) REFERENCES avaliacoes(id) ON DELETE CASCADE;
alter table public.status_history add constraint status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 5. Triggers
-- ------------------------------------------------------------------
CREATE TRIGGER update_atendimentos_updated_at BEFORE UPDATE ON public.atendimentos_motos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_avaliacoes_updated_at BEFORE UPDATE ON public.avaliacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_estoque_updated_at BEFORE UPDATE ON public.estoque_motos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_motos_novas_upd BEFORE UPDATE ON public.motos_novas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER update_pos_venda_processos_updated_at BEFORE UPDATE ON public.pos_venda_processos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------
-- 6. RLS + policies
-- ------------------------------------------------------------------
alter table public.atendimentos_motos enable row level security;
create policy "Acesso atendimentos" on public.atendimentos_motos as permissive for select to authenticated
  using (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));
create policy "Deleta atendimentos" on public.atendimentos_motos as permissive for delete to authenticated
  using (has_master_or_gerente_empresa(auth.uid(), loja_id));
create policy "Edita atendimentos" on public.atendimentos_motos as permissive for update to authenticated
  using (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));
create policy "Vendedor cria atendimentos" on public.atendimentos_motos as permissive for insert to authenticated
  with check (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));
alter table public.avaliacoes enable row level security;
create policy "Acesso avaliacoes" on public.avaliacoes as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete avaliacoes" on public.avaliacoes as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert avaliacoes" on public.avaliacoes as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update avaliacoes" on public.avaliacoes as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.estoque_motos enable row level security;
create policy "Acesso estoque_motos" on public.estoque_motos as permissive for select to authenticated
  using ((has_app_role(auth.uid(), 'master'::app_role) OR ((loja_id IS NOT NULL) AND has_master_or_gerente_empresa(auth.uid(), (loja_id)::uuid)) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = estoque_motos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))));
create policy "Gerencia estoque_motos" on public.estoque_motos as permissive for all to authenticated
  using ((has_app_role(auth.uid(), 'master'::app_role) OR ((loja_id IS NOT NULL) AND has_master_or_gerente_empresa(auth.uid(), (loja_id)::uuid))))
  with check ((has_app_role(auth.uid(), 'master'::app_role) OR ((loja_id IS NOT NULL) AND has_master_or_gerente_empresa(auth.uid(), (loja_id)::uuid))));
create policy "Vendedor atualiza estoque_motos venda" on public.estoque_motos as permissive for update to authenticated
  using ((has_app_role(auth.uid(), 'vendedor'::app_role) AND (EXISTS ( SELECT 1
   FROM (motos_interesse mi
     JOIN atendimentos_motos a ON ((a.id = mi.atendimento_id)))
  WHERE ((mi.estoque_moto_id = (estoque_motos.id)::text) AND (a.vendedor_id = auth.uid()))))));
alter table public.motos_interesse enable row level security;
create policy "Acesso motos interesse" on public.motos_interesse as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete motos interesse" on public.motos_interesse as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert motos interesse" on public.motos_interesse as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update motos interesse" on public.motos_interesse as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.motos_novas enable row level security;
create policy "Leitura motos_novas" on public.motos_novas as permissive for select to authenticated
  using (true);
alter table public.moto_fotos enable row level security;
create policy "Acesso fotos" on public.moto_fotos as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete fotos" on public.moto_fotos as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert fotos" on public.moto_fotos as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.contratos enable row level security;
create policy "Acesso contratos" on public.contratos as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert contratos" on public.contratos as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update contratos" on public.contratos as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.contratos_consignacao enable row level security;
create policy "Acesso contratos_consignacao" on public.contratos_consignacao as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert contratos_consignacao" on public.contratos_consignacao as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update contratos_consignacao" on public.contratos_consignacao as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.contratos_consignante enable row level security;
create policy "Acesso contratos_consignante" on public.contratos_consignante as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert contratos_consignante" on public.contratos_consignante as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update contratos_consignante" on public.contratos_consignante as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.consignacao_processos enable row level security;
create policy "Acesso consignacao_processos" on public.consignacao_processos as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete consignacao_processos" on public.consignacao_processos as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert consignacao_processos" on public.consignacao_processos as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update consignacao_processos" on public.consignacao_processos as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.pos_compra_processos enable row level security;
create policy "Acesso pos_compra_processos" on public.pos_compra_processos as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert pos_compra_processos" on public.pos_compra_processos as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update pos_compra_processos" on public.pos_compra_processos as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.pos_venda_processos enable row level security;
create policy "Acesso pos_venda_processos" on public.pos_venda_processos as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert pos_venda_processos" on public.pos_venda_processos as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update pos_venda_processos" on public.pos_venda_processos as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.custos_oficina enable row level security;
create policy "Acesso custos_oficina" on public.custos_oficina as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete custos_oficina" on public.custos_oficina as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert custos_oficina" on public.custos_oficina as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update custos_oficina" on public.custos_oficina as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.custos_operacionais enable row level security;
create policy "Acesso custos_operacionais" on public.custos_operacionais as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete custos_operacionais" on public.custos_operacionais as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert custos_operacionais" on public.custos_operacionais as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update custos_operacionais" on public.custos_operacionais as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.consultas_veiculares enable row level security;
create policy "Acesso consultas_veiculares" on public.consultas_veiculares as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consultas_veiculares.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Insert consulta manual consultas_veiculares" on public.consultas_veiculares as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consultas_veiculares.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Update consultas_veiculares" on public.consultas_veiculares as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consultas_veiculares.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
alter table public.respostas_nps enable row level security;
create policy "Acesso respostas_nps" on public.respostas_nps as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));
create policy "Delete respostas_nps" on public.respostas_nps as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Insert respostas_nps" on public.respostas_nps as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
create policy "Update respostas_nps" on public.respostas_nps as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));
alter table public.status_history enable row level security;
create policy "Acesso status_history" on public.status_history as permissive for select to authenticated
  using (((changed_by = auth.uid()) OR has_app_role(auth.uid(), 'master'::app_role) OR ((entity_type = ANY (ARRAY['atendimento'::text, 'pos_venda'::text, 'intermediacao'::text])) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = status_history.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))) OR ((entity_type = ANY (ARRAY['avaliacao'::text, 'pos_compra'::text, 'consignacao'::text, 'preparacao'::text, 'showroom'::text, 'consulta'::text])) AND (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = status_history.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));
create policy "Users can insert own status history" on public.status_history as permissive for insert to authenticated
  with check ((changed_by = auth.uid()));
alter table public.notifications enable row level security;
create policy "Insert own notifications" on public.notifications as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "Users see own notifications" on public.notifications as permissive for select to authenticated
  using ((user_id = auth.uid()));
create policy "Users update own notifications" on public.notifications as permissive for update to authenticated
  using ((user_id = auth.uid()));

-- ------------------------------------------------------------------
-- 7. Ajustes aditivos em tabelas compartilhadas
-- ------------------------------------------------------------------
alter table public.nfe_entradas add column if not exists avaliacao_id uuid;
alter table public.nfe_entradas add column if not exists natureza_operacao_id uuid;
alter table public.nfe_entradas add column if not exists ref_externa text;
alter table public.nfe_entradas add column if not exists caminho_danfe text;
alter table public.nfe_entradas add column if not exists focus_status text;
alter table public.nfe_entradas add column if not exists observacoes text;
alter table public.nfe_entradas add column if not exists operacao text default 'compra'::text;
alter table public.nfe_entradas add column if not exists atendimento_id uuid;
alter table public.nfe_entradas add column if not exists estoque_moto_id uuid;
create unique index if not exists nfe_entradas_ref_externa_key on public.nfe_entradas (ref_externa);
create index if not exists idx_nfe_entradas_avaliacao_bpm on public.nfe_entradas (avaliacao_id);
create index if not exists idx_nfe_entradas_atendimento_bpm on public.nfe_entradas (atendimento_id);

alter table public.centros_custo add column if not exists empresa_id uuid references public.empresas(id);

create table if not exists public.formas_pagamento_financeiro (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_formas_pagamento_financeiro_upd on public.formas_pagamento_financeiro;
create trigger trg_formas_pagamento_financeiro_upd before update on public.formas_pagamento_financeiro for each row execute function set_updated_at();
alter table public.formas_pagamento_financeiro enable row level security;

-- ------------------------------------------------------------------
-- 8. Storage bucket moto-fotos + policies
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('moto-fotos','moto-fotos',true) on conflict (id) do nothing;
drop policy if exists "Delete moto photos" on storage.objects;
create policy "Delete moto photos" on storage.objects for delete to authenticated
  using (((bucket_id = 'moto-fotos'::text) AND ((storage.foldername(name))[1] = 'docs'::text) AND ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[2]) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))));
drop policy if exists "Update moto photos" on storage.objects;
create policy "Update moto photos" on storage.objects for update to authenticated
  using (((bucket_id = 'moto-fotos'::text) AND ((storage.foldername(name))[1] = 'docs'::text) AND ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));
drop policy if exists "Upload moto photos" on storage.objects;
create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (((bucket_id = 'moto-fotos'::text) AND ((storage.foldername(name))[1] = 'docs'::text) AND ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));
drop policy if exists "View moto photos" on storage.objects;
create policy "View moto photos" on storage.objects for select to public
  using ((bucket_id = 'moto-fotos'::text));

-- ------------------------------------------------------------------
-- 9. Seeds financeiro + naturezas BPM
-- ------------------------------------------------------------------
insert into public.formas_pagamento_financeiro (id, nome, tipo) values ('63e1fff5-14d7-476c-b2da-e1ea173279a1','Transferencia / PIX','pix') on conflict (id) do nothing;
-- plano_contas d16507df-... e centros_custo 7fe3888a-... JA EXISTEM em producao (verificado) -- nada a fazer
-- naturezas de operacao BPM: rodar naturezas_seed.sql DEPOIS deste script (depende de empresas.bpm=true)

commit;