-- 1) Restaurar has_role do BPM 299 (assinatura distinta da do outro projeto)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) Garantir helpers usadas em policies
CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao(_atendimento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.avaliacoes WHERE atendimento_id = _atendimento_id);
$$;

CREATE OR REPLACE FUNCTION public.atendimento_has_avaliacao_preparacao(_atendimento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.avaliacoes
    WHERE atendimento_id = _atendimento_id
      AND situacao IN ('adquirida','estoque')
  );
$$;

CREATE OR REPLACE FUNCTION public.moto_has_avaliacao_preparacao(_moto_avaliacao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.avaliacoes
    WHERE moto_avaliacao_id = _moto_avaliacao_id
      AND situacao IN ('adquirida','estoque')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_contrato_compra(_atendimento_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'avaliador'::public.app_role)
      OR public.has_role(_user_id, 'gestor'::public.app_role)
      OR public.has_role(_user_id, 'secretaria'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = _atendimento_id AND a.vendedor_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_contrato_consignacao(_avaliacao_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'avaliador'::public.app_role)
      OR public.has_role(_user_id, 'gestor'::public.app_role)
      OR public.has_role(_user_id, 'secretaria'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.avaliacoes av
        JOIN public.atendimentos a ON a.id = av.atendimento_id
        WHERE av.id = _avaliacao_id AND a.vendedor_id = _user_id
      );
$$;

-- 3) RLS policies - ATENDIMENTOS
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vendedor vê próprios" ON public.atendimentos;
DROP POLICY IF EXISTS "Vendedor cria" ON public.atendimentos;
DROP POLICY IF EXISTS "Vendedor edita próprio" ON public.atendimentos;
DROP POLICY IF EXISTS "Gestor deleta atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Secretaria vê atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Avaliador vê vinculados" ON public.atendimentos;
DROP POLICY IF EXISTS "Vendedor vê atendimentos preparacao" ON public.atendimentos;

CREATE POLICY "Vendedor vê próprios" ON public.atendimentos FOR SELECT TO authenticated
  USING ((auth.uid() = vendedor_id) OR public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Vendedor cria" ON public.atendimentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = vendedor_id);
CREATE POLICY "Vendedor edita próprio" ON public.atendimentos FOR UPDATE TO authenticated
  USING ((auth.uid() = vendedor_id)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.has_role(auth.uid(), 'avaliador'::public.app_role));
CREATE POLICY "Gestor deleta atendimentos" ON public.atendimentos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Secretaria vê atendimentos" ON public.atendimentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Avaliador vê vinculados" ON public.atendimentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'avaliador'::public.app_role) AND public.atendimento_has_avaliacao(id));
CREATE POLICY "Vendedor vê atendimentos preparacao" ON public.atendimentos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'::public.app_role) AND public.atendimento_has_avaliacao_preparacao(id));

-- 4) RLS policies - AVALIACOES
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Avaliador gestor veem" ON public.avaliacoes;
DROP POLICY IF EXISTS "Vendedor vê próprias avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Vendedor vê avaliacoes em preparacao" ON public.avaliacoes;
DROP POLICY IF EXISTS "Secretaria vê avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Insert avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Update avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "Delete avaliacoes" ON public.avaliacoes;

CREATE POLICY "Avaliador gestor veem" ON public.avaliacoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Vendedor vê próprias avaliacoes" ON public.avaliacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()));
CREATE POLICY "Vendedor vê avaliacoes em preparacao" ON public.avaliacoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'::public.app_role) AND situacao = ANY (ARRAY['adquirida','estoque']));
CREATE POLICY "Secretaria vê avaliacoes" ON public.avaliacoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Insert avaliacoes" ON public.avaliacoes FOR INSERT TO authenticated
  WITH CHECK ((EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()))
    OR public.has_role(auth.uid(), 'avaliador'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Update avaliacoes" ON public.avaliacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'avaliador'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'avaliador'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = avaliacoes.atendimento_id AND a.vendedor_id = auth.uid()));
CREATE POLICY "Delete avaliacoes" ON public.avaliacoes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = avaliacoes.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role))));

-- 5) MOTOS_AVALIACAO
ALTER TABLE public.motos_avaliacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Insert motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Update motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Delete motos avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Secretaria vê motos_avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Secretaria atualiza motos_avaliacao" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Vendedor vê motos no estoque" ON public.motos_avaliacao;
DROP POLICY IF EXISTS "Vendedor vê motos preparacao" ON public.motos_avaliacao;

CREATE POLICY "Acesso motos avaliacao" ON public.motos_avaliacao FOR SELECT TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role))))
    OR public.has_role(auth.uid(), 'avaliador'::public.app_role));
