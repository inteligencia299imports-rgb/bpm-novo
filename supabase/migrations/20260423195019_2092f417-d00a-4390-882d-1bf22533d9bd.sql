CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _loja text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loja text := lower(trim(coalesce(_loja, '')));
  v_result json;
BEGIN
  IF v_loja IN ('', 'todos') THEN
    v_loja := NULL;
  END IF;

  WITH base AS (
    SELECT
      av.id,
      av.tipo_aquisicao,
      av.situacao,
      av.created_at,
      av.updated_at,
      a.interesse,
      COALESCE(
        (
          SELECT MIN(sh.created_at)
          FROM status_history sh
          WHERE sh.entity_id = av.id
            AND sh.entity_type = 'avaliacao'
            AND sh.status = 'adquirida'
        ),
        av.updated_at,
        av.created_at
      ) AS data_aquisicao
    FROM avaliacoes av
    JOIN atendimentos a ON a.id = av.atendimento_id
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar', 'vender')
      AND av.avaliador_id IS NOT NULL
      AND (
        v_loja IS NULL
        OR norm_loja(a.loja) = norm_loja(v_loja)
      )
  ),
  filtrado_avaliacoes AS (
    SELECT * FROM base
    WHERE (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to   IS NULL OR created_at <= _date_to)
  ),
  filtrado_aquisicoes AS (
    SELECT * FROM base
    WHERE tipo_aquisicao IN ('propria', 'consignada', 'test-ride', 'repasse', 'convertida')
      AND (_date_from IS NULL OR data_aquisicao >= _date_from)
      AND (_date_to   IS NULL OR data_aquisicao <= _date_to)
  )
  SELECT json_build_object(
    'total_avaliacoes',     (SELECT COUNT(*) FROM filtrado_avaliacoes),
    'total_aquisicoes',     (SELECT COUNT(*) FROM filtrado_aquisicoes),
    'aquisicoes_propria',   (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_aquisicao IN ('propria', 'convertida', 'repasse', 'test-ride')),
    'aquisicoes_consignada',(SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_aquisicao = 'consignada'),
    'aquisicoes_convertida',(SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_aquisicao = 'convertida'),
    'entrada_direta',       (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'vender'),
    'troca',                (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'trocar'),
    'retiradas',            (SELECT COUNT(*) FROM filtrado_avaliacoes WHERE situacao = 'retirada')
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;