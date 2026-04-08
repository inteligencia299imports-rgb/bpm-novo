
-- ============================================================
-- Helper: normalize loja to group (299 or Ducati)
-- ============================================================
CREATE OR REPLACE FUNCTION public.norm_loja(_loja text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN upper(_loja) LIKE '%DUCATI%' THEN 'Ducati' ELSE '299' END;
$$;

-- ============================================================
-- SHOWROOM KPIs
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_showroom_kpis(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd_atendimentos bigint;
  v_qtd_vendas bigint;
  v_qtd_sinais bigint;
  v_faturamento_previsto numeric := 0;
  v_faturamento_realizado numeric := 0;
  v_margem_prevista numeric := 0;
  v_margem_realizada numeric := 0;
  v_total_quanto_vende numeric := 0;
  rec record;
BEGIN
  -- Count atendimentos (all interests, filtered by date on created_at)
  SELECT count(*) INTO v_qtd_atendimentos
  FROM atendimentos a
  WHERE (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR a.created_at >= _date_from)
    AND (_date_to IS NULL OR a.created_at <= _date_to);

  -- Count vendas: situacao='vendido' + has estoque with data_venda in range
  SELECT count(DISTINCT a.id) INTO v_qtd_vendas
  FROM atendimentos a
  JOIN estoque e ON e.atendimento_venda_id = a.id
  WHERE a.situacao = 'vendido'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND e.data_venda IS NOT NULL
    AND (_tipo = 'todos' OR e.tipo = _tipo)
    AND (_date_from IS NULL OR e.data_venda >= _date_from)
    AND (_date_to IS NULL OR e.data_venda <= _date_to);

  -- Count sinais (no date filter, only loja)
  SELECT count(*) INTO v_qtd_sinais
  FROM atendimentos a
  WHERE a.situacao = 'sinal'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja);

  -- Financial metrics for vendas
  FOR rec IN
    SELECT
      a.id as atend_id,
      a.valor_venda as atend_valor_venda,
      e.id as estoque_id,
      e.preco as estoque_preco,
      e.valor_venda as estoque_valor_venda,
      e.tipo as estoque_tipo,
      av.id as avaliacao_id,
      av.quanto_vende,
      av.valor_fechamento
    FROM atendimentos a
    JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    WHERE a.situacao = 'vendido'
      AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
      AND e.data_venda IS NOT NULL
      AND (_tipo = 'todos' OR e.tipo = _tipo)
      AND (_date_from IS NULL OR e.data_venda >= _date_from)
      AND (_date_to IS NULL OR e.data_venda <= _date_to)
  LOOP
    IF rec.avaliacao_id IS NOT NULL THEN
      DECLARE
        v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0);
        v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
        v_preco_estoque numeric := COALESCE(rec.estoque_preco, 0);
        v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
        v_custo_oficina_loja_exec numeric;
        v_custo_oficina_loja_prev numeric;
        v_custo_processo_loja numeric;
        v_custo_prev_cliente numeric;
        v_custo_real_cliente numeric;
        v_custo_op_loja numeric;
        v_fat_real numeric;
      BEGIN
        -- Custos oficina loja (com valor_executado)
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_oficina_loja_exec
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;

        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_oficina_loja_prev
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;

        -- Custos processo loja (sem valor_executado)
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_processo_loja
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;

        -- Custos cliente
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_prev_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';

        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_real_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';

        -- Custos operacionais (intermediação) via contratos_consignante
        SELECT COALESCE(SUM(co.valor), 0) INTO v_custo_op_loja
        FROM custos_operacionais co
        JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
        WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel) = 'loja';

        v_faturamento_previsto := v_faturamento_previsto + v_quanto_vende;
        v_total_quanto_vende := v_total_quanto_vende + v_quanto_vende;

        v_fat_real := v_valor_venda_real
          + (v_custo_prev_cliente - v_custo_real_cliente)
          + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
        v_faturamento_realizado := v_faturamento_realizado + v_fat_real;

        v_margem_prevista := v_margem_prevista + (v_quanto_vende - v_valor_fechamento);
        v_margem_realizada := v_margem_realizada + (v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja));
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'qtdAtendimentos', v_qtd_atendimentos,
    'qtdVendas', v_qtd_vendas,
    'qtdSinais', v_qtd_sinais,
    'taxaConversao', CASE WHEN v_qtd_atendimentos > 0 THEN round((v_qtd_vendas::numeric / v_qtd_atendimentos), 4) ELSE 0 END,
    'faturamentoPrevisto', round(v_faturamento_previsto, 2),
    'faturamentoRealizado', round(v_faturamento_realizado, 2),
    'margemPrevista', round(v_margem_prevista, 2),
    'pctMargemPrevista', CASE WHEN v_total_quanto_vende > 0 THEN round(v_margem_prevista / v_total_quanto_vende, 4) ELSE 0 END,
    'margemRealizada', round(v_margem_realizada, 2),
    'pctMargemRealizada', CASE WHEN v_faturamento_realizado > 0 THEN round(v_margem_realizada / v_faturamento_realizado, 4) ELSE 0 END
  );
