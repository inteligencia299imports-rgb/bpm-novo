-- formas_pagamento_contrato: formas de pagamento do contrato de venda (feature religada).
-- RLS espelha as policies de "contratos" (via join contrato -> atendimento).
-- delete_avaliacao_cascade volta a limpar esta tabela (antes era "NULL; -- OFF").

create table if not exists public.formas_pagamento_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null,
  valor_total numeric,
  valor_entrada numeric,
  financeira text,
  numero_parcelas integer,
  valor_parcelas numeric,
  valor_financiado numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_formas_pagamento_contrato_contrato
  on public.formas_pagamento_contrato (contrato_id);

alter table public.formas_pagamento_contrato enable row level security;

drop policy if exists "Acesso formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Insert formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Update formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Delete formas_pagamento_contrato" on public.formas_pagamento_contrato;

create policy "Acesso formas_pagamento_contrato" on public.formas_pagamento_contrato
  for select to authenticated using (
    exists (select 1 from public.contratos c
            join public.atendimentos_motos a on a.id = c.atendimento_id
            where c.id = formas_pagamento_contrato.contrato_id
              and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))));
create policy "Insert formas_pagamento_contrato" on public.formas_pagamento_contrato
  for insert to authenticated with check (
    exists (select 1 from public.contratos c
            join public.atendimentos_motos a on a.id = c.atendimento_id
            where c.id = formas_pagamento_contrato.contrato_id
              and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))));
create policy "Update formas_pagamento_contrato" on public.formas_pagamento_contrato
  for update to authenticated using (
    exists (select 1 from public.contratos c
            join public.atendimentos_motos a on a.id = c.atendimento_id
            where c.id = formas_pagamento_contrato.contrato_id
              and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))))
  with check (
    exists (select 1 from public.contratos c
            join public.atendimentos_motos a on a.id = c.atendimento_id
            where c.id = formas_pagamento_contrato.contrato_id
              and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))));
create policy "Delete formas_pagamento_contrato" on public.formas_pagamento_contrato
  for delete to authenticated using (
    exists (select 1 from public.contratos c
            join public.atendimentos_motos a on a.id = c.atendimento_id
            where c.id = formas_pagamento_contrato.contrato_id
              and (a.vendedor_id = auth.uid() or has_master_or_gerente_empresa(auth.uid(), a.loja_id))));

CREATE OR REPLACE FUNCTION public.delete_avaliacao_cascade(_avaliacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _atendimento_id uuid;
  _contrato_ids uuid[];
  _loja_id uuid;
BEGIN
  SELECT a.loja_id, av.atendimento_id INTO _loja_id, _atendimento_id
  FROM public.avaliacoes av JOIN public.atendimentos_motos a ON a.id = av.atendimento_id
  WHERE av.id = _avaliacao_id;

  IF NOT public.has_master_or_gerente_empresa(auth.uid(), _loja_id) THEN
    RAISE EXCEPTION 'Unauthorized: only master/gerente can perform cascade deletes';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  DELETE FROM public.contratos_consignacao WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.estoque_motos WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.status_history WHERE entity_id = _avaliacao_id AND entity_type IN ('avaliacao', 'consulta', 'consignacao');
  DELETE FROM public.moto_fotos WHERE avaliacao_id = _avaliacao_id;
  DELETE FROM public.avaliacoes WHERE id = _avaliacao_id;

  SELECT array_agg(id) INTO _contrato_ids FROM public.contratos WHERE atendimento_id = _atendimento_id;
  IF _contrato_ids IS NOT NULL THEN
    DELETE FROM public.formas_pagamento_contrato WHERE contrato_id = ANY(_contrato_ids);
  END IF;
  DELETE FROM public.contratos WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.motos_interesse WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.avaliacoes WHERE atendimento_id = _atendimento_id;
  DELETE FROM public.status_history WHERE entity_id = _atendimento_id AND entity_type IN ('showroom', 'contrato', 'pos_venda');
  DELETE FROM public.atendimentos_motos WHERE id = _atendimento_id;
END;
$function$;
