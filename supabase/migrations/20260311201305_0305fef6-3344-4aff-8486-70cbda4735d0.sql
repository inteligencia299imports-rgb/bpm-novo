
CREATE TABLE public.estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_avaliacao_id uuid REFERENCES public.motos_avaliacao(id) ON DELETE SET NULL,
  avaliacao_id uuid REFERENCES public.avaliacoes(id) ON DELETE SET NULL,
  atendimento_venda_id uuid REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'propria',
  marca text NOT NULL,
  categoria text,
  modelo text NOT NULL,
  cor text,
  cilindrada text,
  placa text,
  ano_fabricacao text,
  ano_modelo text,
  km text,
  preco numeric,
  preco_acao numeric,
  empresa text,
  status text NOT NULL DEFAULT 'disponivel',
  observacoes text,
  data_entrada timestamp with time zone NOT NULL DEFAULT now(),
  data_venda timestamp with time zone,
  valor_venda numeric,
  valor_sinal numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver o estoque
CREATE POLICY "Autenticados veem estoque"
ON public.estoque FOR SELECT TO authenticated
USING (true);

-- Gestor gerencia estoque (insert, update, delete)
CREATE POLICY "Gestor gerencia estoque"
ON public.estoque FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

-- Avaliador pode inserir no estoque (quando adquire moto)
CREATE POLICY "Avaliador insere estoque"
ON public.estoque FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'avaliador'::app_role));

-- Avaliador pode atualizar estoque
CREATE POLICY "Avaliador atualiza estoque"
ON public.estoque FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'avaliador'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_estoque_updated_at
  BEFORE UPDATE ON public.estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
