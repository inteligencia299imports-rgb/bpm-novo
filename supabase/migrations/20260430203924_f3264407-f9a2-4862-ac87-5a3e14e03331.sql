CREATE OR REPLACE FUNCTION public.delete_atendimento_cascade(_atendimento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _avaliacao_ids uuid[];
  _moto_avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO _avaliacao_ids FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _moto_avaliacao_ids FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _contrato_consignante_ids FROM public.contratos_consignante WHERE atendimento_id = _atendimento_id;

  -- Delete custos_operacionais (FK to contratos_consignante is CASCADE, redundant but safe)
  IF _contrato_consignante_ids IS NOT NULL THEN
    DELETE FROM public.custos_operacionais WHERE contrato_consignante_id = ANY(_contrato_consignante_ids);
  END IF;

  -- Detach estoque references (avoid blocking via SET NULL anyway, but explicit for clarity)
  IF _avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque SET avaliacao_id = NULL WHERE avaliacao_id = ANY(_avaliacao_ids);
  END IF;
  IF _moto_avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque SET moto_avaliacao_id = NULL WHERE moto_avaliacao_id = ANY(_moto_avaliacao_ids);
  END IF;
  UPDATE public.estoque SET atendimento_venda_id = NULL WHERE atendimento_venda_id = _atendimento_id;

  -- Delete data not protected by FKs / cascades
  DELETE FROM public.respostas_nps WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.notifications WHERE entity_id = _atendimento_id;
  DELETE FROM public.observacoes_processo WHERE entity_id = _atendimento_id::text;

  -- status_history for atendimento itself and related entities
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id;
  IF _avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.status_history WHERE entity_id = ANY(_avaliacao_ids);
    DELETE FROM public.observacoes_processo WHERE entity_id = ANY(SELECT unnest(_avaliacao_ids)::text);
    DELETE FROM public.notifications WHERE entity_id = ANY(_avaliacao_ids);
  END IF;
  IF _moto_avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.status_history WHERE entity_id = ANY(_moto_avaliacao_ids);
    DELETE FROM public.observacoes_processo WHERE entity_id = ANY(SELECT unnest(_moto_avaliacao_ids)::text);
  END IF;

  -- Finally delete the atendimento (cascades take care of avaliacoes, motos_avaliacao, contratos, etc.)
  DELETE FROM public.atendimentos WHERE id = _atendimento_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'delete_atendimento_cascade falhou: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END;
$function$;