-- LIBERAÇÃO DA BIN vira etapa normal do pós-venda 0km (check + data/hora,
-- gravada em pos_venda_processos). O estoque passa a só ler: o trigger abaixo
-- espelha a etapa em estoque_motos_novas.bin_liberada / bin_liberada_em.
-- Pedido do usuário, 2026-11-12. Idempotente.

ALTER TABLE public.estoque_motos_novas
  ADD COLUMN IF NOT EXISTS bin_liberada_em timestamptz;

COMMENT ON COLUMN public.estoque_motos_novas.bin_liberada_em IS
  'Data/hora da liberação da BIN — espelho da etapa LIBERAÇÃO DA BIN do pós-venda (trigger trg_pos_venda_bin_sync).';

CREATE OR REPLACE FUNCTION public.pos_venda_bin_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento uuid;
  v_liberada boolean;
  v_em timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.etapa IS DISTINCT FROM 'LIBERAÇÃO DA BIN' THEN RETURN NULL; END IF;
    v_atendimento := OLD.atendimento_id;
    v_liberada := false;
    v_em := NULL;
  ELSE
    IF NEW.etapa IS DISTINCT FROM 'LIBERAÇÃO DA BIN' THEN RETURN NULL; END IF;
    v_atendimento := NEW.atendimento_id;
    v_liberada := coalesce(NEW.concluida, false);
    v_em := CASE WHEN v_liberada THEN coalesce(NEW.data_conclusao, now()) ELSE NULL END;
  END IF;

  UPDATE public.estoque_motos_novas e
     SET bin_liberada = v_liberada,
         bin_liberada_em = v_em
   WHERE e.id::text IN (
     SELECT mi.estoque_moto_id
       FROM public.motos_interesse mi
      WHERE mi.atendimento_id = v_atendimento
        AND mi.estoque_tipo = '0km'
        AND mi.estoque_moto_id IS NOT NULL
   )
     AND (e.bin_liberada IS DISTINCT FROM v_liberada OR e.bin_liberada_em IS DISTINCT FROM v_em);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_venda_bin_sync ON public.pos_venda_processos;
CREATE TRIGGER trg_pos_venda_bin_sync
  AFTER INSERT OR UPDATE OF concluida, data_conclusao, etapa OR DELETE
  ON public.pos_venda_processos
  FOR EACH ROW EXECUTE FUNCTION public.pos_venda_bin_sync();

NOTIFY pgrst, 'reload schema';
