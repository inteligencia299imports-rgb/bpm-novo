-- =====================================================================
-- Nova tabela public.observacoes: notas datadas por operacao (id_operacao).
-- Substitui o campo unico atendimentos_motos.observacoes (texto livre,
-- preenchido uma vez na criacao) por um historico de notas adicionaveis
-- a qualquer momento, no mesmo espirito do padrao ja usado em
-- observacoes_processo, mas sem entity_type: aqui id_operacao aponta
-- direto para atendimentos_motos.id.
-- =====================================================================

create table if not exists public.observacoes (
  id uuid not null default gen_random_uuid (),
  id_operacao uuid not null,
  observacao text not null,
  user_id uuid null,
  created_at timestamp with time zone not null default now(),
  constraint observacoes_pkey primary key (id),
  constraint observacoes_user_id_fkey foreign key (user_id) references auth.users (id)
) TABLESPACE pg_default;

create index if not exists idx_observacoes_id_operacao on public.observacoes using btree (id_operacao) TABLESPACE pg_default;

alter table public.observacoes enable row level security;

drop policy if exists "Acesso observacoes" on public.observacoes;
create policy "Acesso observacoes" on public.observacoes for select to authenticated
  using (
    (user_id = auth.uid())
    or has_app_role(auth.uid(), 'master'::app_role)
    or (exists (
      select 1 from public.atendimentos_motos a
      where a.id = observacoes.id_operacao
        and ((a.vendedor_id = auth.uid()) or has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    ))
  );

drop policy if exists "Insert own observacoes" on public.observacoes;
create policy "Insert own observacoes" on public.observacoes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Master deletes observacoes" on public.observacoes;
create policy "Master deletes observacoes" on public.observacoes for delete to authenticated
  using (has_app_role(auth.uid(), 'master'::app_role));

-- Remove o campo antigo de atendimentos_motos (sem dados a migrar: tabela vazia).
alter table public.atendimentos_motos drop column if exists observacoes;

-- Inclui a nova tabela no cascade delete de atendimento.
create or replace function public.delete_atendimento_cascade(_atendimento_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
  _loja_id uuid;
BEGIN
  SELECT loja_id INTO _loja_id FROM public.atendimentos_motos WHERE id = _atendimento_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja_id) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  SELECT array_agg(id) INTO _avaliacao_ids FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  SELECT array_agg(id) INTO _contrato_consignante_ids FROM public.contratos_consignante WHERE atendimento_id = _atendimento_id;

  IF _contrato_consignante_ids IS NOT NULL THEN
    DELETE FROM public.custos_operacionais WHERE contrato_consignante_id = ANY(_contrato_consignante_ids);
  END IF;

  IF _avaliacao_ids IS NOT NULL THEN
    UPDATE public.estoque SET avaliacao_id = NULL WHERE avaliacao_id = ANY(_avaliacao_ids);
  END IF;
  UPDATE public.estoque SET atendimento_venda_id = NULL WHERE atendimento_venda_id = _atendimento_id;

  DELETE FROM public.respostas_nps WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.notifications WHERE entity_id = _atendimento_id;
  DELETE FROM public.observacoes_processo WHERE entity_id = _atendimento_id::text;
  DELETE FROM public.observacoes WHERE id_operacao = _atendimento_id;

  DELETE FROM public.status_history WHERE entity_id = _atendimento_id;
  IF _avaliacao_ids IS NOT NULL THEN
    DELETE FROM public.status_history WHERE entity_id = ANY(_avaliacao_ids);
    DELETE FROM public.observacoes_processo WHERE entity_id = ANY(SELECT unnest(_avaliacao_ids)::text);
    DELETE FROM public.notifications WHERE entity_id = ANY(_avaliacao_ids);
  END IF;

  DELETE FROM public.atendimentos_motos WHERE id = _atendimento_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'delete_atendimento_cascade falhou: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END;
$function$;
