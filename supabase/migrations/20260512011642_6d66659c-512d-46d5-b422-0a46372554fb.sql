CREATE OR REPLACE FUNCTION public.relatorio_showroom_kpis(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_qtd_atendimentos bigint; v_qtd_vendas bigint; v_qtd_sinais bigint;
  v_faturamento_previsto numeric := 0; v_faturamento_realizado numeric := 0;
  v_margem_prevista numeric := 0; v_margem_realizada numeric := 0; v_total_quanto_vende numeric := 0; rec record;
BEGIN
  SELECT count(*) INTO v_qtd_atendimentos FROM atendimentos a
  WHERE (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
    AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_qtd_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
  WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
    AND a.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
    AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
  SELECT count(*) INTO v_qtd_sinais FROM atendimentos a WHERE a.situacao = 'sinal' AND (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja);
  FOR rec IN SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.id as estoque_id, e.preco as estoque_preco, e.valor_venda as estoque_valor_venda, e.tipo as estoque_tipo, av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
    FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(a.loja) = _loja OR a.loja = _loja)
      AND a.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
      AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to)
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_preco_estoque numeric := COALESCE(rec.estoque_preco, 0); v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric; v_custo_oficina_loja_prev numeric; v_custo_processo_loja numeric; v_custo_prev_cliente numeric; v_custo_real_cliente numeric; v_custo_op_loja numeric; v_fat_real numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
      ELSE v_custo_oficina_loja_exec := 0; v_custo_oficina_loja_prev := 0; v_custo_processo_loja := 0; v_custo_prev_cliente := 0; v_custo_real_cliente := 0;
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel)='loja';
      v_faturamento_previsto := v_faturamento_previsto + v_quanto_vende; v_total_quanto_vende := v_total_quanto_vende + v_quanto_vende;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_faturamento_realizado := v_faturamento_realizado + v_fat_real;
      v_margem_prevista := v_margem_prevista + (v_quanto_vende - v_valor_fechamento);
      v_margem_realizada := v_margem_realizada + (v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja));
    END;
  END LOOP;
  RETURN jsonb_build_object('qtdAtendimentos', v_qtd_atendimentos, 'qtdVendas', v_qtd_vendas, 'qtdSinais', v_qtd_sinais,
    'taxaConversao', CASE WHEN v_qtd_atendimentos > 0 THEN round((v_qtd_vendas::numeric / v_qtd_atendimentos), 4) ELSE 0 END,
    'faturamentoPrevisto', round(v_faturamento_previsto,2), 'faturamentoRealizado', round(v_faturamento_realizado,2),
    'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_total_quanto_vende > 0 THEN round(v_margem_prevista / v_total_quanto_vende, 4) ELSE 0 END,
    'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_faturamento_realizado > 0 THEN round(v_margem_realizada / v_faturamento_realizado, 4) ELSE 0 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendedores(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint; v_faturamento numeric := 0;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id = v.user_id AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos a WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja);
      SELECT COALESCE(SUM(COALESCE(e.preco, a.valor_venda, 0)),0) INTO v_faturamento FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END, 'faturamento', round(v_faturamento,2));
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendidas(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; rec record;
BEGIN
  FOR rec IN
    SELECT a.nome_cliente, a.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(a.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa,'-') as placa, a.data_venda as data_venda,
      av.quanto_vende, av.valor_fechamento, a.valor_venda as atend_valor_venda, e.valor_venda as estoque_valor_venda, e.preco as estoque_preco,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM atendimentos a
    LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id LIMIT 1) mi ON true
    WHERE a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja)
      AND a.data_venda IS NOT NULL
      AND (_tipo='todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(a.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
      AND (_date_from IS NULL OR a.data_venda >= _date_from)
      AND (_date_to IS NULL OR a.data_venda <= _date_to)
    ORDER BY a.data_venda DESC
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende,0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento,0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0; v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0; v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric; v_abatimentos numeric; v_margem_realizada numeric; v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel)='loja';
      v_taxa_fixa := CASE WHEN rec.tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object('nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome,'-'), 'loja', rec.loja, 'tipo', rec.tipo, 'modelo', rec.modelo, 'placa', rec.placa, 'dataVenda', rec.data_venda, 'quantoVende', round(v_quanto_vende,2), 'valorFechamento', round(v_valor_fechamento,2), 'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_quanto_vende>0 THEN round(v_margem_prevista/v_quanto_vende,4) ELSE 0 END, 'valorVenda', round(v_valor_venda_real,2), 'margemOficina', round(v_margem_oficina,2), 'abatimentos', round(v_abatimentos,2), 'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_fat_real>0 THEN round(v_margem_realizada/v_fat_real,4) ELSE 0 END);
    END;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendedor_equipe(_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id=v.user_id AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos a WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendedor_kpis(_user_id uuid, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
BEGIN
  SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
  SELECT count(*) INTO v_sinais FROM atendimentos a WHERE a.vendedor_id=_user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja);
  RETURN jsonb_build_object('qtdAtendimentos', v_atend, 'qtdVendas', v_vendas, 'qtdSinais', v_sinais, 'taxaConversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendedor_mensal(_user_id uuid, _loja text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb := '[]'::jsonb; v_start date := '2025-12-21'; v_now date := current_date; v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    v_cs := v_start::timestamptz;
    v_ce := (v_start + interval '1 month' - interval '1 day')::date::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_start, 'DD/MM') || ' - ' || to_char((v_start + interval '1 month' - interval '1 day')::date, 'DD/MM');
    DECLARE v_atend bigint; v_vendas bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.created_at >= v_cs AND a.created_at <= v_ce;
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(a.loja)=_loja OR a.loja=_loja) AND a.data_venda IS NOT NULL AND a.data_venda >= v_cs AND a.data_venda <= v_ce;
      result := result || jsonb_build_object('label', v_label, 'atendimentos', v_atend, 'vendas', v_vendas, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
    END;
    v_start := v_start + interval '1 month';
  END LOOP;
  RETURN result;
END;
$function$;