CREATE OR REPLACE FUNCTION public.relatorio_showroom_mensal(_loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v_start date := '2025-12-21'; v_now date := current_date; v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    v_cycle_start := v_start::timestamptz;
    v_cycle_end := (v_start + interval '1 month' - interval '1 day')::date::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_start, 'DD/MM') || ' - ' || to_char((v_start + interval '1 month' - interval '1 day')::date, 'DD/MM');
    DECLARE v_atend bigint; v_vendas bigint; v_faturamento numeric := 0; v_faturamento_real numeric := 0; v_margem_prevista numeric := 0; v_margem_realizada numeric := 0; v_total_qv numeric := 0; rec record;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja) AND a.created_at >= v_cycle_start AND a.created_at <= v_cycle_end;
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end;
      FOR rec IN SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.preco, e.valor_venda as estoque_valor_venda, av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
        FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
        WHERE a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end
      LOOP
        DECLARE vvr numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.preco, 0); qv numeric := COALESCE(rec.quanto_vende,0); vf numeric := COALESCE(rec.valor_fechamento,0); cole numeric; colp numeric; cpl numeric; cpc numeric; crc numeric; cop numeric; fr numeric;
        BEGIN
          IF rec.avaliacao_id IS NOT NULL THEN
            SELECT COALESCE(SUM(valor_executado),0) INTO cole FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO colp FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO cpl FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO cpc FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
            SELECT COALESCE(SUM(valor_executado),0) INTO crc FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
          ELSE cole:=0; colp:=0; cpl:=0; cpc:=0; crc:=0; END IF;
          SELECT COALESCE(SUM(co.valor),0) INTO cop FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id=co.contrato_consignante_id WHERE cc.atendimento_id=rec.atend_id AND lower(co.responsavel)='loja';
          v_faturamento := v_faturamento + vvr; v_total_qv := v_total_qv + qv; v_margem_prevista := v_margem_prevista + (qv - vf);
          fr := vvr + (cpc - crc) + (colp - cole); v_faturamento_real := v_faturamento_real + fr;
          v_margem_realizada := v_margem_realizada + (fr - (vf + 445 + cole + cpl + cop));
        END;
      END LOOP;
      result := result || jsonb_build_object('label', v_label, 'atendimentos', v_atend, 'vendas', v_vendas, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END, 'faturamento', round(v_faturamento,2), 'pctMargemPrevista', CASE WHEN v_total_qv>0 THEN round(v_margem_prevista/v_total_qv,4) ELSE 0 END, 'pctMargemRealizada', CASE WHEN v_faturamento_real>0 THEN round(v_margem_realizada/v_faturamento_real,4) ELSE 0 END);
    END;
    v_start := v_start + interval '1 month';
  END LOOP;
  RETURN result;
END;
$function$;