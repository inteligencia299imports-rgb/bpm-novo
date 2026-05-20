-- 1) Migrar dados existentes
UPDATE public.estoque SET status = 'servico' WHERE status = 'indisponivel';

-- 2) Atualizar RPC: relatorio_estoque_kpis (parameterized)
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis(
  p_cutoff timestamptz DEFAULT now(),
  p_loja text DEFAULT 'todos',
  p_tipo text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := COALESCE(p_cutoff, now());
  v_loja   text := COALESCE(NULLIF(trim(p_loja), ''), 'todos');
  v_tipo   text := COALESCE(NULLIF(trim(p_tipo), ''), 'todos');
BEGIN
  RETURN (
    WITH active AS (
      SELECT *
      FROM estoque
      WHERE status IN ('disponivel','servico','bloqueio_juridico')
        AND data_entrada <= v_cutoff
        AND (data_venda IS NULL OR data_venda > v_cutoff)
        AND (v_tipo = 'todos' OR COALESCE(tipo,'propria') = v_tipo)
        AND (
          v_loja = 'todos'
          OR (v_loja = 'Brasília'      AND loja IN ('299i','299s','Aventura','Ducati BSB'))
          OR (v_loja = 'Florianópolis' AND loja IN ('299f','Ducati FLN'))
          OR (v_loja = 'Porto Alegre'  AND loja IN ('299p','Ducati POA'))
          OR lower(coalesce(loja,'')) = lower(v_loja)
        )
    ),
    stats AS (
      SELECT
        count(*) as total,
        COALESCE(SUM(preco), 0) as soma_total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes
      WHERE situacao IN ('adquirida','estoque')
        AND COALESCE(preparacao_status, 'em_aberto') IN ('em_aberto','pendente','oficina','servico_externo')
    )
    SELECT jsonb_build_object(
      'total', stats.total,
      'somaTotal', stats.soma_total,
      'mediaDias', stats.media_dias,
      'disponivel', jsonb_build_object(
        'qtd', stats.qtd_disponivel,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_disponivel::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_disponivel,
        'mediaDias', stats.media_dias_disponivel
      ),
      'bloqueio', jsonb_build_object(
        'qtd', stats.qtd_bloqueio,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_bloqueio::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_bloqueio,
        'mediaDias', stats.media_dias_bloqueio
      ),
      'servico', jsonb_build_object(
        'qtd', stats.qtd_servico,
        'pct', CASE WHEN stats.total > 0 THEN round((stats.qtd_servico::numeric / stats.total) * 100, 1) ELSE 0 END,
        'soma', stats.soma_servico,
        'mediaDias', stats.media_dias_servico
      ),
      'qtdPreparacao', prep.qtd,
      'somaQuantoPede', prep.soma_quanto_pede,
      'mediaDiasPrep', prep.media_dias,
      'patrimonioDisponivel', stats.soma_disponivel,
      'patrimonioParado', stats.soma_bloqueio + stats.soma_servico
    )
    FROM stats, prep
  );
END;
$function$;

-- 3) Atualizar RPC mensal: substituir 'indisponivel' por 'servico'
CREATE OR REPLACE FUNCTION public.relatorio_estoque_mensal(
  p_cutoff timestamptz DEFAULT now(),
  p_loja text DEFAULT 'todos',
  p_tipo text DEFAULT 'todos'
)
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
    WHERE status IN ('disponivel','servico','bloqueio_juridico','vendido')
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