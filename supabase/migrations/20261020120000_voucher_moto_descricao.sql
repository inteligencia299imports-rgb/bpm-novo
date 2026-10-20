-- Voucher Equipamentos: descrição da moto (MARCA MODELO) no atendimento do CRM,
-- pra tela mostrar "Voucher de R$ X proveniente da venda da moto MARCA MODELO"
-- (pedido do usuário, 2026-10-20). O CRM não lê atendimentos_motos/motos_interesse,
-- então a descrição fica gravada no próprio atendimento_equipamentos.
--
-- Preenchida por gatilho sempre que a linha vinculada ao BPM é criada ou
-- atualizada (sincronizar_voucher_equipamentos roda a cada Gerar Proposta), então
-- acompanha a troca de moto na proposta. Mesma moto que a vw_nps usa: a moto de
-- interesse com estoque vinculado primeiro, senão a mais antiga.

alter table public.atendimento_equipamentos
  add column if not exists voucher_moto_descricao text;

comment on column public.atendimento_equipamentos.voucher_moto_descricao is
  'Voucher Equipamentos: MARCA MODELO da moto vendida no BPM que originou o voucher (gatilho trg_voucher_moto_descricao).';

create or replace function public.voucher_moto_descricao(_atendimento_moto_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Moto do estoque: marca/modelo vêm do estoque (0km: estoque_motos_novas;
  -- seminova: avaliação da moto) — a moto de interesse só guarda o vínculo.
  -- Sem estoque vinculado: marca/modelo da própria moto de interesse.
  select nullif(coalesce(
           case
             when mi.estoque_moto_id is null then null
             when mi.estoque_tipo = '0km' then (
               select concat_ws(' ', mm.nome, mo.nome)
                 from public.estoque_motos_novas en
                 left join public.modelos_motos mo on mo.id = en.modelo_id
                 left join public.marcas_motos mm on mm.id = coalesce(en.marca_id, mo.marca_id)
                where en.id::text = mi.estoque_moto_id)
             else (
               select concat_ws(' ', mm.nome, mo.nome)
                 from public.estoque_motos em
                 join public.avaliacoes av on av.id = em.avaliacao_id
                 left join public.modelos_motos mo on mo.id = av.modelo_id
                 left join public.marcas_motos mm on mm.id = coalesce(av.marca_id, mo.marca_id)
                where em.id::text = mi.estoque_moto_id)
           end,
           concat_ws(' ',
             (select mm.nome from public.marcas_motos mm
               where mm.id = coalesce(mi.marca_id, (select mo.marca_id from public.modelos_motos mo where mo.id = mi.modelo_id))),
             (select mo.nome from public.modelos_motos mo where mo.id = mi.modelo_id))
         ), '')
    from public.motos_interesse mi
   where mi.atendimento_id = _atendimento_moto_id
   order by (mi.estoque_moto_id is not null) desc, mi.created_at
   limit 1;
$$;

create or replace function public.trg_voucher_moto_descricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bpm_atendimento_moto_id is not null then
    new.voucher_moto_descricao := public.voucher_moto_descricao(new.bpm_atendimento_moto_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voucher_moto_descricao on public.atendimento_equipamentos;
create trigger trg_voucher_moto_descricao
  before insert or update of bpm_atendimento_moto_id, voucher_valor, user_id, status
  on public.atendimento_equipamentos
  for each row execute function public.trg_voucher_moto_descricao();

-- Vouchers já criados.
update public.atendimento_equipamentos
   set voucher_moto_descricao = public.voucher_moto_descricao(bpm_atendimento_moto_id)
 where bpm_atendimento_moto_id is not null;

revoke execute on function public.voucher_moto_descricao(uuid) from public, anon;
grant execute on function public.voucher_moto_descricao(uuid) to authenticated;
