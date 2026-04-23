CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_avaliadores(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.situacao != 'sem_avaliar'
        AND a.interesse IN ('trocar', 'vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_trocar
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.tipo_aquisicao IS NOT NULL
        AND av.situacao != 'sem_avaliar'
        AND a.interesse = 'trocar'
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_vender
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.tipo_aquisicao IS NOT NULL
        AND av.situacao != 'sem_avaliar'
        AND a.interesse = 'vender'
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_propria
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.situacao != 'sem_avaliar'
        AND a.interesse IN ('trocar','vender')
        AND lower(trim(coalesce(av.tipo_aquisicao, ''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_consignada
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id
        AND av.situacao != 'sem_avaliar'
        AND a.interesse IN ('trocar','vender')
        AND lower(trim(coalesce(av.tipo_aquisicao, ''))) IN ('consignada','consignacao','consignação')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      IF v_avaliacoes > 0 THEN
        result := result || jsonb_build_object(
          'nome', COALESCE(v.nome, 'Desconhecido'),
          'avaliacoes', v_avaliacoes,
          'aqTrocar', v_aq_trocar,
          'aqVender', v_aq_vender,
          'aqPropria', v_aq_propria,
          'aqConsignada', v_aq_consignada
        );
      END IF;
    END;
  END LOOP;

  RETURN result;
END;
$$;