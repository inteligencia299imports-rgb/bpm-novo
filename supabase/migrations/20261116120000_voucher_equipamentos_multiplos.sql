-- Voucher Equipamentos: mais de um voucher na mesma proposta de moto (pedido do
-- usuário, 2026-11-16). Cada linha "Voucher Equipamentos" da proposta gera o seu
-- próprio atendimento no CRM — podem ser consultores/lojas diferentes.
--
-- Antes: 1 atendimento_equipamentos por atendimento de moto (índice único em
-- bpm_atendimento_moto_id) e sincronizar_voucher_equipamentos(at, vendedor, valor).
-- Agora: N atendimentos por atendimento de moto e
-- sincronizar_vouchers_equipamentos(at, '[{"vendedor_id":..,"valor":..}, ...]').
--
-- Pareamento lista da proposta <-> atendimentos já existentes (a proposta é
-- regravada inteira a cada Gerar Proposta, então não há id estável por linha):
--   1. mesmo consultor e mesmo valor (único jeito de casar com um já finalizado);
--   2. mesmo consultor, em aberto/perdido;
--   3. qualquer outro em aberto/perdido (reaproveita em vez de criar outro);
--   4. senão cria um novo.
-- Sobrou atendimento em aberto sem voucher na proposta -> perdido. Sobrou um já
-- finalizado no CRM -> erro (mesma regra de antes: reabrir no CRM primeiro).
-- Regras de loja/consultor inalteradas (0km: loja Ducati da venda; seminova:
-- qualquer usuário do CRM, atendimento na loja dele).

drop index if exists public.atendimento_equipamentos_bpm_atendimento_moto_uniq;
create index if not exists atendimento_equipamentos_bpm_atendimento_moto_idx
  on public.atendimento_equipamentos (bpm_atendimento_moto_id)
  where bpm_atendimento_moto_id is not null;

create or replace function public.sincronizar_vouchers_equipamentos(_atendimento_moto_id uuid, _vouchers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_at public.atendimentos_motos%rowtype;
  v_ae public.atendimento_equipamentos%rowtype;
  v_seminova boolean;
  v_item jsonb;
  v_vend uuid;
  v_valor numeric;
  v_loja_eq uuid;
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

  for v_item in select value from jsonb_array_elements(coalesce(_vouchers, '[]'::jsonb)) loop
    v_vend := nullif(v_item->>'vendedor_id', '')::uuid;
    v_valor := nullif(v_item->>'valor', '')::numeric;
    if v_vend is null then
      continue;
    end if;

    if v_seminova then
      v_loja_eq := public.voucher_loja_do_vendedor(_atendimento_moto_id, v_vend);
      if v_loja_eq is null then
        raise exception 'Consultor de equipamentos inválido.';
      end if;
    else
      v_loja_eq := public.voucher_loja_equipamentos(v_at.loja_id);
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
       and ((ae.user_id = v_vend and ae.voucher_valor is not distinct from v_valor)
            or ae.status in ('em_aberto', 'perdido'))
     order by (ae.user_id = v_vend and ae.voucher_valor is not distinct from v_valor) desc,
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
        'voucher', coalesce(v_at.retirada_presencial, false), _atendimento_moto_id, v_valor, not v_seminova
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
             faturar_com_moto = not v_seminova
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

-- Assinatura antiga (front em cache durante o deploy): 1 voucher ou nenhum.
create or replace function public.sincronizar_voucher_equipamentos(_atendimento_moto_id uuid, _vendedor_id uuid, _valor numeric)
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select public.sincronizar_vouchers_equipamentos(
           _atendimento_moto_id,
           case when _vendedor_id is null then '[]'::jsonb
                else jsonb_build_array(jsonb_build_object('vendedor_id', _vendedor_id, 'valor', _valor)) end
         ) -> 0;
$function$;

-- Status: agora uma lista (vazia se não há vínculo).
create or replace function public.vouchers_equipamentos_status(_atendimento_moto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ae.id,
           'status', ae.status,
           'vendedor_id', ae.user_id,
           'vendedor_nome', public.nome_usuario(ae.user_id, '299crm'),
           'voucher_valor', ae.voucher_valor
         ) order by ae.created_at), '[]'::jsonb)
    from public.atendimento_equipamentos ae
   where ae.bpm_atendimento_moto_id = _atendimento_moto_id
     and public.pode_editar_voucher_moto(_atendimento_moto_id);
$function$;

revoke execute on function public.sincronizar_vouchers_equipamentos(uuid, jsonb) from public, anon;
revoke execute on function public.vouchers_equipamentos_status(uuid) from public, anon;
grant execute on function public.sincronizar_vouchers_equipamentos(uuid, jsonb) to authenticated;
grant execute on function public.vouchers_equipamentos_status(uuid) to authenticated;
