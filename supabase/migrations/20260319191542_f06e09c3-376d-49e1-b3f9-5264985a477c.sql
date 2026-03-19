
CREATE OR REPLACE FUNCTION public.delete_atendimento_cascade(_atendimento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _contrato_ids uuid[];
  _avaliacao_ids uuid[];
  _moto_avaliacao_ids uuid[];
BEGIN
  -- Get avaliacao IDs
  SELECT array_agg(id) INTO _avaliacao_ids FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  
  -- Get moto_avaliacao IDs
  SELECT array_agg(id) INTO _moto_avaliacao_ids FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;

  -- Get contrato IDs
  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;

  -- Delete formas_pagamento
  IF _contrato_ids IS NOT NULL THEN
    DELETE FROM public.formas_pagamento WHERE contrato_id = ANY(_contrato_ids);
  END IF;

  -- Delete contratos
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;

  -- Delete contratos_consignacao
  IF _avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.contratos_consignacao WHERE avaliacao_id = ANY(_avaliacao_ids);
    -- Delete estoque linked to avaliacoes
    DELETE FROM public.estoque WHERE avaliacao_id = ANY(_avaliacao_ids);
    -- Delete status_history for consignacao
    DELETE FROM public.status_history WHERE entity_id = ANY(_avaliacao_ids) AND entity_type = 'consignacao';
  END IF;

  -- Delete avaliacoes
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;

  -- Delete moto_fotos and status_history for motos
  IF _moto_avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.moto_fotos WHERE moto_avaliacao_id = ANY(_moto_avaliacao_ids);
    DELETE FROM public.status_history WHERE entity_id = ANY(_moto_avaliacao_ids) AND entity_type IN ('avaliacao', 'consulta');
  END IF;

  -- Delete motos_avaliacao
  DELETE FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;

  -- Delete motos_interesse
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;

  -- Delete status_history for showroom/contrato/pos_venda
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');

  -- Delete the atendimento
  DELETE FROM public.atendimentos WHERE id = _atendimento_id;
END;
$$;
