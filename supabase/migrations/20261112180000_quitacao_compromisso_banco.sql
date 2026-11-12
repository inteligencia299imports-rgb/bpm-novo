-- Quitação da moto como compromisso SEPARADO, no nome do banco / administradora
-- de consórcio (pedido do usuário, 2026-11-12). Idempotente.
--  1) avaliacoes.quitacao_instituicao_id: banco/consórcio da quitação
--     (clientes_fornecedores; lista = instituições de Financiamento + Consórcio
--     em formas_pagamento_instituicoes). Obrigatório quando há valor de quitação
--     (validado nas telas).
--  2) O compromisso da quitação (origem 'quitacao', avaliacao_id) usa o mesmo
--     plano de contas / centro de custo do compromisso da moto; o trigger abaixo
--     copia quando o da moto muda (compra/troca pela avaliação, consignante pela
--     venda da moto consignada).

ALTER TABLE public.avaliacoes
  ADD COLUMN IF NOT EXISTS quitacao_instituicao_id uuid REFERENCES public.clientes_fornecedores(id);

COMMENT ON COLUMN public.avaliacoes.quitacao_instituicao_id IS
  'Banco / administradora de consórcio da quitação (fornecedor do compromisso origem=quitacao).';

CREATE OR REPLACE FUNCTION public.compromisso_quitacao_sync_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status_compromisso IN ('cancelado', 'cancelada') THEN
    RETURN NULL;
  END IF;

  IF NEW.origem IN ('compra', 'troca') AND NEW.avaliacao_id IS NOT NULL THEN
    UPDATE public.compromissos q
       SET plano_conta_id = NEW.plano_conta_id,
           centro_custo_id = NEW.centro_custo_id
     WHERE q.origem = 'quitacao'
       AND q.avaliacao_id = NEW.avaliacao_id
       AND q.deleted_at IS NULL
       AND (q.plano_conta_id IS DISTINCT FROM NEW.plano_conta_id OR q.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id);
  ELSIF NEW.origem = 'consignante' AND NEW.atendimento_id IS NOT NULL THEN
    UPDATE public.compromissos q
       SET plano_conta_id = NEW.plano_conta_id,
           centro_custo_id = NEW.centro_custo_id
     WHERE q.origem = 'quitacao'
       AND q.deleted_at IS NULL
       AND q.avaliacao_id IN (SELECT em.avaliacao_id FROM public.estoque_motos em WHERE em.atendimento_venda_id = NEW.atendimento_id)
       AND (q.plano_conta_id IS DISTINCT FROM NEW.plano_conta_id OR q.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_compromisso_quitacao_plano ON public.compromissos;
CREATE TRIGGER trg_compromisso_quitacao_plano
  AFTER INSERT OR UPDATE OF plano_conta_id, centro_custo_id ON public.compromissos
  FOR EACH ROW
  WHEN (NEW.origem IN ('compra', 'troca', 'consignante'))
  EXECUTE FUNCTION public.compromisso_quitacao_sync_plano();

NOTIFY pgrst, 'reload schema';
