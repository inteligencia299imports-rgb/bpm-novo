-- A NF-e de venda da moto (emitir-nfe-compra) leva só a moto: os itens do voucher nunca vão nela.
-- Então, emitida a NF da moto, todo voucher ainda em aberto passa a faturar pelo CRM — criado antes
-- ou depois da nota (antes, só os criados depois eram liberados; ex.: VND-R-1729, NF 817).

-- 1) Gatilho: ao concluir a etapa 'NF-E DE VENDA', libera a NF dos vouchers da moto no CRM.
create or replace function public.pos_venda_voucher_libera_crm()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.etapa = 'NF-E DE VENDA' and new.concluida
     and (tg_op = 'INSERT' or not coalesce(old.concluida, false) or old.etapa is distinct from new.etapa) then
    with alvo as (
      update public.atendimento_equipamentos ae
         set faturar_com_moto = false
       where ae.bpm_atendimento_moto_id = new.atendimento_id
         and ae.faturar_com_moto
         and ae.status not in ('vendido', 'perdido')
      returning ae.id
    )
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    select id, 'atendimento_equipamento', 'AJUSTE',
           'NF-e de venda da moto emitida (sem os itens do voucher): a NF dos equipamentos passa a ser emitida pelo CRM.',
           auth.uid()
      from alvo;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_pos_venda_voucher_libera_crm on public.pos_venda_processos;
create trigger trg_pos_venda_voucher_libera_crm
  after insert or update of concluida, etapa
  on public.pos_venda_processos
  for each row execute function public.pos_venda_voucher_libera_crm();

