-- Voucher Equipamentos: escolher a LOJA do CRM e depois o vendedor (pedido do usuário,
-- 2026-11-17). O voucher pode ser gerado para qualquer loja de equipamentos que vende — não só
-- a loja Ducati da venda (0km) ou a loja do vendedor (seminova).
--
-- Fluxo na proposta: Loja > Vendedor. Os vendedores são filtrados pela loja (nunca o contrário).
--
-- Lojas: loja_empresas com sistema = 'equipamentos', ativa e vende = true.
-- Vendedores da loja: usuários ativos do CRM (user_roles, projeto 299crm) com acesso à empresa da
-- loja (user_empresas) — a mesma regra do CRM para escolher a loja de um atendimento.
-- Quem pode lançar voucher continua igual (pode_editar_voucher_moto + venda 0km numa loja Ducati
-- ou venda de seminova).
--
-- faturar_com_moto: só quando a venda é 0km e o voucher fica na loja Ducati da própria venda (o
-- caso de antes). Em outra loja o equipamento é faturado pela loja do voucher.
--
-- Compatível com o front antigo em cache: item sem loja_id segue a regra anterior.

alter table public.contratos_agregados
  add column if not exists voucher_loja_id uuid references public.loja_empresas(id);

comment on column public.contratos_agregados.voucher_loja_id is
  'Voucher Equipamentos: loja do CRM (loja_empresas, sistema equipamentos) onde nasce o atendimento.';

-- Pode lançar voucher para o CRM nesta venda?
create or replace function public.voucher_venda_elegivel(_atendimento_moto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.voucher_venda_seminova(_atendimento_moto_id)
      or exists (
           select 1 from public.atendimentos_motos a
            where a.id = _atendimento_moto_id
              and public.voucher_loja_equipamentos(a.loja_id) is not null
         );
$$;

-- Lojas e vendedores disponíveis para o voucher (uma linha por loja x vendedor).
-- padrao = loja sugerida (0km: a loja Ducati da venda).
create or replace function public.voucher_lojas_vendedores(_atendimento_moto_id uuid)
returns table(loja_id uuid, loja text, padrao boolean, user_id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  with at as (
    select a.id, public.voucher_loja_equipamentos(a.loja_id) as loja_padrao
      from public.atendimentos_motos a
     where a.id = _atendimento_moto_id
       and public.pode_editar_voucher_moto(_atendimento_moto_id)
       and public.voucher_venda_elegivel(_atendimento_moto_id)
  ),
  usuarios as (
    select distinct on (r.user_id)
           r.user_id, coalesce(nullif(trim(r.nome), ''), r.email) as nome
      from public.user_roles r
     where r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
       and r.ativo
     order by r.user_id, case r.app_role::text when 'vendedor' then 0 when 'consultor' then 1 else 2 end
  )
  select le.id, le.loja, (le.id = at.loja_padrao), u.user_id, u.nome
    from at
    cross join public.loja_empresas le
    join public.user_empresas ue on ue.empresa_id = le.empresa_id
    join usuarios u on u.user_id = ue.user_id
   where le.sistema = 'equipamentos'
     and le.ativo
     and coalesce(le.vende, true)
   order by le.loja, u.nome;
$$;

grant execute on function public.voucher_lojas_vendedores(uuid) to authenticated;
grant execute on function public.voucher_venda_elegivel(uuid) to authenticated;

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
  v_loja_padrao uuid;
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
        (not v_seminova and v_loja_eq is not distinct from v_loja_padrao)
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
             faturar_com_moto = (not v_seminova and v_loja_eq is not distinct from v_loja_padrao)
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

-- Vouchers já lançados: grava a loja do atendimento do CRM na linha da proposta, para a tela
-- mostrar a loja e o próximo Gerar Proposta manter a loja (ex.: Augusto C. R. Pupe, Aventura).
update public.contratos_agregados ca
   set voucher_loja_id = x.loja_id
  from (
    select ca2.id, ae.loja_id,
           row_number() over (partition by ca2.id order by ae.created_at) rn
      from public.contratos_agregados ca2
      join public.contratos ct on ct.id = ca2.contrato_id
      join public.atendimento_equipamentos ae
        on ae.bpm_atendimento_moto_id = ct.atendimento_id
       and ae.user_id = ca2.voucher_vendedor_id
       and ae.voucher_valor is not distinct from ca2.valor
     where ca2.voucher_vendedor_id is not null
       and ca2.voucher_loja_id is null
  ) x
 where x.id = ca.id and x.rn = 1;
