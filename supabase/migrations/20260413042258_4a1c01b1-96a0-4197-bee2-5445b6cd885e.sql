-- Remove the text overload that causes PGRST203 ambiguity with the timestamptz version
DROP FUNCTION IF EXISTS public.relatorio_vendedor_equipe(text, text, text);