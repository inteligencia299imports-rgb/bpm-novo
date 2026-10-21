-- Voucher Equipamentos: o "Consultor Equipamentos" lista TODOS os usuários ativos do CRM
-- daquela unidade (não só vendedor/consultor/gerente) — pedido do usuário, 2026-10-21.
-- 0km: usuários da loja Ducati da venda; seminova: usuários de qualquer loja do CRM.
-- Definições regeradas de pg_get_functiondef (prod) sem o filtro de app_role.

CREATE OR REPLACE FUNCTION public.voucher_vendedores_equipamentos(_atendimento_moto_id uuid)
 RETURNS TABLE(user_id uuid, nome text, app_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 0km: vendedores da loja Ducati da venda (como antes).
  select r.user_id, coalesce(nullif(trim(r.nome), ''), r.email) as nome, r.app_role::text
    from public.atendimentos_motos a
    join public.user_roles r
      on r.loja_id = public.voucher_loja_equipamentos(a.loja_id)
     and r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
     and r.ativo
   where a.id = _atendimento_moto_id
     and public.pode_editar_voucher_moto(_atendimento_moto_id)
     and not public.voucher_venda_seminova(_atendimento_moto_id)
  union all
  -- Seminova: qualquer vendedor de equipamentos do CRM (uma linha por pessoa).
  select x.user_id, x.nome, x.app_role
    from (
      select distinct on (r.user_id)
             r.user_id, coalesce(nullif(trim(r.nome), ''), r.email) as nome, r.app_role::text as app_role
        from public.user_roles r
       where r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
         and r.ativo
         and r.loja_id is not null
         and public.pode_editar_voucher_moto(_atendimento_moto_id)
         and public.voucher_venda_seminova(_atendimento_moto_id)
       order by r.user_id, case r.app_role::text when 'vendedor' then 0 when 'consultor' then 1 else 2 end
    ) x
  order by 2;
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_loja_do_vendedor(_atendimento_moto_id uuid, _vendedor_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.loja_id
    from public.user_roles r
    join public.atendimentos_motos a on a.id = _atendimento_moto_id
   where r.user_id = _vendedor_id
     and r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
     and r.ativo
     and r.loja_id is not null
   order by (r.loja_id = public.voucher_loja_equipamentos(a.loja_id)) desc nulls last,
            case r.app_role::text when 'vendedor' then 0 when 'consultor' then 1 else 2 end
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_voucher_equipamentos(_atendimento_moto_id uuid, _vendedor_id uuid, _valor numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_at public.atendimentos_motos%rowtype;
  v_ae public.atendimento_equipamentos%rowtype;
  v_loja_eq uuid;
  v_fechado boolean;
  v_seminova boolean;
begin
  if not public.pode_editar_voucher_moto(_atendimento_moto_id) then
    raise exception 'Sem permissão para alterar o voucher deste atendimento.';
  end if;

  select * into v_at from public.atendimentos_motos where id = _atendimento_moto_id;
  select * into v_ae from public.atendimento_equipamentos where bpm_atendimento_moto_id = _atendimento_moto_id;
  v_fechado := v_ae.id is not null and v_ae.status not in ('em_aberto', 'perdido');
  v_seminova := public.voucher_venda_seminova(_atendimento_moto_id);

  -- Voucher removido ou não direcionado.
  if _vendedor_id is null then
    if v_ae.id is null or v_ae.status = 'perdido' then
      return null;
    end if;
    if v_fechado then
      raise exception 'O atendimento de equipamentos deste voucher já foi finalizado no CRM; peça ao vendedor de equipamentos para reabri-lo antes de remover o voucher.';
    end if;
    update public.atendimento_equipamentos set status = 'perdido' where id = v_ae.id;
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    values (v_ae.id, 'atendimento_equipamento', 'PERDIDO', 'Voucher removido da proposta da moto no BPM.', auth.uid());
    return jsonb_build_object('id', v_ae.id, 'status', 'perdido');
  end if;

  if v_seminova then
    -- Seminova: qualquer vendedor do CRM; o atendimento fica na loja dele.
    v_loja_eq := public.voucher_loja_do_vendedor(_atendimento_moto_id, _vendedor_id);
    if v_loja_eq is null then
      raise exception 'Vendedor de equipamentos inválido.';
    end if;
  else
    v_loja_eq := public.voucher_loja_equipamentos(v_at.loja_id);
    if v_loja_eq is null then
      raise exception 'Voucher para o CRM só existe nas lojas Ducati BSB, Ducati FLN e Ducati POA (ou na venda de moto seminova).';
    end if;
    if not exists (
      select 1 from public.user_roles r
       where r.user_id = _vendedor_id
         and r.loja_id = v_loja_eq
         and r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
         and r.ativo
    ) then
      raise exception 'Vendedor de equipamentos inválido para esta loja.';
    end if;
  end if;

  if v_ae.id is null then
    insert into public.atendimento_equipamentos (
      user_id, cliente_id, loja_id, origem, tipo_atendimento, temperatura, status,
      operacao, retirada_presencial, bpm_atendimento_moto_id, voucher_valor, faturar_com_moto
    ) values (
      _vendedor_id, v_at.cliente_id, v_loja_eq, 'Outro', 'presencial', 'quente', 'em_aberto',
      'voucher', coalesce(v_at.retirada_presencial, false), _atendimento_moto_id, _valor, not v_seminova
    )
    returning * into v_ae;
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    values (v_ae.id, 'atendimento_equipamento', 'CRIADO', 'Voucher de equipamentos gerado na proposta da moto (BPM).', auth.uid());
    return jsonb_build_object('id', v_ae.id, 'status', v_ae.status);
  end if;

  if v_fechado then
    if v_ae.user_id is distinct from _vendedor_id or v_ae.voucher_valor is distinct from _valor then
      raise exception 'O atendimento de equipamentos deste voucher já foi finalizado no CRM; o vendedor e o valor do voucher não podem mais ser alterados.';
    end if;
    return jsonb_build_object('id', v_ae.id, 'status', v_ae.status);
  end if;

  update public.atendimento_equipamentos
     set user_id = _vendedor_id,
         cliente_id = v_at.cliente_id,
         loja_id = v_loja_eq,
         voucher_valor = _valor,
         status = 'em_aberto',
         faturar_com_moto = not v_seminova
   where id = v_ae.id;
  if v_ae.status = 'perdido' then
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    values (v_ae.id, 'atendimento_equipamento', 'CRIADO', 'Voucher de equipamentos direcionado novamente na proposta da moto (BPM).', auth.uid());
  end if;
  return jsonb_build_object('id', v_ae.id, 'status', 'em_aberto');
end;
$function$
;

