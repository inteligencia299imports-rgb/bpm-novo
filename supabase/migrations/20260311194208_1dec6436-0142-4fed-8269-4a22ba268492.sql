
-- Tabela de marcas
CREATE TABLE public.marcas_motos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marcas_motos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados veem marcas" ON public.marcas_motos
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestor gerencia marcas" ON public.marcas_motos
FOR ALL TO authenticated USING (has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

-- Tabela de modelos
CREATE TABLE public.modelos_motos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas_motos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(marca_id, nome)
);

ALTER TABLE public.modelos_motos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados veem modelos" ON public.modelos_motos
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestor gerencia modelos" ON public.modelos_motos
FOR ALL TO authenticated USING (has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));