CREATE POLICY "Insert motos avaliacao" ON public.motos_avaliacao FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update motos avaliacao" ON public.motos_avaliacao FOR UPDATE TO authenticated
  USING ((EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role)))) OR public.has_role(auth.uid(), 'avaliador'::public.app_role));
CREATE POLICY "Delete motos avaliacao" ON public.motos_avaliacao FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_avaliacao.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role))));
CREATE POLICY "Secretaria vê motos_avaliacao" ON public.motos_avaliacao FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Secretaria atualiza motos_avaliacao" ON public.motos_avaliacao FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Vendedor vê motos no estoque" ON public.motos_avaliacao FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'::public.app_role) AND EXISTS (SELECT 1 FROM public.estoque e WHERE e.moto_avaliacao_id = motos_avaliacao.id));
CREATE POLICY "Vendedor vê motos preparacao" ON public.motos_avaliacao FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'::public.app_role) AND public.moto_has_avaliacao_preparacao(id));

-- 6) MOTO_FOTOS
ALTER TABLE public.moto_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso fotos" ON public.moto_fotos;
DROP POLICY IF EXISTS "Insert fotos" ON public.moto_fotos;
DROP POLICY IF EXISTS "Delete fotos" ON public.moto_fotos;
DROP POLICY IF EXISTS "Secretaria vê moto_fotos" ON public.moto_fotos;
CREATE POLICY "Acesso fotos" ON public.moto_fotos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.motos_avaliacao ma JOIN public.atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role))));
CREATE POLICY "Insert fotos" ON public.moto_fotos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.motos_avaliacao ma JOIN public.atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Delete fotos" ON public.moto_fotos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.motos_avaliacao ma JOIN public.atendimentos a ON a.id = ma.atendimento_id WHERE ma.id = moto_fotos.moto_avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Secretaria vê moto_fotos" ON public.moto_fotos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'secretaria'::public.app_role));

-- 7) MOTOS_INTERESSE
ALTER TABLE public.motos_interesse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso motos interesse" ON public.motos_interesse;
DROP POLICY IF EXISTS "Insert motos interesse" ON public.motos_interesse;
DROP POLICY IF EXISTS "Update motos interesse" ON public.motos_interesse;
DROP POLICY IF EXISTS "Delete motos interesse" ON public.motos_interesse;
CREATE POLICY "Acesso motos interesse" ON public.motos_interesse FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Insert motos interesse" ON public.motos_interesse FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update motos interesse" ON public.motos_interesse FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Delete motos interesse" ON public.motos_interesse FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = motos_interesse.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 8) CONTRATOS
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoped select contratos" ON public.contratos;
DROP POLICY IF EXISTS "Insert contratos" ON public.contratos;
DROP POLICY IF EXISTS "Update contratos" ON public.contratos;
DROP POLICY IF EXISTS "Avaliador vê contrato compra" ON public.contratos;
DROP POLICY IF EXISTS "Avaliador cria contrato compra" ON public.contratos;
DROP POLICY IF EXISTS "Avaliador edita contrato compra" ON public.contratos;
CREATE POLICY "Scoped select contratos" ON public.contratos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Insert contratos" ON public.contratos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update contratos" ON public.contratos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Avaliador vê contrato compra" ON public.contratos FOR SELECT TO authenticated
  USING (ipva_tipo = 'COMPRA' AND public.can_manage_contrato_compra(atendimento_id, auth.uid()));
CREATE POLICY "Avaliador cria contrato compra" ON public.contratos FOR INSERT TO authenticated
  WITH CHECK (ipva_tipo = 'COMPRA' AND public.can_manage_contrato_compra(atendimento_id, auth.uid()));
CREATE POLICY "Avaliador edita contrato compra" ON public.contratos FOR UPDATE TO authenticated
  USING (ipva_tipo = 'COMPRA' AND public.can_manage_contrato_compra(atendimento_id, auth.uid()))
  WITH CHECK (ipva_tipo = 'COMPRA' AND public.can_manage_contrato_compra(atendimento_id, auth.uid()));

-- 9) CONTRATOS_CONSIGNACAO
ALTER TABLE public.contratos_consignacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoped select contratos_consignacao" ON public.contratos_consignacao;
DROP POLICY IF EXISTS "Insert contratos_consignacao" ON public.contratos_consignacao;
DROP POLICY IF EXISTS "Update contratos_consignacao" ON public.contratos_consignacao;
CREATE POLICY "Scoped select contratos_consignacao" ON public.contratos_consignacao FOR SELECT TO authenticated
  USING (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));