END;
$$;

-- ============================================================
-- SHOWROOM POR VENDEDOR
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendedores(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  v record;
BEGIN
  FOR v IN
    SELECT ur.user_id, ur.nome
    FROM user_roles ur
  LOOP
    DECLARE
      v_atend bigint;
      v_vendas bigint;
      v_sinais bigint;
      v_faturamento numeric := 0;
    BEGIN
      SELECT count(*) INTO v_atend
      FROM atendimentos a
      WHERE a.vendedor_id = v.user_id
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND (_date_from IS NULL OR a.created_at >= _date_from)
        AND (_date_to IS NULL OR a.created_at <= _date_to);

      SELECT count(DISTINCT a.id) INTO v_vendas
      FROM atendimentos a
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.vendedor_id = v.user_id AND a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND e.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR e.tipo = _tipo)
        AND (_date_from IS NULL OR e.data_venda >= _date_from)
        AND (_date_to IS NULL OR e.data_venda <= _date_to);

      SELECT count(*) INTO v_sinais
      FROM atendimentos a
      WHERE a.vendedor_id = v.user_id AND a.situacao = 'sinal'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja);

      -- Faturamento
      SELECT COALESCE(SUM(e.preco), 0) INTO v_faturamento
      FROM atendimentos a
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.vendedor_id = v.user_id AND a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND e.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR e.tipo = _tipo)
        AND (_date_from IS NULL OR e.data_venda >= _date_from)
        AND (_date_to IS NULL OR e.data_venda <= _date_to);

      IF v_atend > 0 OR v_vendas > 0 OR v_sinais > 0 THEN
        result := result || jsonb_build_object(
          'nome', v.nome,
          'atendimentos', v_atend,
          'vendas', v_vendas,
          'sinais', v_sinais,
          'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END,
          'faturamento', round(v_faturamento, 2)
        );
      END IF;
    END;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- SHOWROOM VENDIDAS LIST
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_showroom_vendidas(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      a.nome_cliente,
      ur.nome as vendedor_nome,
      e.tipo,
      e.marca || ' ' || e.modelo as modelo,
      e.placa,
      e.data_venda,
      av.quanto_vende,
      av.valor_fechamento,
      a.valor_venda as atend_valor_venda,
      e.valor_venda as estoque_valor_venda,
      e.preco as estoque_preco,
      av.id as avaliacao_id,
      a.id as atendimento_id
    FROM atendimentos a
    JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    WHERE a.situacao = 'vendido'
      AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
      AND e.data_venda IS NOT NULL
      AND (_tipo = 'todos' OR e.tipo = _tipo)
      AND (_date_from IS NULL OR e.data_venda >= _date_from)
      AND (_date_to IS NULL OR e.data_venda <= _date_to)
    ORDER BY e.data_venda DESC
  LOOP
    DECLARE
      v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0);
      v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0;
      v_custo_oficina_loja_prev numeric := 0;
      v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0;
      v_custo_real_cliente numeric := 0;
      v_custo_op_loja numeric := 0;
      v_fat_real numeric;
      v_margem_prevista numeric;
      v_margem_oficina numeric;
      v_abatimentos numeric;
      v_margem_realizada numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_oficina_loja_exec
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_oficina_loja_prev
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_processo_loja
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_prev_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_real_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
      END IF;

      SELECT COALESCE(SUM(co.valor), 0) INTO v_custo_op_loja
      FROM custos_operacionais co
      JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
      WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel) = 'loja';

      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);

      result := result || jsonb_build_object(
        'nomeCliente', rec.nome_cliente,
        'vendedor', COALESCE(rec.vendedor_nome, '-'),
        'tipo', rec.tipo,
        'modelo', rec.modelo,
        'placa', COALESCE(rec.placa, '-'),
        'dataVenda', rec.data_venda,
        'quantoVende', round(v_quanto_vende, 2),
        'valorFechamento', round(v_valor_fechamento, 2),
        'margemPrevista', round(v_margem_prevista, 2),
        'pctMargemPrevista', CASE WHEN v_quanto_vende > 0 THEN round(v_margem_prevista / v_quanto_vende, 4) ELSE 0 END,
        'valorVenda', round(v_valor_venda_real, 2),
        'margemOficina', round(v_margem_oficina, 2),
        'abatimentos', round(v_abatimentos, 2),
        'margemRealizada', round(v_margem_realizada, 2),
        'pctMargemRealizada', CASE WHEN v_fat_real > 0 THEN round(v_margem_realizada / v_fat_real, 4) ELSE 0 END
      );
    END;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- SHOWROOM SINAIS LIST
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_showroom_sinais(
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      a.nome_cliente,
      ur.nome as vendedor_nome,
      e.tipo,
      e.marca || ' ' || e.modelo as modelo,
      e.placa,
      a.created_at as data_sinal,
      av.quanto_vende,
      av.valor_fechamento,
      a.valor_venda as atend_valor_venda,
      e.valor_venda as estoque_valor_venda,
      e.preco as estoque_preco,
      av.id as avaliacao_id,
      a.id as atendimento_id
    FROM atendimentos a
    JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    WHERE a.situacao = 'sinal'
      AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
      AND (_tipo = 'todos' OR e.tipo = _tipo)
    ORDER BY a.created_at DESC
  LOOP
    DECLARE
      v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0);
      v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0;
      v_custo_oficina_loja_prev numeric := 0;
      v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0;
      v_custo_real_cliente numeric := 0;
      v_custo_op_loja numeric := 0;
      v_fat_real numeric;
      v_margem_prevista numeric;
      v_margem_oficina numeric;
      v_abatimentos numeric;
      v_margem_realizada numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_oficina_loja_exec
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_oficina_loja_prev
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_processo_loja
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_prev_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_real_cliente
        FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
      END IF;

      SELECT COALESCE(SUM(co.valor), 0) INTO v_custo_op_loja
      FROM custos_operacionais co
      JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
      WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel) = 'loja';

      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);

      result := result || jsonb_build_object(
        'nomeCliente', rec.nome_cliente,
        'vendedor', COALESCE(rec.vendedor_nome, '-'),
        'tipo', rec.tipo,
        'modelo', rec.modelo,
        'placa', COALESCE(rec.placa, '-'),
        'dataSinal', rec.data_sinal,
        'quantoVende', round(v_quanto_vende, 2),
        'valorFechamento', round(v_valor_fechamento, 2),
        'margemPrevista', round(v_margem_prevista, 2),
        'pctMargemPrevista', CASE WHEN v_quanto_vende > 0 THEN round(v_margem_prevista / v_quanto_vende, 4) ELSE 0 END,
        'valorVenda', round(v_valor_venda_real, 2),
        'margemOficina', round(v_margem_oficina, 2),
        'abatimentos', round(v_abatimentos, 2),
        'margemRealizada', round(v_margem_realizada, 2),
        'pctMargemRealizada', CASE WHEN v_fat_real > 0 THEN round(v_margem_realizada / v_fat_real, 4) ELSE 0 END
      );
    END;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- SHOWROOM MENSAL (cycle 21-20)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_showroom_mensal(
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := current_date;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    v_cycle_start := v_start::timestamptz;
    v_cycle_end := (v_start + interval '1 month' - interval '1 day')::date::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_start, 'DD/MM') || ' - ' || to_char((v_start + interval '1 month' - interval '1 day')::date, 'DD/MM');

    DECLARE
      v_atend bigint;
      v_vendas bigint;
      v_faturamento numeric := 0;
      v_faturamento_real numeric := 0;
      v_margem_prevista numeric := 0;
      v_margem_realizada numeric := 0;
      v_total_qv numeric := 0;
      rec record;
    BEGIN
      SELECT count(*) INTO v_atend
      FROM atendimentos a
      WHERE (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND a.created_at >= v_cycle_start AND a.created_at <= v_cycle_end;

      SELECT count(DISTINCT a.id) INTO v_vendas
      FROM atendimentos a
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND e.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR e.tipo = _tipo)
        AND e.data_venda >= v_cycle_start AND e.data_venda <= v_cycle_end;

      -- Financial per venda in this month
      FOR rec IN
        SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.preco, e.valor_venda as estoque_valor_venda,
               av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
        FROM atendimentos a
        JOIN estoque e ON e.atendimento_venda_id = a.id
        LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
        WHERE a.situacao = 'vendido'
          AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
          AND e.data_venda IS NOT NULL
          AND (_tipo = 'todos' OR e.tipo = _tipo)
          AND e.data_venda >= v_cycle_start AND e.data_venda <= v_cycle_end
      LOOP
        IF rec.avaliacao_id IS NOT NULL THEN
          DECLARE
            vvr numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.preco, 0);
            qv numeric := COALESCE(rec.quanto_vende, 0);
            vf numeric := COALESCE(rec.valor_fechamento, 0);
            cole numeric; colp numeric; cpl numeric; cpc numeric; crc numeric; cop numeric;
            fr numeric;
          BEGIN
            SELECT COALESCE(SUM(valor_executado),0) INTO cole FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO colp FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO cpl FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
            SELECT COALESCE(SUM(valor_previsto),0) INTO cpc FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
            SELECT COALESCE(SUM(valor_executado),0) INTO crc FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
            SELECT COALESCE(SUM(co.valor),0) INTO cop FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id=co.contrato_consignante_id WHERE cc.atendimento_id=rec.atend_id AND lower(co.responsavel)='loja';

            v_faturamento := v_faturamento + vvr;
            v_total_qv := v_total_qv + qv;
            v_margem_prevista := v_margem_prevista + (qv - vf);
            fr := vvr + (cpc - crc) + (colp - cole);
            v_faturamento_real := v_faturamento_real + fr;
            v_margem_realizada := v_margem_realizada + (fr - (vf + 445 + cole + cpl + cop));
          END;
        END IF;
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

    v_start := v_start + interval '1 month';
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- AVALIAÇÕES KPIs
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint;
  v_convertidas bigint; v_retiradas bigint; v_entrada_direta bigint; v_troca bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_aquisicoes
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IS NOT NULL
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_proprias
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IN ('propria', 'test-ride', 'repasse')
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_consignadas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'consignada'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

  SELECT count(*) INTO v_convertidas
  FROM avaliacoes av
  JOIN atendimentos a ON a.id = av.atendimento_id
  WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'convertida'
    AND a.interesse IN ('trocar', 'vender')
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR av.created_at >= _date_from)
    AND (_date_to IS NULL OR av.created_at <= _date_to);

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
$$;

