
INSERT INTO public.status_history (entity_type, entity_id, status, changed_by_name, created_at, observacoes)
SELECT 
  'avaliacao',
  a.id,
  'adquirida',
  'Sistema (Backfill)',
  COALESCE(e.data_entrada, a.updated_at),
  'Registro criado automaticamente via backfill para corrigir data de aquisição'
FROM public.avaliacoes a
LEFT JOIN public.estoque e ON e.avaliacao_id = a.id
WHERE a.situacao IN ('adquirida','estoque')
  AND NOT EXISTS (
    SELECT 1 FROM public.status_history sh
    WHERE sh.entity_type='avaliacao'
      AND sh.entity_id=a.id
      AND sh.status='adquirida'
  );