CREATE POLICY "Insert contratos_consignacao" ON public.contratos_consignacao FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));
CREATE POLICY "Update contratos_consignacao" ON public.contratos_consignacao FOR UPDATE TO authenticated
  USING (public.can_manage_contrato_consignacao(avaliacao_id, auth.uid()));

-- 10) CONTRATOS_CONSIGNANTE
ALTER TABLE public.contratos_consignante ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoped select contratos_consignante" ON public.contratos_consignante;
DROP POLICY IF EXISTS "Insert contratos_consignante" ON public.contratos_consignante;
DROP POLICY IF EXISTS "Update contratos_consignante" ON public.contratos_consignante;
CREATE POLICY "Scoped select contratos_consignante" ON public.contratos_consignante FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos_consignante.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Insert contratos_consignante" ON public.contratos_consignante FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos_consignante.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update contratos_consignante" ON public.contratos_consignante FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = contratos_consignante.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 11) FORMAS_PAGAMENTO
ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoped select formas_pagamento" ON public.formas_pagamento;
DROP POLICY IF EXISTS "Insert formas_pagamento" ON public.formas_pagamento;
DROP POLICY IF EXISTS "Update formas_pagamento" ON public.formas_pagamento;
DROP POLICY IF EXISTS "Delete formas_pagamento" ON public.formas_pagamento;
CREATE POLICY "Scoped select formas_pagamento" ON public.formas_pagamento FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c JOIN public.atendimentos a ON a.id = c.atendimento_id WHERE c.id = formas_pagamento.contrato_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Insert formas_pagamento" ON public.formas_pagamento FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos c JOIN public.atendimentos a ON a.id = c.atendimento_id WHERE c.id = formas_pagamento.contrato_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update formas_pagamento" ON public.formas_pagamento FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c JOIN public.atendimentos a ON a.id = c.atendimento_id WHERE c.id = formas_pagamento.contrato_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Delete formas_pagamento" ON public.formas_pagamento FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c JOIN public.atendimentos a ON a.id = c.atendimento_id WHERE c.id = formas_pagamento.contrato_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 12) CUSTOS_OFICINA
ALTER TABLE public.custos_oficina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view custos_oficina" ON public.custos_oficina;
DROP POLICY IF EXISTS "Insert custos_oficina" ON public.custos_oficina;
DROP POLICY IF EXISTS "Update custos_oficina" ON public.custos_oficina;
DROP POLICY IF EXISTS "Delete custos_oficina" ON public.custos_oficina;
CREATE POLICY "Authenticated users can view custos_oficina" ON public.custos_oficina FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert custos_oficina" ON public.custos_oficina FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = custos_oficina.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update custos_oficina" ON public.custos_oficina FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = custos_oficina.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Delete custos_oficina" ON public.custos_oficina FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = custos_oficina.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 13) CUSTOS_OPERACIONAIS
ALTER TABLE public.custos_operacionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view custos_operacionais" ON public.custos_operacionais;
DROP POLICY IF EXISTS "Insert custos_operacionais" ON public.custos_operacionais;
DROP POLICY IF EXISTS "Update custos_operacionais" ON public.custos_operacionais;
DROP POLICY IF EXISTS "Delete custos_operacionais" ON public.custos_operacionais;
CREATE POLICY "Authenticated users can view custos_operacionais" ON public.custos_operacionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert custos_operacionais" ON public.custos_operacionais FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos_consignante cc JOIN public.atendimentos a ON a.id = cc.atendimento_id WHERE cc.id = custos_operacionais.contrato_consignante_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update custos_operacionais" ON public.custos_operacionais FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos_consignante cc JOIN public.atendimentos a ON a.id = cc.atendimento_id WHERE cc.id = custos_operacionais.contrato_consignante_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Delete custos_operacionais" ON public.custos_operacionais FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos_consignante cc JOIN public.atendimentos a ON a.id = cc.atendimento_id WHERE cc.id = custos_operacionais.contrato_consignante_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 14) PROCESSOS
ALTER TABLE public.consignacao_processos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view consignacao_processos" ON public.consignacao_processos;
DROP POLICY IF EXISTS "Insert consignacao_processos" ON public.consignacao_processos;
DROP POLICY IF EXISTS "Update consignacao_processos" ON public.consignacao_processos;
CREATE POLICY "Authenticated users can view consignacao_processos" ON public.consignacao_processos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert consignacao_processos" ON public.consignacao_processos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = consignacao_processos.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update consignacao_processos" ON public.consignacao_processos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = consignacao_processos.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

