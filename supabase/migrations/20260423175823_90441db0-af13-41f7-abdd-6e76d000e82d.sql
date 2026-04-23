DROP FUNCTION IF EXISTS public.relatorio_avaliacoes_mensal(text);

CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_mensal(_loja text DEFAULT 'todos')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := current_date;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_label text;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN
    v_loja := 'todos';
  END IF;

  WHILE v_start <= v_now LOOP
    v_cycle_start := v_start::timestamptz;
    v_cycle_end := (v_start + interval '1 month' - interval '1 day')::date::timestamptz
                   + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_start, 'DD/MM') || ' - ' || to_char((v_start + interval '1 month' - interval '1 day')::date, 'DD/MM');

    DECLARE
      v_avaliacoes bigint;
      v_aquisicoes bigint;
      v_proprias bigint;
      v_consignadas bigint;
      v_neg_trocar bigint;
      v_neg_vender bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao <> 'sem_avaliar'
        AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND av.created_at >= v_cycle_start
        AND av.created_at <= v_cycle_end;

      WITH base AS (
        SELECT av.id, av.tipo_aquisicao,
               COALESCE(
                 (SELECT MIN(sh.created_at) FROM status_history sh
                  WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
                 av.updated_at, av.created_at
               ) AS data_aq
        FROM avaliacoes av
        JOIN atendimentos a ON a.id = av.atendimento_id
        WHERE av.situacao <> 'sem_avaliar'
          AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao, ''))) IN
              ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
      )
      SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aquisicoes, v_proprias, v_consignadas
      FROM base
      WHERE data_aq >= v_cycle_start AND data_aq <= v_cycle_end;

      SELECT
        count(*) FILTER (WHERE a.interesse = 'trocar'),
        count(*) FILTER (WHERE a.interesse = 'vender')
      INTO v_neg_trocar, v_neg_vender
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao <> 'sem_avaliar'
        AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja))
        AND av.created_at >= v_cycle_start
        AND av.created_at <= v_cycle_end;

      result := result || jsonb_build_object(
        'label', v_label,
        'mes', v_label,
        'avaliacoes', v_avaliacoes,
        'aquisicoes', v_aquisicoes,
        'proprias', v_proprias,
        'consignadas', v_consignadas,
        'negTrocar', v_neg_trocar,
        'negVender', v_neg_vender
      );
    END;

    v_start := v_start + interval '1 month';
  END LOOP;

  RETURN result;
END;
$function$;