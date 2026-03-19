
CREATE OR REPLACE FUNCTION public.delete_avaliacao_cascade(_avaliacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moto_avaliacao_id uuid;
  _atendimento_id uuid;
BEGIN
  -- Get related IDs
  SELECT moto_avaliacao_id, atendimento_id INTO _moto_avaliacao_id, _atendimento_id
  FROM public.avaliacoes WHERE id = _avaliacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  -- Delete contratos_consignacao linked to this avaliacao
  DELETE FROM public.contratos_consignacao WHERE avaliacao_id = _avaliacao_id;

  -- Delete estoque linked to this avaliacao
  DELETE FROM public.estoque WHERE avaliacao_id = _avaliacao_id;

  -- Delete status_history for avaliacao/consulta entity_type with moto_avaliacao_id
  DELETE FROM public.status_history WHERE entity_id = _moto_avaliacao_id AND entity_type IN ('avaliacao', 'consulta');

  -- Delete status_history for consignacao entity_type with avaliacao_id
  DELETE FROM public.status_history WHERE entity_id = _avaliacao_id AND entity_type = 'consignacao';

  -- Delete the avaliacao itself
  DELETE FROM public.avaliacoes WHERE id = _avaliacao_id;

  -- Delete moto_fotos linked to this moto_avaliacao
  DELETE FROM public.moto_fotos WHERE moto_avaliacao_id = _moto_avaliacao_id;

  -- Delete the moto_avaliacao
  DELETE FROM public.motos_avaliacao WHERE id = _moto_avaliacao_id;
END;
$$;
