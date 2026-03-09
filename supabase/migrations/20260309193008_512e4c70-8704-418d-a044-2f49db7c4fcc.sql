
-- Create roles enum
CREATE TYPE public.app_role AS ENUM ('vendedor', 'gestor', 'avaliador');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  loja TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $$;

-- RLS for user_roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Gestores can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'gestor'));

-- Atendimentos table
CREATE TABLE public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES auth.users(id),
  loja TEXT NOT NULL,
  nome_cliente TEXT NOT NULL,
  telefone TEXT NOT NULL,
  sexo TEXT NOT NULL,
  uf TEXT NOT NULL,
  tipo_atendimento TEXT NOT NULL,
  origem TEXT,
  temperatura TEXT,
  observacoes TEXT,
  interesse TEXT NOT NULL CHECK (interesse IN ('comprar', 'vender', 'trocar')),
  situacao TEXT NOT NULL DEFAULT 'em_aberto' CHECK (situacao IN ('em_aberto', 'pendente', 'sinal', 'perdido', 'vendido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

-- Motos de interesse (compra)
CREATE TABLE public.motos_interesse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK (origem IN ('estoque', 'externo')),
  marca TEXT, modelo TEXT, ano TEXT, estoque_moto_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.motos_interesse ENABLE ROW LEVEL SECURITY;

-- Motos para venda/troca
CREATE TABLE public.motos_avaliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  marca TEXT NOT NULL, modelo TEXT NOT NULL,
  ano_fabricacao TEXT, ano_modelo TEXT, categoria TEXT, cor TEXT, placa TEXT, km TEXT,
  observacoes TEXT, enviada_avaliacao BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.motos_avaliacao ENABLE ROW LEVEL SECURITY;

-- Fotos das motos
CREATE TABLE public.moto_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_avaliacao_id UUID NOT NULL REFERENCES public.motos_avaliacao(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.moto_fotos ENABLE ROW LEVEL SECURITY;

-- Avaliações
CREATE TABLE public.avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  moto_avaliacao_id UUID NOT NULL REFERENCES public.motos_avaliacao(id) ON DELETE CASCADE,
  valor_fipe NUMERIC, menor_valor NUMERIC, maior_valor NUMERIC,
  quanto_pede NUMERIC, quanto_vende NUMERIC, quanto_vende_errado NUMERIC,
  avaliacao_consignacao NUMERIC, avaliacao_compra NUMERIC,
  previsao_custos_loja NUMERIC, previsao_custos_cliente NUMERIC,
  negociacao TEXT CHECK (negociacao IN ('compra', 'consignacao')),
  observacao_avaliador TEXT,
  situacao TEXT NOT NULL DEFAULT 'sem_avaliar' CHECK (situacao IN ('sem_avaliar', 'em_aberto', 'adquirida')),
  avaliador_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;

-- Now add all RLS policies (all tables exist)
CREATE POLICY "Vendedor vê próprios" ON public.atendimentos FOR SELECT USING (auth.uid() = vendedor_id OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Avaliador vê vinculados" ON public.atendimentos FOR SELECT USING (public.has_role(auth.uid(), 'avaliador') AND EXISTS (SELECT 1 FROM public.avaliacoes av WHERE av.atendimento_id = id));
CREATE POLICY "Vendedor cria" ON public.atendimentos FOR INSERT WITH CHECK (auth.uid() = vendedor_id);
CREATE POLICY "Vendedor edita próprio" ON public.atendimentos FOR UPDATE USING (auth.uid() = vendedor_id OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Acesso motos interesse" ON public.motos_interesse FOR SELECT USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'))));
CREATE POLICY "Insert motos interesse" ON public.motos_interesse FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND a.vendedor_id = auth.uid()));
CREATE POLICY "Update motos interesse" ON public.motos_interesse FOR UPDATE USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'))));

CREATE POLICY "Acesso motos avaliacao" ON public.motos_avaliacao FOR SELECT USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'))) OR public.has_role(auth.uid(), 'avaliador'));
CREATE POLICY "Insert motos avaliacao" ON public.motos_avaliacao FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND a.vendedor_id = auth.uid()));
CREATE POLICY "Update motos avaliacao" ON public.motos_avaliacao FOR UPDATE USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'))) OR public.has_role(auth.uid(), 'avaliador'));

CREATE POLICY "Acesso fotos" ON public.moto_fotos FOR SELECT USING (EXISTS (SELECT 1 FROM public.motos_avaliacao ma JOIN public.atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'avaliador'))));
CREATE POLICY "Insert fotos" ON public.moto_fotos FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.motos_avaliacao ma JOIN public.atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_avaliacao_id AND a.vendedor_id = auth.uid()));

CREATE POLICY "Avaliador gestor veem" ON public.avaliacoes FOR SELECT USING (public.has_role(auth.uid(), 'avaliador') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Vendedor vê próprias avaliacoes" ON public.avaliacoes FOR SELECT USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND a.vendedor_id = auth.uid()));
CREATE POLICY "Insert avaliacoes" ON public.avaliacoes FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND a.vendedor_id = auth.uid()) OR public.has_role(auth.uid(), 'avaliador'));
CREATE POLICY "Update avaliacoes" ON public.avaliacoes FOR UPDATE USING (public.has_role(auth.uid(), 'avaliador') OR public.has_role(auth.uid(), 'gestor'));

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('moto-fotos', 'moto-fotos', true);
CREATE POLICY "View moto photos" ON storage.objects FOR SELECT USING (bucket_id = 'moto-fotos');
CREATE POLICY "Upload moto photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'moto-fotos' AND auth.role() = 'authenticated');

-- Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_atendimentos_updated_at BEFORE UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_motos_avaliacao_updated_at BEFORE UPDATE ON public.motos_avaliacao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_avaliacoes_updated_at BEFORE UPDATE ON public.avaliacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
