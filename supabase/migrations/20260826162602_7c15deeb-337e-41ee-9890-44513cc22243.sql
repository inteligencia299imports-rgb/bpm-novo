-- Corrige delete_atendimento_cascade / delete_avaliacao_cascade: ambas
-- chamavam has_role(auth.uid(), 'gestor'::app_role), que nao existe mais
-- (has_role foi removida, e 'gestor' nao e mais um valor do enum app_role).

create or replace function public.delete_atendimento_cascade(_atendimento_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _avaliacao_ids uuid[];
  _moto_avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
  _loja text;
BEGIN
  SELECT loja INTO _loja FROM public.atendimentos WHERE id = _atendimento_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  SELECT array_agg(id) INTO _avaliacao_ids FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _moto_avaliacao_ids FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _contrato_consignante_ids FROM public.contratos_consignante WHERE atendimento_id = _atendimento_id;

  IF _contrato_consignante_ids IS NOT NULL THEN
    DELETE FROM public.custos_operacionais WHERE contrato_consignante_id = ANY(_contrato_consignante_ids);
  END IF;

  IF _avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque SET avaliacao_id = NULL WHERE avaliacao_id = ANY(_avaliacao_ids);
  END IF;
  IF _moto_avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque SET moto_avaliacao_id = NULL WHERE moto_avaliacao_id = ANY(_moto_avaliacao_ids);
  END IF;
  UPDATE public.estoque SET atendimento_venda_id = NULL WHERE atendimento_venda_id = _atendimento_id;

  DELETE FROM public.respostas_nps WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.notifications WHERE entity_id = _atendimento_id;
  DELETE FROM public.observacoes_processo WHERE entity_id = _atendimento_id::text;

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

  DELETE FROM public.atendimentos WHERE id = _atendimento_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'delete_atendimento_cascade falhou: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END;
$function$;

create or replace function public.delete_avaliacao_cascade(_avaliacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _moto_avaliacao_id uuid;
  _atendimento_id uuid;
  _contrato_ids uuid[];
  _loja text;
BEGIN
  SELECT a.loja, av.atendimento_id INTO _loja, _atendimento_id
  FROM public.avaliacoes av JOIN public.atendimentos a ON a.id = av.atendimento_id
  WHERE av.id = _avaliacao_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  SELECT moto_avaliacao_id, atendimento_id INTO _moto_avaliacao_id, _atendimento_id
  FROM public.avaliacoes WHERE id = _avaliacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  DELETE FROM public.contratos_consignacao WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.estoque WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.status_history WHERE entity_id = _moto_avaliacao_id AND entity_type IN ('avaliacao', 'consulta');
  DELETE FROM public.status_history WHERE entity_id = _avaliacao_id AND entity_type = 'consignacao';
  DELETE FROM public.avaliacoes WHERE id = _avaliacao_id;
  DELETE FROM public.moto_fotos WHERE moto_avaliacao_id = _moto_avaliacao_id;
  DELETE FROM public.motos_avaliacao WHERE id = _moto_avaliacao_id;

  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;
  IF _contrato_ids IS NOT NULL THEN
    DELETE FROM public.formas_pagamento WHERE contrato_id = ANY(_contrato_ids);
  END IF;
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.moto_fotos WHERE moto_avaliacao_id IN (SELECT id FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id);
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_avaliacao WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');
  DELETE FROM public.atendimentos WHERE id = _atendimento_id;
END;
$function$;