ALTER TABLE public.pos_compra_processos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view pos_compra_processos" ON public.pos_compra_processos;
DROP POLICY IF EXISTS "Insert pos_compra_processos" ON public.pos_compra_processos;
DROP POLICY IF EXISTS "Update pos_compra_processos" ON public.pos_compra_processos;
CREATE POLICY "Authenticated users can view pos_compra_processos" ON public.pos_compra_processos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert pos_compra_processos" ON public.pos_compra_processos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = pos_compra_processos.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update pos_compra_processos" ON public.pos_compra_processos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id WHERE av.id = pos_compra_processos.avaliacao_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

ALTER TABLE public.pos_venda_processos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view pos_venda_processos" ON public.pos_venda_processos;
DROP POLICY IF EXISTS "Insert pos_venda_processos" ON public.pos_venda_processos;
DROP POLICY IF EXISTS "Update pos_venda_processos" ON public.pos_venda_processos;
CREATE POLICY "Authenticated users can view pos_venda_processos" ON public.pos_venda_processos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert pos_venda_processos" ON public.pos_venda_processos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = pos_venda_processos.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));
CREATE POLICY "Update pos_venda_processos" ON public.pos_venda_processos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = pos_venda_processos.atendimento_id AND (a.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role))));

-- 15) ESTOQUE / MARCAS / MODELOS
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados veem estoque" ON public.estoque;
DROP POLICY IF EXISTS "Gestor gerencia estoque" ON public.estoque;
DROP POLICY IF EXISTS "Avaliador insere estoque" ON public.estoque;
DROP POLICY IF EXISTS "Avaliador atualiza estoque" ON public.estoque;
DROP POLICY IF EXISTS "Vendedor atualiza estoque venda" ON public.estoque;
CREATE POLICY "Autenticados veem estoque" ON public.estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor gerencia estoque" ON public.estoque FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Avaliador insere estoque" ON public.estoque FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Avaliador atualiza estoque" ON public.estoque FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'avaliador'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Vendedor atualiza estoque venda" ON public.estoque FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'vendedor'::public.app_role) AND EXISTS (SELECT 1 FROM public.motos_interesse mi JOIN public.atendimentos a ON a.id = mi.atendimento_id WHERE mi.estoque_moto_id = estoque.id::text AND a.vendedor_id = auth.uid()));

ALTER TABLE public.marcas_motos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados veem marcas" ON public.marcas_motos;
DROP POLICY IF EXISTS "Gestor gerencia marcas" ON public.marcas_motos;
CREATE POLICY "Todos autenticados veem marcas" ON public.marcas_motos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor gerencia marcas" ON public.marcas_motos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

ALTER TABLE public.modelos_motos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados veem modelos" ON public.modelos_motos;
DROP POLICY IF EXISTS "Gestor gerencia modelos" ON public.modelos_motos;
CREATE POLICY "Todos autenticados veem modelos" ON public.modelos_motos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor gerencia modelos" ON public.modelos_motos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

-- 16) NPS / NOTIFICATIONS / OBSERVACOES / STATUS / USER_ROLES
ALTER TABLE public.respostas_nps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view respostas_nps" ON public.respostas_nps;
DROP POLICY IF EXISTS "Gestor insere respostas_nps" ON public.respostas_nps;
DROP POLICY IF EXISTS "Gestor atualiza respostas_nps" ON public.respostas_nps;
DROP POLICY IF EXISTS "Gestor deleta respostas_nps" ON public.respostas_nps;
CREATE POLICY "Authenticated users can view respostas_nps" ON public.respostas_nps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor insere respostas_nps" ON public.respostas_nps FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role) OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "Gestor atualiza respostas_nps" ON public.respostas_nps FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gestor'::public.app_role));
CREATE POLICY "Gestor deleta respostas_nps" ON public.respostas_nps FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.observacoes_processo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view observations" ON public.observacoes_processo;
DROP POLICY IF EXISTS "Insert own observations" ON public.observacoes_processo;
DROP POLICY IF EXISTS "Gestor deletes observations" ON public.observacoes_processo;
CREATE POLICY "Authenticated users can view observations" ON public.observacoes_processo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own observations" ON public.observacoes_processo FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid()::text);
CREATE POLICY "Gestor deletes observations" ON public.observacoes_processo FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view status history" ON public.status_history;
DROP POLICY IF EXISTS "Users can insert own status history" ON public.status_history;
CREATE POLICY "Authenticated users can view status history" ON public.status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own status history" ON public.status_history FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid());

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view names" ON public.user_roles;
CREATE POLICY "All authenticated can view names" ON public.user_roles FOR SELECT TO authenticated USING (true);