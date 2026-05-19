CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamp with time zone DEFAULT now(), p_loja text DEFAULT 'todos'::text, p_tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_loja text := COALESCE(NULLIF(trim(p_loja),''), 'todos');
  v_tipo text := COALESCE(NULLIF(trim(p_tipo),''), 'todos');
  v_cs timestamptz; v_ce timestamptz; v_label text;
  v_cycle_end date;
BEGIN
  WHILE v_start <= v_cutoff::date LOOP
    v_cycle_end := (v_start + interval '1 month' - interval '1 day')::date;
    v_cs := v_start::timestamptz;
    v_ce := v_cycle_end::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    EXIT WHEN v_ce > v_cutoff;
    v_label := to_char(v_cycle_end, 'DD/MM');

    DECLARE
      v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque
      WHERE data_entrada >= v_cs AND data_entrada <= v_ce
        AND status IN ('disponivel','indisponivel','servico','bloqueio_juridico','vendido')
        AND (
          v_loja = 'todos'
          OR (v_loja = '299' AND (upper(coalesce(loja,'')) NOT LIKE '%DUCATI%' OR coalesce(loja,'') = ''))
          OR (v_loja = 'Ducati' AND upper(coalesce(loja,'')) LIKE '%DUCATI%')
          OR lower(coalesce(loja,'')) = lower(v_loja)
        )
        AND (v_tipo = 'todos' OR coalesce(tipo,'propria') = v_tipo);

      SELECT count(*) INTO v_saidas FROM estoque
      WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce
        AND (
          v_loja = 'todos'
          OR (v_loja = '299' AND (upper(coalesce(loja,'')) NOT LIKE '%DUCATI%' OR coalesce(loja,'') = ''))
          OR (v_loja = 'Ducati' AND upper(coalesce(loja,'')) LIKE '%DUCATI%')
          OR lower(coalesce(loja,'')) = lower(v_loja)
        )
        AND (v_tipo = 'todos' OR coalesce(tipo,'propria') = v_tipo);

      SELECT count(*), COALESCE(SUM(preco),0) INTO v_disponiveis, v_patrimonio FROM estoque
      WHERE status IN ('disponivel','indisponivel','servico','bloqueio_juridico')
        AND data_entrada <= v_ce
        AND (data_venda IS NULL OR data_venda > v_ce)
        AND (
          v_loja = 'todos'
          OR (v_loja = '299' AND (upper(coalesce(loja,'')) NOT LIKE '%DUCATI%' OR coalesce(loja,'') = ''))
          OR (v_loja = 'Ducati' AND upper(coalesce(loja,'')) LIKE '%DUCATI%')
          OR lower(coalesce(loja,'')) = lower(v_loja)
        )
        AND (v_tipo = 'todos' OR coalesce(tipo,'propria') = v_tipo);

      result := result || jsonb_build_object(
        'label', v_label,
        'entradas', v_entradas,
        'saidas', v_saidas,
        'disponiveis', v_disponiveis,
        'giro', CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END,
        'patrimonioDisp', round(v_patrimonio, 2)
      );
    END;

    v_start := v_start + interval '1 month';
  END LOOP;

  RETURN result;
END;
$function$;