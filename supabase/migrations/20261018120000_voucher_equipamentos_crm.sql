-- Voucher de equipamentos BPM -> CRM (pedido do usuário, 2026-10-18).
--
-- Na proposta de venda de moto, o agregado "Voucher Equipamentos" pode ser
-- direcionado a um vendedor de equipamentos: ao gerar a proposta, o BPM cria
-- (ou atualiza) um atendimento em atendimento_equipamentos com operacao
-- 'voucher'. A NF-e dos equipamentos NÃO sai pelo CRM: os itens entram na NF-e
-- da moto (faturar_com_moto). Só Ducati BSB, Ducati FLN e Ducati POA — as
-- únicas lojas em que motos e equipamentos são a mesma empresa (mesmo CNPJ);
-- M2 e MMATOS não vendem os dois juntos.
--
-- Vínculos SEM foreign key, de propósito: atendimento_equipamentos já tem FK
-- pra loja_empresas/compromissos/naturezas_operacao; uma FK pra
-- atendimentos_motos faria o PostgREST ver atendimento_equipamentos como
-- tabela de junção (atendimentos_motos <-> loja_empresas, <-> compromissos) e
-- os embeds existentes passariam a dar PGRST201 (ambíguo).

alter table public.atendimento_equipamentos
  add column if not exists bpm_atendimento_moto_id uuid,
  add column if not exists voucher_valor numeric,
  add column if not exists faturar_com_moto boolean not null default false;

comment on column public.atendimento_equipamentos.bpm_atendimento_moto_id is
  'Atendimento de moto (BPM) que originou o voucher. Sem FK de propósito (ver migration 20261018120000).';
comment on column public.atendimento_equipamentos.voucher_valor is
  'Valor do voucher de equipamentos concedido na proposta da moto (BPM).';
comment on column public.atendimento_equipamentos.faturar_com_moto is
  'true = os itens deste atendimento saem na NF-e da moto no BPM; o CRM não emite NF.';

create unique index if not exists atendimento_equipamentos_bpm_atendimento_moto_uniq
  on public.atendimento_equipamentos (bpm_atendimento_moto_id)
  where bpm_atendimento_moto_id is not null;

-- Vendedor de equipamentos escolhido na linha do voucher da proposta.
alter table public.contratos_agregados
  add column if not exists voucher_vendedor_id uuid;

comment on column public.contratos_agregados.voucher_vendedor_id is
  'Voucher Equipamentos direcionado ao CRM: user_id do vendedor de equipamentos (user_roles do projeto CRM).';

