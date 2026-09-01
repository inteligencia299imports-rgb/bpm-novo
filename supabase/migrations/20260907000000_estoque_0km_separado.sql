-- Separa motos 0km de estoque_motos.
--   estoque_motos          -> exclusivamente SEMINOVAS (sempre avaliacao_id)
--   estoque_motos_novas    -> 0km, com rastreio de venda proprio
-- motos_interesse.estoque_tipo discrimina de qual estoque veio a moto selecionada.
-- Homolog zerado -> sem migracao de dados.

-- 1) estoque_motos volta a ser seminova-only
alter table public.estoque_motos drop constraint if exists estoque_motos_fonte_chk;
alter table public.estoque_motos drop constraint if exists estoque_motos_moto_nova_id_fkey;
drop index if exists public.idx_estoque_motos_moto_nova;
alter table public.estoque_motos drop column if exists moto_nova_id;
alter table public.estoque_motos alter column avaliacao_id set not null;
-- avaliacao_id NOT NULL: FK nao pode mais SET NULL -> CASCADE (a linha de estoque some com a avaliacao)
alter table public.estoque_motos drop constraint if exists estoque_avaliacao_id_fkey;
alter table public.estoque_motos add constraint estoque_avaliacao_id_fkey
  foreign key (avaliacao_id) references public.avaliacoes(id) on delete cascade;

-- 2) estoque_motos_novas ganha rastreio de venda (espelho de estoque_motos)
alter table public.estoque_motos_novas
  add column if not exists atendimento_venda_id uuid references public.atendimentos_motos(id) on delete set null,
  add column if not exists valor_venda numeric,
  add column if not exists valor_sinal numeric,
  add column if not exists data_venda timestamptz,
  add column if not exists preco_acao numeric;
create index if not exists idx_estoque_motos_novas_atv on public.estoque_motos_novas (atendimento_venda_id);

-- 3) motos_interesse: discriminador da origem do estoque ('seminova' | '0km')
alter table public.motos_interesse add column if not exists estoque_tipo text;

-- 4) nfe_entradas: NF-e de venda de 0km aponta para estoque_motos_novas
alter table public.nfe_entradas
  add column if not exists estoque_moto_nova_id uuid references public.estoque_motos_novas(id) on delete set null;

-- 5) cascata: ao apagar o atendimento, liberar a 0km de volta pra disponivel
--    (a linha de estoque_motos_novas NAO e deletada — e catalogo do sistema externo)
create or replace function public.delete_atendimento_cascade(_atendimento_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
  _loja_id uuid;
begin
  select loja_id into _loja_id from public.atendimentos_motos where id = _atendimento_id;

  if not public.has_master_or_gerente_empresa(auth.uid(), _loja_id) then
    raise exception 'Unauthorized: only master/gerente can perform cascade deletes';
  end if;

  select array_agg(id) into _avaliacao_ids from public.avaliacoes where atendimento_id = _atendimento_id;
  select array_agg(id) into _contrato_consignante_ids from public.contratos_consignante where atendimento_id = _atendimento_id;

  if _contrato_consignante_ids is not null then
    delete from public.custos_operacionais where contrato_consignante_id = any(_contrato_consignante_ids);
  end if;

  if _avaliacao_ids is not null then
    -- avaliacao_id agora e NOT NULL em estoque_motos: a linha e removida junto da avaliacao
    delete from public.estoque_motos where avaliacao_id = any(_avaliacao_ids);
  end if;
  update public.estoque_motos set atendimento_venda_id = null where atendimento_venda_id = _atendimento_id;
  update public.estoque_motos_novas
    set atendimento_venda_id = null, status = 'disponivel',
        valor_venda = null, valor_sinal = null, data_venda = null, preco_acao = null
    where atendimento_venda_id = _atendimento_id;

  delete from public.respostas_nps where atendimento_id = _atendimento_id;
  delete from public.notifications where entity_id = _atendimento_id;
  delete from public.observacoes where id_operacao = _atendimento_id;

  delete from public.status_history where entity_id = _atendimento_id;
  if _avaliacao_ids is not null then
    delete from public.status_history where entity_id = any(_avaliacao_ids);
    delete from public.notifications where entity_id = any(_avaliacao_ids);
  end if;

  delete from public.atendimentos_motos where id = _atendimento_id;
exception when others then
  raise exception 'delete_atendimento_cascade falhou: % (SQLSTATE %)', sqlerrm, sqlstate;
end;
$function$;
