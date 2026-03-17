-- Allow all authenticated users to read user_roles (needed to display avaliador names)
CREATE POLICY "Avaliadores can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'avaliador'::app_role));

-- Allow vendedores to see avaliador names
CREATE POLICY "All authenticated can view names"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

-- Drop the now-redundant policies
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Gestores can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Avaliadores can view all roles" ON public.user_roles;