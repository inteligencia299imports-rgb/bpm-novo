CREATE OR REPLACE FUNCTION public._debug_aquisicoes_tipos(_date_from timestamptz, _date_to timestamptz)
RETURNS TABLE(tipo text, total bigint, in_window_by_created bigint, in_window_by_updated bigint, in_window_by_sh bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(av.tipo_aquisicao,'(null)') AS tipo,
    count(*) AS total,
    count(*) FILTER (WHERE av.created_at BETWEEN _date_from AND _date_to),
    count(*) FILTER (WHERE av.updated_at BETWEEN _date_from AND _date_to),
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM status_history sh WHERE sh.entity_id=av.id AND sh.entity_type='avaliacao' AND sh.status='adquirida' AND sh.created_at BETWEEN _date_from AND _date_to))
  FROM avaliacoes av JOIN atendimentos a ON a.id=av.atendimento_id
  WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender') AND av.avaliador_id IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC;
$$;