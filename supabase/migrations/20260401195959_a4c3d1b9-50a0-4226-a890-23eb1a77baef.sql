
-- Add flag column
ALTER TABLE public.user_roles ADD COLUMN recebe_notif_consulta boolean NOT NULL DEFAULT false;

-- Set flag for Mônica and Júlia
UPDATE public.user_roles SET recebe_notif_consulta = true
WHERE user_id IN ('8f3fe25f-9b08-4cfc-acba-b5739540b922', 'e04873ba-28fb-4a4f-9209-04cc3ced1731');

-- Create dedicated function for consultation notifications
CREATE OR REPLACE FUNCTION public.notify_consulta(_title text, _message text, _entity_id uuid DEFAULT NULL, _entity_type text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, entity_id, entity_type)
  SELECT ur.user_id, _title, _message, _entity_id, _entity_type
  FROM public.user_roles ur
  WHERE ur.recebe_notif_consulta = true;
END;
$$;
