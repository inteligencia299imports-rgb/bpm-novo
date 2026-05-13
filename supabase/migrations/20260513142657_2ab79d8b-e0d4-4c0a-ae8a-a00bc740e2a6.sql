REVOKE EXECUTE ON FUNCTION public.relatorio_showroom_mensal(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.relatorio_showroom_mensal(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.relatorio_showroom_mensal(text, text) TO authenticated;