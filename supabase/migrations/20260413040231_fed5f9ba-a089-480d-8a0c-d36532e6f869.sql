
CREATE OR REPLACE FUNCTION public.relatorio_vendedor_equipe(_date_from timestamp with time zone DEFAULT NULL, _date_to timestamp with time zone DEFAULT NULL, _loja text DEFAULT 'todos')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur
  LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos a WHERE a.vendedor_id = v.user_id AND (_loja = 'todos' OR norm_loja(a.loja) = _loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos a LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id = v.user_id AND a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(a.loja) = _loja) AND COALESCE(e.data_venda, a.data_venda) IS NOT NULL AND (_date_from IS NULL OR COALESCE(e.data_venda, a.data_venda) >= _date_from) AND (_date_to IS NULL OR COALESCE(e.data_venda, a.data_venda) <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos a WHERE a.vendedor_id = v.user_id AND a.situacao = 'sinal' AND (_loja = 'todos' OR norm_loja(a.loja) = _loja);
      IF v_atend > 0 OR v_vendas > 0 OR v_sinais > 0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$$;
