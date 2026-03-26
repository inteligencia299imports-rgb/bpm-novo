-- Add 'secretaria' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretaria';

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  entity_id uuid,
  entity_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users see own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- System can insert notifications for any user (via security definer function)
CREATE POLICY "Insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Function to notify all users with a specific role
CREATE OR REPLACE FUNCTION public.notify_role(_role app_role, _title text, _message text, _entity_id uuid DEFAULT NULL, _entity_type text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, entity_id, entity_type)
  SELECT ur.user_id, _title, _message, _entity_id, _entity_type
  FROM public.user_roles ur
  WHERE ur.role = _role;
END;
$$;