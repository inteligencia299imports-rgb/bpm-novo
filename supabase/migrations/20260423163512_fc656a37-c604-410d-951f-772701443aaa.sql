
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint;
  v_convertidas bigint; v_retiradas bigint; v_entrada_direta bigint; v_troca bigint;
BEGIN
  -- Avaliações: filtradas pela data de criação da avaliação
  SELECT count(*) INTO v_total
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  -- Aquisições: filtradas pela data efetiva de aquisição (status_history)
  SELECT count(*) INTO v_aquisicoes
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  LEFT JOIN LATERAL (
    SELECT MIN(sh.created_at) AS data_aq
    FROM status_history sh
    WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
  ) sh ON true
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IS NOT NULL
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR COALESCE(sh.data_aq, av.updated_at) >= _date_from)
    AND (_date_to IS NULL OR COALESCE(sh.data_aq, av.updated_at) <= _date_to);

  SELECT count(*) INTO v_proprias
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  LEFT JOIN LATERAL (
    SELECT MIN(sh.created_at) AS data_aq
    FROM status_history sh
    WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
  ) sh ON true
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IN ('propria', 'test-ride', 'repasse')
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR COALESCE(sh.data_aq, av.updated_at) >= _date_from)
    AND (_date_to IS NULL OR COALESCE(sh.data_aq, av.updated_at) <= _date_to);

  SELECT count(*) INTO v_consignadas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  LEFT JOIN LATERAL (
    SELECT MIN(sh.created_at) AS data_aq
    FROM status_history sh
    WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
  ) sh ON true
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'consignada'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR COALESCE(sh.data_aq, av.updated_at) >= _date_from)
    AND (_date_to IS NULL OR COALESCE(sh.data_aq, av.updated_at) <= _date_to);

  SELECT count(*) INTO v_convertidas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  LEFT JOIN LATERAL (
    SELECT MIN(sh.created_at) AS data_aq
    FROM status_history sh
    WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
  ) sh ON true
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'convertida'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR COALESCE(sh.data_aq, av.updated_at) >= _date_from)
    AND (_date_to IS NULL OR COALESCE(sh.data_aq, av.updated_at) <= _date_to);

  -- Retiradas, Entrada Direta, Troca: filtradas pela data de criação da avaliação
  SELECT count(*) INTO v_retiradas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao = 'dispensada'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_entrada_direta
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar'
    AND a.interesse = 'vender'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_troca
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar'
    AND a.interesse = 'trocar'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  RETURN jsonb_build_object(
    'qtdAvaliacoes', v_total,
    'qtdAquisicoes', v_aquisicoes,
    'qtdProprias', v_proprias,
    'qtdConsignadas', v_consignadas,
    'qtdConvertidas', v_convertidas,
    'qtdRetiradas', v_retiradas,
    'qtdEntradaDireta', v_entrada_direta,
    'qtdTroca', v_troca
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_mensal(_loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := current_date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    v_cs := v_start::timestamptz;
    v_ce := (v_start + interval '1 month' - interval '1 day')::date::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_start, 'DD/MM') || ' - ' || to_char((v_start + interval '1 month' - interval '1 day')::date, 'DD/MM');

    DECLARE
      v_avaliacoes bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint;
      v_trocar bigint; v_vender bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao != 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

      SELECT count(*) INTO v_aquisicoes
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      LEFT JOIN LATERAL (
        SELECT MIN(sh.created_at) AS data_aq
        FROM status_history sh
        WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
      ) sh ON true
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IS NOT NULL AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND COALESCE(sh.data_aq, av.updated_at) >= v_cs AND COALESCE(sh.data_aq, av.updated_at) <= v_ce;

      SELECT count(*) INTO v_proprias
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      LEFT JOIN LATERAL (
        SELECT MIN(sh.created_at) AS data_aq
        FROM status_history sh
        WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
      ) sh ON true
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IN ('propria','convertida','test-ride','repasse') AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND COALESCE(sh.data_aq, av.updated_at) >= v_cs AND COALESCE(sh.data_aq, av.updated_at) <= v_ce;

      SELECT count(*) INTO v_consignadas
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      LEFT JOIN LATERAL (
        SELECT MIN(sh.created_at) AS data_aq
        FROM status_history sh
        WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'
      ) sh ON true
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'consignada' AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND COALESCE(sh.data_aq, av.updated_at) >= v_cs AND COALESCE(sh.data_aq, av.updated_at) <= v_ce;

      SELECT count(*) INTO v_trocar
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao != 'sem_avaliar' AND a.interesse = 'trocar'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

      SELECT count(*) INTO v_vender
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao != 'sem_avaliar' AND a.interesse = 'vender'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

      result := result || jsonb_build_object(
        'label', v_label,
        'avaliacoes', v_avaliacoes,
        'aquisicoes', v_aquisicoes,
        'proprias', v_proprias,
        'consignadas', v_consignadas,
        'negTrocar', v_trocar,
        'negVender', v_vender
      );
    END;

    v_start := v_start + interval '1 month';
  END LOOP;

  RETURN result;
END;
$function$;
