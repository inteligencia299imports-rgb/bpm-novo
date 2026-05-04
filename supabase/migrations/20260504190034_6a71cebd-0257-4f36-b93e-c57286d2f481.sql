REVOKE EXECUTE ON FUNCTION public.relatorio_showroom_sinais(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.relatorio_showroom_sinais(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_showroom_sinais(text, text) TO authenticated;