-- 2) Voucher alterado na proposta depois da NF da moto: sempre fatura pelo CRM.
CREATE OR REPLACE FUNCTION public.sincronizar_vouchers_equipamentos(_atendimento_moto_id uuid, _vouchers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_at public.atendimentos_motos%rowtype;
  v_ae public.atendimento_equipamentos%rowtype;
  v_seminova boolean;
  v_item jsonb;
  v_vend uuid;
  v_valor numeric;
  v_loja_eq uuid;
  v_loja_padrao uuid;
  v_nf_moto boolean;
  v_usados uuid[] := '{}';
  v_res jsonb := '[]'::jsonb;
  v_crm uuid := (select p.id from public.projetos p where p.slug = '299crm');
begin
  if not public.pode_editar_voucher_moto(_atendimento_moto_id) then
    raise exception 'Sem permissão para alterar o voucher deste atendimento.';
  end if;
  if _vouchers is not null and jsonb_typeof(_vouchers) <> 'array' then
    raise exception 'Lista de vouchers inválida.';
  end if;

  select * into v_at from public.atendimentos_motos where id = _atendimento_moto_id;
  v_seminova := public.voucher_venda_seminova(_atendimento_moto_id);
  v_loja_padrao := public.voucher_loja_equipamentos(v_at.loja_id);
  -- NF-e de venda da moto já emitida: os itens do voucher não cabem mais nela -> NF pelo CRM.
  v_nf_moto := public.voucher_nf_moto_emitida(_atendimento_moto_id);

  for v_item in select value from jsonb_array_elements(coalesce(_vouchers, '[]'::jsonb)) loop
    v_vend := nullif(v_item->>'vendedor_id', '')::uuid;
    v_valor := nullif(v_item->>'valor', '')::numeric;
    v_loja_eq := nullif(v_item->>'loja_id', '')::uuid;
    if v_vend is null then
      continue;
    end if;

    if v_loja_eq is not null then
      -- Loja escolhida na proposta: precisa estar na lista de lojas x vendedores do voucher.
      if not exists (
        select 1 from public.voucher_lojas_vendedores(_atendimento_moto_id) x
         where x.loja_id = v_loja_eq and x.user_id = v_vend
      ) then
        raise exception 'Vendedor de equipamentos inválido para a loja escolhida no voucher.';
      end if;
    elsif v_seminova then
      -- Regra anterior (front sem o campo de loja): loja do vendedor.
      v_loja_eq := public.voucher_loja_do_vendedor(_atendimento_moto_id, v_vend);
      if v_loja_eq is null then
        raise exception 'Consultor de equipamentos inválido.';
      end if;
    else
      -- Regra anterior (front sem o campo de loja): loja Ducati da venda.
      v_loja_eq := v_loja_padrao;
      if v_loja_eq is null then
        raise exception 'Voucher para o CRM só existe nas lojas Ducati BSB, Ducati FLN e Ducati POA (ou na venda de moto seminova).';
      end if;
      if not exists (
        select 1 from public.user_roles r
         where r.user_id = v_vend and r.loja_id = v_loja_eq and r.projeto_id = v_crm and r.ativo
      ) then
        raise exception 'Consultor de equipamentos inválido para esta loja.';
      end if;
    end if;

    select ae.* into v_ae
      from public.atendimento_equipamentos ae
     where ae.bpm_atendimento_moto_id = _atendimento_moto_id
       and ae.id <> all (v_usados)
       and ((ae.user_id = v_vend and ae.voucher_valor is not distinct from v_valor and ae.loja_id = v_loja_eq)
            or ae.status in ('em_aberto', 'perdido'))
     order by (ae.user_id = v_vend and ae.voucher_valor is not distinct from v_valor and ae.loja_id = v_loja_eq) desc,
              (ae.user_id = v_vend and ae.loja_id = v_loja_eq) desc,
              (ae.user_id = v_vend) desc,
              (ae.status = 'em_aberto') desc,
              ae.created_at
     limit 1;

    if not found then
      insert into public.atendimento_equipamentos (
        user_id, cliente_id, loja_id, origem, tipo_atendimento, temperatura, status,
        operacao, retirada_presencial, bpm_atendimento_moto_id, voucher_valor, faturar_com_moto
      ) values (
        v_vend, v_at.cliente_id, v_loja_eq, 'Outro', 'presencial', 'quente', 'em_aberto',
        'voucher', coalesce(v_at.retirada_presencial, false), _atendimento_moto_id, v_valor,
        (not v_seminova and not v_nf_moto and v_loja_eq is not distinct from v_loja_padrao)
      )
      returning * into v_ae;
      insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
      values (v_ae.id, 'atendimento_equipamento', 'CRIADO', 'Voucher de equipamentos gerado na proposta da moto (BPM).', auth.uid());
    elsif v_ae.status in ('em_aberto', 'perdido') then
      update public.atendimento_equipamentos
         set user_id = v_vend,
             cliente_id = v_at.cliente_id,
             loja_id = v_loja_eq,
             voucher_valor = v_valor,
             status = 'em_aberto',
             -- NF da moto já emitida (só com a moto): os itens do voucher saem pelo CRM.
             faturar_com_moto = (not v_seminova and not v_nf_moto and v_loja_eq is not distinct from v_loja_padrao)
       where id = v_ae.id;
      if v_ae.status = 'perdido' then
        insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
        values (v_ae.id, 'atendimento_equipamento', 'CRIADO', 'Voucher de equipamentos direcionado novamente na proposta da moto (BPM).', auth.uid());
      end if;
      v_ae.status := 'em_aberto';
    end if;
    -- (finalizado no CRM e idêntico: nada a fazer)

    v_usados := v_usados || v_ae.id;
    v_res := v_res || jsonb_build_array(jsonb_build_object('id', v_ae.id, 'status', v_ae.status));
  end loop;

  if exists (
    select 1 from public.atendimento_equipamentos ae
     where ae.bpm_atendimento_moto_id = _atendimento_moto_id
       and ae.id <> all (v_usados)
       and ae.status not in ('em_aberto', 'perdido')
  ) then
    raise exception 'Um atendimento de equipamentos de voucher desta proposta já foi finalizado no CRM; o consultor e o valor dele não podem mais ser alterados nem o voucher removido (peça para reabri-lo no CRM).';
  end if;

  with encerrados as (
    update public.atendimento_equipamentos ae
       set status = 'perdido'
     where ae.bpm_atendimento_moto_id = _atendimento_moto_id
       and ae.id <> all (v_usados)
       and ae.status = 'em_aberto'
    returning ae.id
  )
  insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
  select id, 'atendimento_equipamento', 'PERDIDO', 'Voucher removido da proposta da moto no BPM.', auth.uid()
    from encerrados;

  return v_res;
end;
$function$;

-- 3) Vouchers em aberto cuja NF da moto já saiu (o de ontem só pegava os criados depois da nota).
with alvo as (
  update public.atendimento_equipamentos ae
     set faturar_com_moto = false
   where ae.faturar_com_moto
     and ae.status not in ('vendido', 'perdido')
     and public.voucher_nf_moto_emitida(ae.bpm_atendimento_moto_id)
  returning ae.id
)
insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
select id, 'atendimento_equipamento', 'AJUSTE',
       'NF-e de venda da moto emitida (sem os itens do voucher): a NF dos equipamentos passa a ser emitida pelo CRM.',
       '27aee000-5081-4bea-b249-ccab7e08cf66'
  from alvo;
