-- =====================================================================
-- Unifica motos_avaliacao dentro de avaliacoes.
-- As duas tabelas eram 1:1 (avaliacoes.moto_avaliacao_id -> motos_avaliacao.id,
-- e as duas ja tinham atendimento_id direto) so pra guardar, respectivamente,
-- o processo/negociacao e a moto sendo avaliada. Passa a existir uma unica
-- linha (avaliacoes) com identidade unica (avaliacoes.id), sem duplicar
-- nada do atendimento (continua so referenciando atendimento_id).
--
-- Todo passo abaixo e seguro pra rodar de novo (idempotente), inclusive se
-- essa migration ja tiver parado no meio numa tentativa anterior -- o
-- Supabase SQL Editor roda statement por statement, entao o que veio antes
-- de um erro ja fica aplicado.
-- =====================================================================

-- 1) novas colunas em avaliacoes (nullable neste passo, pra poder popular)
alter table public.avaliacoes
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists ano_fabricacao text,
  add column if not exists ano_modelo text,
  add column if not exists categoria text,
  add column if not exists cilindrada text,
  add column if not exists cor text,
  add column if not exists km text,
  add column if not exists placa text,
  add column if not exists observacoes text,
  add column if not exists tem_manual boolean,
  add column if not exists tem_chave_reserva boolean,
  add column if not exists manutencao_vencida boolean,
  add column if not exists crlv_url text,
  add column if not exists atpv_url text,
  add column if not exists procuracao_url text,
  add column if not exists consulta_realizada boolean,
  add column if not exists consulta_solicitada boolean,
  add column if not exists resultado_consulta text,
  add column if not exists enviada_avaliacao boolean;

-- 2) backfill a partir de motos_avaliacao (so roda se a tabela antiga ainda existir)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'motos_avaliacao') then
    update public.avaliacoes a
    set marca = ma.marca,
        modelo = ma.modelo,
        ano_fabricacao = ma.ano_fabricacao,
        ano_modelo = ma.ano_modelo,
        categoria = ma.categoria,
        cilindrada = ma.cilindrada,
        cor = ma.cor,
        km = ma.km,
        placa = ma.placa,
        observacoes = ma.observacoes,
        tem_manual = ma.tem_manual,
        tem_chave_reserva = ma.tem_chave_reserva,
        manutencao_vencida = ma.manutencao_vencida,
        crlv_url = ma.crlv_url,
        atpv_url = ma.atpv_url,
        procuracao_url = ma.procuracao_url,
        consulta_realizada = ma.consulta_realizada,
        consulta_solicitada = ma.consulta_solicitada,
        resultado_consulta = ma.resultado_consulta,
        enviada_avaliacao = ma.enviada_avaliacao
    from public.motos_avaliacao ma
    where ma.id = a.moto_avaliacao_id;
  end if;
end $$;

-- 3) marca/modelo eram NOT NULL em motos_avaliacao
alter table public.avaliacoes
  alter column marca set not null,
  alter column modelo set not null;

-- 4) remapeia status_history: entity_type 'avaliacao'/'consulta' as vezes
-- guardavam motos_avaliacao.id como entity_id (nao avaliacoes.id) --
-- confirmado em AvaliacaoForm.tsx (entity_id: avaliacao.moto_avaliacao_id)
-- e em todos os inserts de entity_type 'consulta'. Agora que so existe
-- avaliacoes.id, remapeia pra ele. So roda se a coluna antiga ainda existir.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'avaliacoes' and column_name = 'moto_avaliacao_id') then
    update public.status_history sh
    set entity_id = av.id
    from public.avaliacoes av
    where sh.entity_type in ('avaliacao', 'consulta')
      and sh.entity_id = av.moto_avaliacao_id;
  end if;
end $$;

-- 5) estoque tinha dois caminhos independentes (avaliacao_id / moto_avaliacao_id)
-- pro mesmo registro -- unifica em avaliacao_id e derruba a coluna redundante.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'estoque' and column_name = 'moto_avaliacao_id') then
    update public.estoque e
    set avaliacao_id = av.id
    from public.avaliacoes av
    where av.moto_avaliacao_id = e.moto_avaliacao_id
      and e.avaliacao_id is null
      and e.moto_avaliacao_id is not null;
  end if;
end $$;

alter table public.estoque drop column if exists moto_avaliacao_id;

-- 6) moto_fotos passa a apontar direto pra avaliacoes
alter table public.moto_fotos add column if not exists avaliacao_id uuid references public.avaliacoes(id);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'moto_fotos' and column_name = 'moto_avaliacao_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'avaliacoes' and column_name = 'moto_avaliacao_id') then
    update public.moto_fotos mf
    set avaliacao_id = av.id
    from public.avaliacoes av
    where av.moto_avaliacao_id = mf.moto_avaliacao_id
      and mf.avaliacao_id is null;
  end if;
end $$;

alter table public.moto_fotos alter column avaliacao_id set not null;

