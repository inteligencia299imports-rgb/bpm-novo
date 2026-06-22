
CREATE OR REPLACE FUNCTION public.next_report_cycle(_start date)
RETURNS TABLE(cycle_start date, cycle_end date, next_start date)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _start,
    CASE
      WHEN _start >= DATE '2026-07-01' THEN (date_trunc('month', _start)::date + interval '1 month' - interval '1 day')::date
      WHEN _start =  DATE '2026-05-21' THEN DATE '2026-06-30'
      ELSE (_start + interval '1 month' - interval '1 day')::date
    END,
    CASE
      WHEN _start >= DATE '2026-07-01' THEN (date_trunc('month', _start)::date + interval '1 month')::date
      WHEN _start =  DATE '2026-05-21' THEN DATE '2026-07-01'
      ELSE (_start + interval '1 month')::date
    END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_mensal(_loja text DEFAULT 'todos'::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := 'todos'; END IF;
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := v_cs_d::timestamptz;
    v_cycle_end := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_avaliacoes bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint; v_neg_trocar bigint; v_neg_vender bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja) OR lower(a.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      WITH base AS (
        SELECT av.id, av.tipo_aquisicao,
          COALESCE((SELECT MIN(sh.created_at) FROM status_history sh WHERE sh.entity_id = av.id AND sh.entity_type='avaliacao' AND sh.status='adquirida'), av.updated_at, av.created_at) AS data_aq
        FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
        WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja) OR lower(a.loja) = v_loja)
      ) SELECT COUNT(*), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aquisicoes, v_proprias, v_consignadas FROM base WHERE data_aq >= v_cycle_start AND data_aq <= v_cycle_end;
      SELECT count(*) FILTER (WHERE a.interesse='trocar'), count(*) FILTER (WHERE a.interesse='vender') INTO v_neg_trocar, v_neg_vender
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(a.loja) = norm_loja(v_loja) OR lower(a.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      result := result || jsonb_build_object('label', v_label, 'mes', v_label, 'avaliacoes', v_avaliacoes, 'aquisicoes', v_aquisicoes, 'proprias', v_proprias, 'consignadas', v_consignadas, 'negTrocar', v_neg_trocar, 'negVender', v_neg_vender);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendedor_mensal(_user_id uuid, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_atend bigint; v_vendas bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.created_at >= v_cs AND a.created_at <= v_ce;
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND a.data_venda >= v_cs AND a.data_venda <= v_ce;
      result := result || jsonb_build_object('label', v_label, 'atendimentos', v_atend, 'vendas', v_vendas, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_showroom_mensal(_loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := (v_cs_d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
    v_cycle_end := ((v_ce_d::timestamp + interval '23 hours 59 minutes 59 seconds 999 milliseconds') AT TIME ZONE 'America/Sao_Paulo');
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');

    DECLARE
      v_atend bigint; v_vendas bigint;
      v_faturamento numeric := 0; v_faturamento_real numeric := 0;
      v_margem_prevista numeric := 0; v_margem_realizada numeric := 0;
      v_total_qv numeric := 0; rec record;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a
      WHERE (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
        AND a.created_at >= v_cycle_start AND a.created_at <= v_cycle_end;

      SELECT count(*) INTO v_vendas FROM atendimentos a
      LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
        AND a.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
        AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end;

      FOR rec IN
        SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.preco, e.valor_venda as estoque_valor_venda,
               av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
        FROM atendimentos a
        LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
        LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
        WHERE a.situacao = 'vendido'
          AND (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
          AND a.data_venda IS NOT NULL
          AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
          AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end
      LOOP
        DECLARE
          vvr numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.preco, 0);
          qv numeric := COALESCE(rec.quanto_vende, 0);
          vf numeric := COALESCE(rec.valor_fechamento, 0);
          cole numeric; colp numeric; cpl numeric; cpc numeric; crc numeric; cop numeric; fr numeric;
        BEGIN
          IF rec.avaliacao_id IS NOT NULL THEN
            SELECT COALESCE(SUM(valor_executado), 0) INTO cole FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO colp FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpl FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
            SELECT COALESCE(SUM(valor_executado), 0) INTO crc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
          ELSE cole := 0; colp := 0; cpl := 0; cpc := 0; crc := 0;
          END IF;
          SELECT COALESCE(SUM(co.valor), 0) INTO cop FROM custos_operacionais co
          JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
          WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel) = 'loja';
          v_faturamento := v_faturamento + vvr;
          v_total_qv := v_total_qv + qv;
          v_margem_prevista := v_margem_prevista + (qv - vf);
          fr := vvr + (cpc - crc) + (colp - cole);
          v_faturamento_real := v_faturamento_real + fr;
          v_margem_realizada := v_margem_realizada + (fr - (vf + 445 + cole + cpl + cop));
        END;
      END LOOP;

      result := result || jsonb_build_object(
        'label', v_label,
        'atendimentos', v_atend,
        'vendas', v_vendas,
        'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END,
        'faturamento', round(v_faturamento, 2),
        'pctMargemPrevista', CASE WHEN v_total_qv > 0 THEN round(v_margem_prevista / v_total_qv, 4) ELSE 0 END,
        'pctMargemRealizada', CASE WHEN v_faturamento_real > 0 THEN round(v_margem_realizada / v_faturamento_real, 4) ELSE 0 END
      );
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque WHERE data_entrada >= v_cs AND data_entrada <= v_ce;
      SELECT count(*) INTO v_saidas FROM estoque WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce;
      SELECT count(*) INTO v_disponiveis FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      SELECT COALESCE(SUM(preco), 0) INTO v_patrimonio FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      result := result || jsonb_build_object(
        'label', v_label, 'entradas', v_entradas, 'saidas', v_saidas, 'disponiveis', v_disponiveis,
        'giro', CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END,
        'patrimonioDisp', round(v_patrimonio, 2));
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamp with time zone DEFAULT now())
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_cutoff::date LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    EXIT WHEN v_ce > v_cutoff;
    v_label := to_char(v_ce_d, 'DD/MM');
    DECLARE v_entradas bigint; v_saidas bigint; v_disponiveis bigint; v_patrimonio numeric;
    BEGIN
      SELECT count(*) INTO v_entradas FROM estoque WHERE data_entrada >= v_cs AND data_entrada <= v_ce;
      SELECT count(*) INTO v_saidas FROM estoque WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce;
      SELECT count(*) INTO v_disponiveis FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      SELECT COALESCE(SUM(preco), 0) INTO v_patrimonio FROM estoque WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce);
      result := result || jsonb_build_object(
        'label', v_label, 'entradas', v_entradas, 'saidas', v_saidas, 'disponiveis', v_disponiveis,
        'giro', CASE WHEN v_disponiveis > 0 THEN round((v_saidas::numeric / v_disponiveis) * 100, 1) ELSE 0 END,
        'patrimonioDisp', round(v_patrimonio, 2));
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(p_cutoff timestamp with time zone DEFAULT now(), p_loja text DEFAULT 'todos'::text, p_tipo text DEFAULT 'todos'::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today      timestamptz := COALESCE(p_cutoff, now());
  v_loja       text := COALESCE(NULLIF(trim(p_loja), ''), 'todos');
  v_tipo       text := COALESCE(NULLIF(trim(p_tipo), ''), 'todos');
  v_start      date := '2025-12-21';
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz;
  v_entradas int; v_saidas int; v_estoque int; v_apenas_disp int;
  v_patrimonio numeric; v_giro numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  WHILE v_start <= v_today::date LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := v_cs_d::timestamptz;
    v_cycle_end := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds';
    EXIT WHEN v_cycle_end >= v_today;

    SELECT count(*) INTO v_entradas FROM estoque
    WHERE data_entrada >= v_cycle_start AND data_entrada <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    SELECT count(*) INTO v_saidas FROM estoque
    WHERE data_venda IS NOT NULL AND data_venda >= v_cycle_start AND data_venda <= v_cycle_end
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    SELECT count(*), COALESCE(SUM(preco), 0), count(*) FILTER (WHERE status = 'disponivel')
    INTO v_estoque, v_patrimonio, v_apenas_disp
    FROM estoque
    WHERE status IN ('disponivel','servico','indisponivel_manual','bloqueio_juridico')
      AND data_entrada <= v_cycle_end AND (data_venda IS NULL OR data_venda > v_cycle_end)
      AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
      AND (v_loja = 'todos'
        OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
        OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
        OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
        OR lower(coalesce(loja,'')) = lower(v_loja));

    v_giro := CASE WHEN v_estoque > 0 THEN round((v_saidas::numeric / v_estoque) * 100, 1) ELSE 0 END;

    v_result := v_result || jsonb_build_object(
      'label', to_char(v_ce_d, 'DD/MM'),
      'entradas', v_entradas, 'saidas', v_saidas,
      'disponiveis', v_estoque, 'apenasDisponiveis', v_apenas_disp,
      'patrimonioDisp', v_patrimonio, 'giro', v_giro);

    v_start := v_next;
  END LOOP;
  RETURN v_result;
END;
$function$;
