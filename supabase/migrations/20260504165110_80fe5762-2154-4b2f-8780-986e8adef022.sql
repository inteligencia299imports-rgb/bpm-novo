CREATE OR REPLACE FUNCTION public.relatorio_showroom_sinais(_loja text DEFAULT 'todos'::text, _tipo text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '[]'::jsonb;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      a.nome_cliente, a.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(a.loja) = 'Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa, '-') as placa,
      a.created_at as data_sinal,
      av.quanto_vende, av.valor_fechamento,
      a.valor_venda as atend_valor_venda, e.valor_venda as estoque_valor_venda, e.preco as estoque_preco,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM atendimentos a
    LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id LIMIT 1) mi ON true
    WHERE a.situacao = 'sinal'
      AND (_loja = 'todos' OR norm_loja(a.loja) = _loja)
      AND (_tipo = 'todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(a.loja) = 'Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
    ORDER BY a.created_at DESC
  LOOP
    DECLARE
      v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0);
      v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0;
      v_custo_processo_loja numeric := 0; v_custo_prev_cliente numeric := 0;
      v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric;
      v_abatimentos numeric; v_margem_realizada numeric;
      v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto), 0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
        SELECT COALESCE(SUM(valor_executado), 0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor), 0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel) = 'loja';
      v_taxa_fixa := CASE WHEN rec.tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object(
        'nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome, '-'),
        'loja', rec.loja, 'tipo', rec.tipo, 'modelo', rec.modelo, 'placa', COALESCE(rec.placa, '-'),
        'dataSinal', rec.data_sinal,
        'quantoVende', round(v_quanto_vende, 2), 'valorFechamento', round(v_valor_fechamento, 2),
        'margemPrevista', round(v_margem_prevista, 2),
        'pctMargemPrevista', CASE WHEN v_quanto_vende > 0 THEN round(v_margem_prevista / v_quanto_vende, 4) ELSE 0 END,
        'valorVenda', round(v_valor_venda_real, 2), 'margemOficina', round(v_margem_oficina, 2),
        'abatimentos', round(v_abatimentos, 2),
        'margemRealizada', round(v_margem_realizada, 2),
        'pctMargemRealizada', CASE WHEN v_fat_real > 0 THEN round(v_margem_realizada / v_fat_real, 4) ELSE 0 END
      );
    END;
  END LOOP;
  RETURN result;
END;
$function$;