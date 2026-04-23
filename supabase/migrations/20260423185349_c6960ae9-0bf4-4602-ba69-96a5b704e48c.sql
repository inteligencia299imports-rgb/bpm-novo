CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_avaliadores(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to   timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _loja      text DEFAULT 'todos'::text
)
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
  IF v_loja IN ('', 'todos') THEN
    v_loja := 'todos';
  END IF;

  FOR v IN
    SELECT DISTINCT av.avaliador_id, ur.nome
    FROM avaliacoes av
    LEFT JOIN user_roles ur ON ur.user_id = av.avaliador_id
    WHERE av.avaliador_id IS NOT NULL
  LOOP
    DECLARE
      v_avaliacoes bigint;
      v_aq_trocar bigint;
      v_aq_vender bigint;
      v_aq_propria bigint;
      v_aq_consignada bigint;
    BEGIN
      -- total de avaliações no período (por created_at)
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.situacao <> 'sem_avaliar'
        AND a.interesse IN ('trocar', 'vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to   IS NULL OR av.created_at <= _date_to);

      -- aquisições no período (por data efetiva de aquisição via status_history)
      WITH base AS (
        SELECT
          av.id,
          av.tipo_aquisicao,
          a.interesse,
          COALESCE(
            (SELECT MIN(sh.created_at) FROM status_history sh
              WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
            av.updated_at, av.created_at
          ) AS data_aq
        FROM avaliacoes av
        JOIN atendimentos a ON a.id = av.atendimento_id
        WHERE av.avaliador_id = v.avaliador_id
          AND av.situacao <> 'sem_avaliar'
          AND a.interesse IN ('trocar', 'vender')
          AND lower(trim(coalesce(av.tipo_aquisicao, ''))) IN
              ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
      ),
      filt AS (
        SELECT * FROM base
        WHERE (_date_from IS NULL OR data_aq >= _date_from)
          AND (_date_to   IS NULL OR data_aq <= _date_to)
      )
      SELECT
        COUNT(*) FILTER (WHERE interesse = 'trocar'),
        COUNT(*) FILTER (WHERE interesse = 'vender'),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aq_trocar, v_aq_vender, v_aq_propria, v_aq_consignada
      FROM filt;

      IF v_avaliacoes > 0 OR (COALESCE(v_aq_trocar,0) + COALESCE(v_aq_vender,0)) > 0 THEN
        result := result || jsonb_build_object(
          'nome', COALESCE(v.nome, '-'),
          'avaliacoes', v_avaliacoes,
          'aqTrocar', COALESCE(v_aq_trocar, 0),
          'aqVender', COALESCE(v_aq_vender, 0),
          'aqPropria', COALESCE(v_aq_propria, 0),
          'aqConsignada', COALESCE(v_aq_consignada, 0),
          'total', COALESCE(v_aq_trocar,0) + COALESCE(v_aq_vender,0),
          'conversao', CASE WHEN v_avaliacoes > 0
            THEN round((COALESCE(v_aq_trocar,0) + COALESCE(v_aq_vender,0))::numeric / v_avaliacoes, 4)
            ELSE 0 END
        );
      END IF;
    END;
  END LOOP;

  RETURN result;
END;
$function$;