-- 7) moto_fotos RLS: junta direto com avaliacoes (nao precisa mais de motos_avaliacao)
-- PRECISA vir antes do drop column moto_avaliacao_id (as policies antigas
-- dependem dela -- essa era a ordem errada da tentativa anterior).
drop policy if exists "Acesso fotos" on public.moto_fotos;
drop policy if exists "Insert fotos" on public.moto_fotos;
drop policy if exists "Delete fotos" on public.moto_fotos;

create policy "Acesso fotos" on public.moto_fotos for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = moto_fotos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Insert fotos" on public.moto_fotos for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = moto_fotos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
    )
  );

create policy "Delete fotos" on public.moto_fotos for delete to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = moto_fotos.avaliacao_id
        and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
    )
  );

-- so agora, com as policies novas ja no lugar, e seguro derrubar a coluna antiga
alter table public.moto_fotos drop column if exists moto_avaliacao_id;

-- 7b) storage.objects (bucket moto-fotos) tambem tinha policies apontando
-- pra motos_avaliacao (criadas via dashboard, fora das migrations) -- sem
-- isso o "drop table motos_avaliacao" barra no final por dependencia.
drop policy if exists "Upload moto photos" on storage.objects;
create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos_motos a
          where a.cliente_id::text = (storage.foldername(objects.name))[2]
            and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
        )
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

drop policy if exists "Update moto photos" on storage.objects;
create policy "Update moto photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos_motos a
          where a.cliente_id::text = (storage.foldername(objects.name))[2]
            and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
        )
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

drop policy if exists "Delete moto photos" on storage.objects;
create policy "Delete moto photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
        and exists (
          select 1 from public.atendimentos_motos a
          where a.cliente_id::text = (storage.foldername(objects.name))[2]
            and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
        )
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and public.has_master_or_gerente_empresa(auth.uid(), a.loja)
      )
    )
  );

-- 8) status_history: simplifica a policy (dado ja remapeado no passo 4) e
-- corrige 'consulta', que estava incorretamente agrupado com o array que
-- checa atendimentos.id -- entity_id de 'consulta' nunca foi atendimento_id,
-- sempre foi motos_avaliacao.id (e agora avaliacoes.id).
drop policy if exists "Acesso status_history" on public.status_history;

create policy "Acesso status_history" on public.status_history for select to authenticated
  using (
    changed_by = auth.uid()
    or public.has_app_role(auth.uid(), 'master')
    or (
      entity_type = any (array['atendimento','pos_venda','intermediacao'])
      and exists (
        select 1 from public.atendimentos_motos a
        where a.id = status_history.entity_id
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
    or (
      entity_type = any (array['avaliacao','pos_compra','consignacao','preparacao','showroom','consulta'])
      and exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id = status_history.entity_id
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja))
      )
    )
  );

-- 9) function orfa: a policy que a chamava ja tinha sido removida antes
-- (confirmado: nao aparece em nenhuma migration a partir de 20260826152724)
drop function if exists public.moto_has_avaliacao_preparacao(uuid);

-- 10) cascade deletes: remove os ramos de motos_avaliacao/moto_avaliacao_id.
-- Tambem corrige um gap pre-existente em delete_avaliacao_cascade: so
-- limpava status_history keyed por moto_avaliacao_id, nao as linhas
-- 'avaliacao' keyed por avaliacao_id (ex: StatusChangeDialog/RetiradaDialog).
-- Com o remap do passo 4, os dois casos convergem pro mesmo id.
create or replace function public.delete_atendimento_cascade(_atendimento_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _avaliacao_ids uuid[];
  _contrato_consignante_ids uuid[];
  _loja text;
BEGIN
  SELECT loja INTO _loja FROM public.atendimentos_motos WHERE id = _atendimento_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja) THEN
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

create or replace function public.delete_avaliacao_cascade(_avaliacao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _atendimento_id uuid;
  _contrato_ids uuid[];
  _loja text;
BEGIN
  SELECT a.loja, av.atendimento_id INTO _loja, _atendimento_id
  FROM public.avaliacoes av JOIN public.atendimentos_motos a ON a.id = av.atendimento_id
  WHERE av.id = _avaliacao_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  DELETE FROM public.contratos_consignacao WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.estoque WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.status_history WHERE entity_id = _avaliacao_id AND entity_type IN ('avaliacao', 'consulta', 'consignacao');
  DELETE FROM public.moto_fotos WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.avaliacoes WHERE id = _avaliacao_id;

  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;
  IF _contrato_ids IS NOT NULL THEN
    DELETE FROM public.formas_pagamento WHERE contrato_id = ANY(_contrato_ids);
  END IF;
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');
  DELETE FROM public.atendimentos_motos WHERE id = _atendimento_id;
END;
$function$;

-- 11) avaliacoes: dropa a indirecao
alter table public.avaliacoes drop column if exists moto_avaliacao_id;

-- 12) motos_avaliacao: dropa a tabela (leva junto as proprias RLS policies)
drop table if exists public.motos_avaliacao;
