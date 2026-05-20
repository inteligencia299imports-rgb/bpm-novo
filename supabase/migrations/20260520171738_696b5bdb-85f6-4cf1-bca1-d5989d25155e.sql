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
  v_year       int := EXTRACT(year FROM v_today)::int;
  v_cycle_end_date date;
  v_cycle_end  timestamptz;
  v_cycle_start timestamptz;
  v_entradas   int;
  v_saidas     int;
  v_estoque    int;
  v_apenas_disp int;
  v_patrimonio numeric;
  v_giro       numeric;
  v_result     jsonb := '[]'::jsonb;
BEGIN
  FOR i IN 1..12 LOOP
    v_cycle_end_date := make_date(v_year, i, 20);
    v_cycle_end := v_cycle_end_date::timestamptz + interval '23 hours 59 minutes 59 seconds';
    v_cycle_start := (v_cycle_end_date - interval '1 month' + interval '1 day')::date::timestamptz;

    EXIT WHEN v_cycle_end >= v_today;

    SELECT count(*) INTO v_entradas
    FROM estoque
    WHERE data_entrada >= v_cycle_start
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
      AND data_venda >= v_cycle_start
      AND data_venda <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (
        v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja)
      );

    SELECT
      count(*),
      COALESCE(SUM(preco), 0),
      count(*) FILTER (WHERE status = 'disponivel')
    INTO v_estoque, v_patrimonio, v_apenas_disp
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

    v_giro := CASE WHEN v_estoque > 0 THEN round((v_saidas::numeric / v_estoque) * 100, 1) ELSE 0 END;

    v_result := v_result || jsonb_build_object(
      'label', to_char(v_cycle_end_date, 'DD/MM'),
      'entradas', v_entradas,
      'saidas', v_saidas,
      'disponiveis', v_estoque,
      'apenasDisponiveis', v_apenas_disp,
      'patrimonioDisp', v_patrimonio,
      'giro', v_giro
    );
  END LOOP;

  RETURN v_result;
END;
$function$;