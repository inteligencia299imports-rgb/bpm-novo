
CREATE OR REPLACE FUNCTION public.delete_avaliacao_cascade(_avaliacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moto_avaliacao_id uuid;
  _atendimento_id uuid;
  _contrato_ids uuid[];
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

  -- Now delete atendimento and its related records
  -- Get contrato IDs for formas_pagamento cleanup
  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;

  -- Delete formas_pagamento linked to contratos
  IF _contrato_ids IS NOT NULL THEN
    DELETE FROM public.formas_pagamento WHERE contrato_id = ANY(_contrato_ids);
  END IF;

  -- Delete contratos
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;

  -- Delete motos_interesse
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;

  -- Delete remaining motos_avaliacao (other motos linked to same atendimento)
  DELETE FROM public.moto_fotos WHERE moto_avaliacao_id IN (SELECT id FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id);
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;

  -- Delete status_history for showroom/contrato
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');

  -- Delete the atendimento
  DELETE FROM public.atendimentos WHERE id = _atendimento_id;
END;
$$;
