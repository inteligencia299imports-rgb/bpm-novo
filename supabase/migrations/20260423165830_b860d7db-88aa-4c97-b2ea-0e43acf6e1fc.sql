DROP FUNCTION IF EXISTS public.relatorio_avaliacoes_kpis(timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.relatorio_avaliacoes_mensal(text);

CREATE FUNCTION public.relatorio_avaliacoes_kpis(
  _date_from timestamptz DEFAULT NULL,
  _date_to   timestamptz DEFAULT NULL,
  _loja      text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_avaliacoes      int := 0;
  v_total_aquisicoes      int := 0;
  v_aquisicoes_propria    int := 0;
  v_aquisicoes_consignada int := 0;
  v_aquisicoes_convertida int := 0;
  v_entrada_direta        int := 0;
  v_troca                 int := 0;
  v_retiradas             int := 0;
BEGIN
  SELECT COUNT(*) INTO v_total_avaliacoes
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao <> 'sem_avaliar'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja IS NULL OR a.loja = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to   IS NULL OR av.created_at <= _date_to);

  WITH aq AS (
    SELECT av.id, av.tipo_aquisicao,
           COALESCE(sh.data_aq, av.updated_at) AS data_aq
    FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    LEFT JOIN LATERAL (
      SELECT MIN(sh2.created_at) AS data_aq
      FROM status_history sh2
      WHERE sh2.entity_id = av.id
        AND sh2.entity_type = 'avaliacao'
        AND sh2.status = 'adquirida'
    ) sh ON true
    WHERE av.situacao <> 'sem_avaliar'
      AND av.tipo_aquisicao IN ('propria', 'consignada', 'test-ride', 'repasse', 'convertida')
      AND a.interesse IN ('trocar', 'vender')
      AND (_loja IS NULL OR a.loja = _loja)
  )
  SELECT
    COUNT(*) FILTER (WHERE (_date_from IS NULL OR data_aq >= _date_from)
                       AND (_date_to   IS NULL OR data_aq <= _date_to)),
    COUNT(*) FILTER (WHERE tipo_aquisicao IN ('propria','test-ride','repasse')
                       AND (_date_from IS NULL OR data_aq >= _date_from)
                       AND (_date_to   IS NULL OR data_aq <= _date_to)),
    COUNT(*) FILTER (WHERE tipo_aquisicao = 'consignada'
                       AND (_date_from IS NULL OR data_aq >= _date_from)
                       AND (_date_to   IS NULL OR data_aq <= _date_to)),
    COUNT(*) FILTER (WHERE tipo_aquisicao = 'convertida'
                       AND (_date_from IS NULL OR data_aq >= _date_from)
                       AND (_date_to   IS NULL OR data_aq <= _date_to))
  INTO v_total_aquisicoes, v_aquisicoes_propria, v_aquisicoes_consignada, v_aquisicoes_convertida
  FROM aq;

  SELECT COUNT(*) INTO v_entrada_direta
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao <> 'sem_avaliar'
    AND a.interesse = 'vender'
    AND (_loja IS NULL OR a.loja = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to   IS NULL OR av.created_at <= _date_to);

  SELECT COUNT(*) INTO v_troca
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao <> 'sem_avaliar'
    AND a.interesse = 'trocar'
    AND (_loja IS NULL OR a.loja = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to   IS NULL OR av.created_at <= _date_to);

  SELECT COUNT(*) INTO v_retiradas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao = 'retirada'
    AND a.interesse IN ('trocar','vender')
    AND (_loja IS NULL OR a.loja = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to   IS NULL OR av.created_at <= _date_to);

  RETURN json_build_object(
    'total_avaliacoes',      v_total_avaliacoes,
    'total_aquisicoes',      v_total_aquisicoes,
    'aquisicoes_propria',    v_aquisicoes_propria,
    'aquisicoes_consignada', v_aquisicoes_consignada,
    'aquisicoes_convertida', v_aquisicoes_convertida,
    'entrada_direta',        v_entrada_direta,
    'troca',                 v_troca,
    'retiradas',             v_retiradas
  );
END;
$$;

CREATE FUNCTION public.relatorio_avaliacoes_mensal(
  _loja text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    )::date AS mes
  ),
  aq AS (
    SELECT av.id, av.tipo_aquisicao,
           COALESCE(sh.data_aq, av.updated_at) AS data_aq
    FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    LEFT JOIN LATERAL (
      SELECT MIN(sh2.created_at) AS data_aq
      FROM status_history sh2
      WHERE sh2.entity_id = av.id
        AND sh2.entity_type = 'avaliacao'
        AND sh2.status = 'adquirida'
    ) sh ON true
    WHERE av.situacao <> 'sem_avaliar'
      AND av.tipo_aquisicao IN ('propria','consignada','test-ride','repasse','convertida')
      AND a.interesse IN ('trocar','vender')
      AND (_loja IS NULL OR a.loja = _loja)
  ),
  av_base AS (
    SELECT av.id, av.created_at
    FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND (_loja IS NULL OR a.loja = _loja)
  ),
  agregado AS (
    SELECT
      m.mes,
      (SELECT COUNT(*) FROM av_base WHERE date_trunc('month', created_at)::date = m.mes) AS avaliacoes,
      (SELECT COUNT(*) FROM aq WHERE date_trunc('month', data_aq)::date = m.mes) AS aquisicoes
    FROM meses m
  )
  SELECT json_agg(
    json_build_object(
      'mes',        to_char(mes, 'Mon/YY'),
      'avaliacoes', avaliacoes,
      'aquisicoes', aquisicoes
    ) ORDER BY mes
  ) INTO v_result
  FROM agregado;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;