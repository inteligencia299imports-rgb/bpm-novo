
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamptz DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_cs timestamptz; v_ce timestamptz; v_label text;
  v_cycle_end date;
BEGIN
  WHILE v_start <= v_cutoff::date LOOP
    v_cycle_end := (v_start + interval '1 month' - interval '1 day')::date;
    v_cs := v_start::timestamptz;
    v_ce := v_cycle_end::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';

    -- Apenas ciclos já fechados (fim do ciclo <= cutoff)
    EXIT WHEN v_ce > v_cutoff;

    v_label := to_char(v_cycle_end, 'DD/MM');

    DECLARE
      v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque WHERE data_entrada >= v_cs AND data_entrada <= v_ce;
      SELECT count(*) INTO v_saidas FROM estoque WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce;
      SELECT count(*) INTO v_disponiveis FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      SELECT COALESCE(SUM(preco), 0) INTO v_patrimonio FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);

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