-- Loja de equipamentos que recebe o voucher de um atendimento de moto, ou null
-- se a loja não participa (só Ducati BSB/FLN/POA, com a mesma empresa nos dois lados).
create or replace function public.voucher_loja_equipamentos(_loja_moto_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select le_eq.id
    from public.loja_empresas le_moto
    join public.loja_empresas le_eq
      on le_eq.loja = le_moto.loja
     and le_eq.empresa_id = le_moto.empresa_id
     and le_eq.sistema = 'equipamentos'
   where le_moto.id = _loja_moto_id
     and le_moto.sistema = 'motos'
     and le_moto.loja in ('Ducati BSB', 'Ducati FLN', 'Ducati POA')
   limit 1;
$$;

-- Quem pode mexer no voucher de um atendimento de moto: o vendedor dele ou
-- master/gerente da loja (mesmo critério de pode_acessar_resposta_nps).
create or replace function public.pode_editar_voucher_moto(_atendimento_moto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.atendimentos_motos a
     where a.id = _atendimento_moto_id
       and (a.vendedor_id = auth.uid()
            or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
  );
$$;

-- Vendedores de equipamentos (CRM) da loja do atendimento de moto. Vazio se a
-- loja não participa. Inclui gerente/consultor: Ducati FLN e POA não têm
-- usuário com papel "vendedor" no CRM.
create or replace function public.voucher_vendedores_equipamentos(_atendimento_moto_id uuid)
returns table (user_id uuid, nome text, app_role text)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id, coalesce(nullif(trim(r.nome), ''), r.email) as nome, r.app_role::text
    from public.atendimentos_motos a
    join public.user_roles r
      on r.loja_id = public.voucher_loja_equipamentos(a.loja_id)
     and r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
     and r.ativo
     and r.app_role::text in ('vendedor', 'consultor', 'gerente')
   where a.id = _atendimento_moto_id
     and public.pode_editar_voucher_moto(_atendimento_moto_id)
   order by case r.app_role::text when 'vendedor' then 0 when 'consultor' then 1 else 2 end, 2;
$$;

-- Estado do atendimento de equipamentos vinculado (pra tela do BPM e, na
-- etapa da NF-e, pro bloqueio da emissão). null se não há vínculo.
create or replace function public.voucher_equipamentos_status(_atendimento_moto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', ae.id,
           'status', ae.status,
           'vendedor_id', ae.user_id,
           'vendedor_nome', public.nome_usuario(ae.user_id, '299crm'),
           'voucher_valor', ae.voucher_valor
         )
    from public.atendimento_equipamentos ae
   where ae.bpm_atendimento_moto_id = _atendimento_moto_id
     and public.pode_editar_voucher_moto(_atendimento_moto_id);
$$;

-- Cria/atualiza (ou encerra, com _vendedor_id null) o atendimento de
-- equipamentos do voucher. Chamado pelo BPM ao gerar a proposta.
--  - sem vínculo + vendedor            -> cria atendimento em_aberto (operacao voucher)
--  - vínculo em_aberto/perdido + vend. -> atualiza vendedor/valor/cliente e (re)abre
--  - vínculo em_aberto + null          -> perdido (voucher removido/não direcionado)
--  - vínculo já fechado no CRM         -> só aceita se nada mudou; senão erro
create or replace function public.sincronizar_voucher_equipamentos(
  _atendimento_moto_id uuid,
  _vendedor_id uuid,
  _valor numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at public.atendimentos_motos%rowtype;
  v_ae public.atendimento_equipamentos%rowtype;
  v_loja_eq uuid;
  v_fechado boolean;
begin
  if not public.pode_editar_voucher_moto(_atendimento_moto_id) then
    raise exception 'Sem permissão para alterar o voucher deste atendimento.';
  end if;

  select * into v_at from public.atendimentos_motos where id = _atendimento_moto_id;
  select * into v_ae from public.atendimento_equipamentos where bpm_atendimento_moto_id = _atendimento_moto_id;
  v_fechado := v_ae.id is not null and v_ae.status not in ('em_aberto', 'perdido');

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

  v_loja_eq := public.voucher_loja_equipamentos(v_at.loja_id);
  if v_loja_eq is null then
    raise exception 'Voucher para o CRM só existe nas lojas Ducati BSB, Ducati FLN e Ducati POA.';
  end if;

  if not exists (
    select 1 from public.user_roles r
     where r.user_id = _vendedor_id
       and r.loja_id = v_loja_eq
       and r.projeto_id = (select p.id from public.projetos p where p.slug = '299crm')
       and r.ativo
       and r.app_role::text in ('vendedor', 'consultor', 'gerente')
  ) then
    raise exception 'Vendedor de equipamentos inválido para esta loja.';
  end if;

  if v_ae.id is null then
    insert into public.atendimento_equipamentos (
      user_id, cliente_id, loja_id, origem, tipo_atendimento, temperatura, status,
      operacao, retirada_presencial, bpm_atendimento_moto_id, voucher_valor, faturar_com_moto
    ) values (
      _vendedor_id, v_at.cliente_id, v_loja_eq, 'Outro', 'presencial', 'quente', 'em_aberto',
      'voucher', coalesce(v_at.retirada_presencial, false), _atendimento_moto_id, _valor, true
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
         voucher_valor = _valor,
         status = 'em_aberto',
         faturar_com_moto = true
   where id = v_ae.id;
  if v_ae.status = 'perdido' then
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    values (v_ae.id, 'atendimento_equipamento', 'CRIADO', 'Voucher de equipamentos direcionado novamente na proposta da moto (BPM).', auth.uid());
  end if;
  return jsonb_build_object('id', v_ae.id, 'status', 'em_aberto');
end;
$$;

-- Venda da moto perdida: encerra o atendimento de equipamentos do voucher se
-- ele ainda estiver em aberto no CRM.
create or replace function public.voucher_equipamentos_moto_perdida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.situacao = 'perdido' and old.situacao is distinct from 'perdido' then
    with encerrados as (
      update public.atendimento_equipamentos
         set status = 'perdido'
       where bpm_atendimento_moto_id = new.id
         and status = 'em_aberto'
      returning id
    )
    insert into public.status_history_equipamentos (entity_id, entity_type, status, observacoes, changed_by)
    select id, 'atendimento_equipamento', 'PERDIDO', 'Venda da moto perdida no BPM.', auth.uid()
      from encerrados;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voucher_equipamentos_moto_perdida on public.atendimentos_motos;
create trigger trg_voucher_equipamentos_moto_perdida
  after update of situacao on public.atendimentos_motos
  for each row execute function public.voucher_equipamentos_moto_perdida();

revoke execute on function public.voucher_loja_equipamentos(uuid) from public, anon;
revoke execute on function public.pode_editar_voucher_moto(uuid) from public, anon;
revoke execute on function public.voucher_vendedores_equipamentos(uuid) from public, anon;
revoke execute on function public.voucher_equipamentos_status(uuid) from public, anon;
revoke execute on function public.sincronizar_voucher_equipamentos(uuid, uuid, numeric) from public, anon;
grant execute on function public.voucher_loja_equipamentos(uuid) to authenticated;
grant execute on function public.pode_editar_voucher_moto(uuid) to authenticated;
grant execute on function public.voucher_vendedores_equipamentos(uuid) to authenticated;
grant execute on function public.voucher_equipamentos_status(uuid) to authenticated;
grant execute on function public.sincronizar_voucher_equipamentos(uuid, uuid, numeric) to authenticated;
