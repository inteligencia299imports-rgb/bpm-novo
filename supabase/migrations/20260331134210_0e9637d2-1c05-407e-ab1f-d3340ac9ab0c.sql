
-- Rename status_to to status
ALTER TABLE public.status_history RENAME COLUMN status_to TO status;

-- Drop status_from column
ALTER TABLE public.status_history DROP COLUMN status_from;