-- ============================================================
-- AVALIAÇÕES POR AVALIADOR
-- ============================================================
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
BEGIN
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
    BEGIN
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id AND av.situacao != 'sem_avaliar'
        AND a.interesse IN ('trocar', 'vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_trocar
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id AND av.tipo_aquisicao IS NOT NULL AND av.situacao != 'sem_avaliar'
        AND a.interesse = 'trocar'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      SELECT count(*) INTO v_aq_vender
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.avaliador_id = v.avaliador_id AND av.tipo_aquisicao IS NOT NULL AND av.situacao != 'sem_avaliar'
        AND a.interesse = 'vender'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND (_date_from IS NULL OR av.created_at >= _date_from)
        AND (_date_to IS NULL OR av.created_at <= _date_to);

      IF v_avaliacoes > 0 THEN
        result := result || jsonb_build_object(
          'nome', COALESCE(v.nome, 'Desconhecido'),
          'avaliacoes', v_avaliacoes,
          'aqTrocar', v_aq_trocar,
          'aqVender', v_aq_vender
        );
      END IF;
    END;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- AVALIAÇÕES MENSAL
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_mensal(
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IS NOT NULL AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

      SELECT count(*) INTO v_proprias
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao IN ('propria','convertida','test-ride','repasse') AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

      SELECT count(*) INTO v_consignadas
      FROM avaliacoes av JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao != 'sem_avaliar' AND av.tipo_aquisicao = 'consignada' AND a.interesse IN ('trocar','vender')
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND av.created_at >= v_cs AND av.created_at <= v_ce;

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
$$;

-- ============================================================
-- ESTOQUE KPIs
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN (
    WITH active AS (
      SELECT * FROM estoque WHERE status IN ('disponivel','indisponivel','servico','bloqueio_juridico')
    ),
    stats AS (
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='indisponivel') as qtd_indisponivel,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='indisponivel'), 0) as soma_indisponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='indisponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='indisponivel')) ELSE 0 END as media_dias_indisponivel,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_now - created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes WHERE situacao = 'adquirida'
    )
    SELECT jsonb_build_object(
      'total', s.total,
      'mediaDias', s.media_dias,
      'disponivel', jsonb_build_object('qtd', s.qtd_disponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_disponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_disponivel,2), 'mediaDias', s.media_dias_disponivel),
      'bloqueio', jsonb_build_object('qtd', s.qtd_bloqueio, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_bloqueio::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_bloqueio,2), 'mediaDias', s.media_dias_bloqueio),
      'indisponivel', jsonb_build_object('qtd', s.qtd_indisponivel, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_indisponivel::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_indisponivel,2), 'mediaDias', s.media_dias_indisponivel),
      'servico', jsonb_build_object('qtd', s.qtd_servico, 'pct', CASE WHEN s.total>0 THEN round(s.qtd_servico::numeric/s.total*100,1) ELSE 0 END, 'soma', round(s.soma_servico,2), 'mediaDias', s.media_dias_servico),
      'qtdPreparacao', p.qtd,
      'somaQuantoPede', round(p.soma_quanto_pede,2),
      'mediaDiasPrep', p.media_dias,
      'patrimonioDisponivel', round(s.soma_disponivel,2),
      'patrimonioParado', round(s.soma_bloqueio + s.soma_indisponivel + s.soma_servico,2)
    )
    FROM stats s, prep p
  );
