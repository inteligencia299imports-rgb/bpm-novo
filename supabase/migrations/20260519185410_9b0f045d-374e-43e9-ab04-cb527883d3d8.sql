
-- KPIs com filtros loja/tipo
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
  v_loja text := COALESCE(NULLIF(trim(p_loja),''), 'todos');
  v_tipo text := COALESCE(NULLIF(trim(p_tipo),''), 'todos');
BEGIN
  RETURN (
    WITH active AS (
      SELECT *
      FROM estoque
      WHERE status IN ('disponivel','indisponivel','servico','bloqueio_juridico')
        AND data_entrada <= v_cutoff
        AND (data_venda IS NULL OR data_venda > v_cutoff)
        AND (
          v_loja = 'todos'
          OR (v_loja = '299' AND upper(coalesce(empresa,'')) NOT LIKE '%DUCATI%')
          OR (v_loja = 'Ducati' AND upper(coalesce(empresa,'')) LIKE '%DUCATI%')
          OR upper(coalesce(empresa,'')) = upper(v_loja)
        )
        AND (v_tipo = 'todos' OR coalesce(tipo,'propria') = v_tipo)
    ),
    stats AS (
      SELECT
        count(*) as total,
        COALESCE(SUM(preco), 0) as soma_total,
        count(*) FILTER (WHERE status='disponivel') as qtd_disponivel,
        count(*) FILTER (WHERE status='bloqueio_juridico') as qtd_bloqueio,
        count(*) FILTER (WHERE status='indisponivel') as qtd_indisponivel,
        count(*) FILTER (WHERE status='servico') as qtd_servico,
        COALESCE(SUM(preco) FILTER (WHERE status='disponivel'), 0) as soma_disponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='bloqueio_juridico'), 0) as soma_bloqueio,
        COALESCE(SUM(preco) FILTER (WHERE status='indisponivel'), 0) as soma_indisponivel,
        COALESCE(SUM(preco) FILTER (WHERE status='servico'), 0) as soma_servico,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400))) ELSE 0 END as media_dias,
        CASE WHEN count(*) FILTER (WHERE status='disponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='disponivel')) ELSE 0 END as media_dias_disponivel,
        CASE WHEN count(*) FILTER (WHERE status='bloqueio_juridico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='bloqueio_juridico')) ELSE 0 END as media_dias_bloqueio,
        CASE WHEN count(*) FILTER (WHERE status='indisponivel') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='indisponivel')) ELSE 0 END as media_dias_indisponivel,
        CASE WHEN count(*) FILTER (WHERE status='servico') > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM v_cutoff - data_entrada)/86400)) FILTER (WHERE status='servico')) ELSE 0 END as media_dias_servico
      FROM active
    ),
    prep AS (
      SELECT
        count(*) as qtd,
        COALESCE(SUM(av.quanto_pede), 0) as soma_quanto_pede,
        CASE WHEN count(*) > 0 THEN round(AVG(GREATEST(0, EXTRACT(epoch FROM now() - av.created_at)/86400))) ELSE 0 END as media_dias
      FROM avaliacoes av
      JOIN atendimentos a ON a.id = av.atendimento_id
      WHERE av.situacao IN ('adquirida','estoque')
        AND COALESCE(av.preparacao_status, 'em_aberto') IN (
          'em_aberto','pendente','oficina','servico_externo',
          'aguardando_aceite','aguardando_liberacao_estoque'
        )
        AND (
          v_loja = 'todos'
          OR norm_loja(a.loja) = v_loja
          OR lower(a.loja) = lower(v_loja)
        )
        AND (
          v_tipo = 'todos'
          OR lower(coalesce(av.tipo_aquisicao,'propria')) = lower(v_tipo)
          OR (v_tipo = 'propria' AND lower(coalesce(av.tipo_aquisicao,'propria')) IN ('propria','própria','convertida','repasse','test-ride','test ride'))
          OR (v_tipo = 'consignada' AND lower(coalesce(av.tipo_aquisicao,'')) IN ('consignada','consignacao','consignação'))
        )
    )
    SELECT jsonb_build_object(
      'total', s.total,
      'mediaDias', s.media_dias,
      'somaTotal', round(s.soma_total,2),
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
$function$;


-- Mensal com filtros loja/tipo
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
      SELECT count(*) INTO v_entradas
        FROM estoque
        WHERE data_entrada >= v_cs AND data_entrada <= v_ce
          AND (v_loja='todos'
            OR (v_loja='299' AND upper(coalesce(empresa,'')) NOT LIKE '%DUCATI%')
            OR (v_loja='Ducati' AND upper(coalesce(empresa,'')) LIKE '%DUCATI%')
            OR upper(coalesce(empresa,''))=upper(v_loja))
          AND (v_tipo='todos' OR coalesce(tipo,'propria')=v_tipo);

      SELECT count(*) INTO v_saidas
        FROM estoque
        WHERE data_venda IS NOT NULL AND data_venda >= v_cs AND data_venda <= v_ce
          AND (v_loja='todos'
            OR (v_loja='299' AND upper(coalesce(empresa,'')) NOT LIKE '%DUCATI%')
            OR (v_loja='Ducati' AND upper(coalesce(empresa,'')) LIKE '%DUCATI%')
            OR upper(coalesce(empresa,''))=upper(v_loja))
          AND (v_tipo='todos' OR coalesce(tipo,'propria')=v_tipo);

      SELECT count(*) INTO v_disponiveis
        FROM estoque
        WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce)
          AND (v_loja='todos'
            OR (v_loja='299' AND upper(coalesce(empresa,'')) NOT LIKE '%DUCATI%')
            OR (v_loja='Ducati' AND upper(coalesce(empresa,'')) LIKE '%DUCATI%')
            OR upper(coalesce(empresa,''))=upper(v_loja))
          AND (v_tipo='todos' OR coalesce(tipo,'propria')=v_tipo);

      SELECT COALESCE(SUM(preco),0) INTO v_patrimonio
        FROM estoque
        WHERE data_entrada <= v_ce AND (data_venda IS NULL OR data_venda > v_ce)
          AND (v_loja='todos'
            OR (v_loja='299' AND upper(coalesce(empresa,'')) NOT LIKE '%DUCATI%')
            OR (v_loja='Ducati' AND upper(coalesce(empresa,'')) LIKE '%DUCATI%')
            OR upper(coalesce(empresa,''))=upper(v_loja))
          AND (v_tipo='todos' OR coalesce(tipo,'propria')=v_tipo);

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
