
CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        COALESCE(SUM(preco), 0) as soma_total,
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
      FROM avaliacoes
      WHERE situacao IN ('adquirida','estoque')
        AND COALESCE(preparacao_status, 'em_aberto') IN ('em_aberto','pendente','oficina','servico_externo','aguardando_aceite','aguardando_liberacao_estoque')
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
