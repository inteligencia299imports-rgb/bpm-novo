CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loja text := lower(trim(coalesce(_loja, '')));
  v_result json;
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := NULL; END IF;

  WITH base AS (
    SELECT
      av.id,
      -- normalize: strip accents + lowercase + trim; NULL/'' treated as 'propria'
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
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND (v_loja IS NULL OR norm_loja(a.loja) = norm_loja(v_loja) OR lower(a.loja) = v_loja)
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
$$;