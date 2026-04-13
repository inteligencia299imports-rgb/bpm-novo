
CREATE TABLE public.respostas_nps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atendimento_id uuid NOT NULL,
  data_resposta timestamp with time zone NOT NULL DEFAULT now(),
  atendimento text,
  outros_setores text,
  produto text,
  experiencia text,
  nps text,
  melhorias text,
  espaco_livre text,
  origem text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.respostas_nps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view respostas_nps"
ON public.respostas_nps FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Gestor insere respostas_nps"
ON public.respostas_nps FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'secretaria'::app_role));

CREATE POLICY "Gestor atualiza respostas_nps"
ON public.respostas_nps FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor deleta respostas_nps"
ON public.respostas_nps FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role));