END;
$$;

-- ============================================================
-- ESTOQUE MENSAL
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============================================================
-- VENDEDOR KPIs (for a specific user)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_kpis(
  _user_id uuid,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atend bigint; v_vendas bigint; v_sinais bigint;
BEGIN
  SELECT count(*) INTO v_atend
  FROM atendimentos a
  WHERE a.vendedor_id = _user_id
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND (_date_from IS NULL OR a.created_at >= _date_from)
    AND (_date_to IS NULL OR a.created_at <= _date_to);

  SELECT count(DISTINCT a.id) INTO v_vendas
  FROM atendimentos a
  JOIN estoque e ON e.atendimento_venda_id = a.id
  WHERE a.vendedor_id = _user_id AND a.situacao = 'vendido'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
    AND e.data_venda IS NOT NULL
    AND (_date_from IS NULL OR e.data_venda >= _date_from)
    AND (_date_to IS NULL OR e.data_venda <= _date_to);

  SELECT count(*) INTO v_sinais
  FROM atendimentos a
  WHERE a.vendedor_id = _user_id AND a.situacao = 'sinal'
    AND (_loja = 'todos' OR norm_loja(a.loja) = _loja);

  RETURN jsonb_build_object(
    'qtdAtendimentos', v_atend,
    'qtdVendas', v_vendas,
    'qtdSinais', v_sinais,
    'taxaConversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END
  );
END;
$$;

-- ============================================================
-- VENDEDOR EQUIPE (all vendedores)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_equipe(
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
BEGIN
  FOR v IN
    SELECT ur.user_id, ur.nome FROM user_roles ur WHERE ur.role = 'vendedor'
  LOOP
    DECLARE
      v_atend bigint; v_vendas bigint; v_sinais bigint;
    BEGIN
      SELECT count(*) INTO v_atend
      FROM atendimentos a
      WHERE a.vendedor_id = v.user_id
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND (_date_from IS NULL OR a.created_at >= _date_from)
        AND (_date_to IS NULL OR a.created_at <= _date_to);

      SELECT count(DISTINCT a.id) INTO v_vendas
      FROM atendimentos a
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.vendedor_id = v.user_id AND a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND e.data_venda IS NOT NULL
        AND (_date_from IS NULL OR e.data_venda >= _date_from)
        AND (_date_to IS NULL OR e.data_venda <= _date_to);

      SELECT count(*) INTO v_sinais
      FROM atendimentos a
      WHERE a.vendedor_id = v.user_id AND a.situacao = 'sinal'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja);

      IF v_atend > 0 OR v_vendas > 0 OR v_sinais > 0 THEN
        result := result || jsonb_build_object(
          'nome', v.nome,
          'atendimentos', v_atend,
          'vendas', v_vendas,
          'sinais', v_sinais,
          'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END
        );
      END IF;
    END;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- VENDEDOR MENSAL (for a specific user)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_mensal(
  _user_id uuid,
  _loja text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      v_atend bigint; v_vendas bigint;
    BEGIN
      SELECT count(*) INTO v_atend
      FROM atendimentos a
      WHERE a.vendedor_id = _user_id
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND a.created_at >= v_cs AND a.created_at <= v_ce;

      SELECT count(DISTINCT a.id) INTO v_vendas
      FROM atendimentos a
      JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.vendedor_id = _user_id AND a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
        AND e.data_venda IS NOT NULL
        AND e.data_venda >= v_cs AND e.data_venda <= v_ce;

      result := result || jsonb_build_object(
        'label', v_label,
        'atendimentos', v_atend,
        'vendas', v_vendas,
        'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END
      );
    END;

    v_start := v_start + interval '1 month';
  END LOOP;

  RETURN result;
END;
$$;
