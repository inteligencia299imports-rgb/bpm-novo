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
  v_year_start date := date_trunc('year', v_today)::date;
  v_start      date;
  v_cycle_end  timestamptz;
  v_entradas   int;
  v_saidas     int;
  v_disponiveis int;
  v_patrimonio numeric;
  v_giro       numeric;
  v_result     jsonb := '[]'::jsonb;
BEGIN
  FOR i IN 0..11 LOOP
    v_start := (v_year_start + (i || ' month')::interval)::date;
    v_cycle_end := (v_start + interval '1 month' - interval '1 day') + interval '23 hours 59 minutes 59 seconds';

    EXIT WHEN v_cycle_end >= v_today;

    SELECT count(*) INTO v_entradas
    FROM estoque
    WHERE data_entrada >= v_start
      AND data_entrada <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (
        v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja)
      );

    SELECT count(*) INTO v_saidas
    FROM estoque
    WHERE data_venda IS NOT NULL
      AND data_venda >= v_start
      AND data_venda <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (
        v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja)
      );

    SELECT count(*), COALESCE(SUM(preco), 0) INTO v_disponiveis, v_patrimonio
    FROM estoque
    WHERE status IN ('disponivel','servico','indisponivel_manual','bloqueio_juridico')
      AND data_entrada <= v_cycle_end
      AND (data_venda IS NULL OR data_venda > v_cycle_end)
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (
        v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja)
      );

    v_giro := CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END;

    v_result := v_result || jsonb_build_object(
      'label', to_char(v_cycle_end, 'DD/MM'),
      'entradas', v_entradas,
      'saidas', v_saidas,
      'disponiveis', v_disponiveis,
      'patrimonioDisp', v_patrimonio,
      'giro', v_giro
    );
  END LOOP;

  RETURN v_result;
END;
$function$;