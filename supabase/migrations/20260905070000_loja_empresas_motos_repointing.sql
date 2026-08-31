-- Re-de-para das lojas de motos (sistema='motos'):
-- MMATOS passa a operar 299i, 299s e Aventura; FAG fica só com Ducati BSB.
-- Só toca linhas sistema='motos' (equipamentos/oficina das mesmas lojas ficam intactas).

update public.loja_empresas
set empresa_id = 'd3a6370f-31fa-465c-8ff2-8a0dd1f310b0', updated_at = now()   -- MMATOS
where sistema = 'motos' and loja in ('299i', '299s', 'Aventura');
