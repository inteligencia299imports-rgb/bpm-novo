DELETE FROM public.status_history sh
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY entity_type, entity_id, status
      ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM public.status_history
  ) t WHERE t.rn > 1
) dup
WHERE sh.id = dup.id;