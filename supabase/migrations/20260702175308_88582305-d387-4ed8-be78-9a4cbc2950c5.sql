CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_por_avaliador(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v_loja AS (
    SELECT lower(trim(coalesce(_loja, 'todos'))) AS l
  ),
  base AS (
    SELECT av.id, av.avaliador_id, av.tipo_aquisicao, av.created_at, av.updated_at, a.interesse, a.loja,
      COALESCE((SELECT MIN(sh.created_at) FROM status_history sh
                WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
               av.updated_at, av.created_at) AS data_aq
    FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    CROSS JOIN v_loja
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND av.avaliador_id IS NOT NULL
      AND (v_loja.l IN ('', 'todos')
           OR norm_loja(a.loja) = norm_loja(v_loja.l)
           OR lower(a.loja) = v_loja.l)
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
$$;

GRANT EXECUTE ON FUNCTION public.relatorio_avaliacoes_por_avaliador(timestamptz, timestamptz, text) TO authenticated, anon, service_role;