-- Formas de pagamento também no contrato de intermediação (contratos_consignante):
-- a linha de formas_pagamento_contrato passa a pertencer a UM dos dois contratos
-- (contratos.id da venda/compra OU contratos_consignante.id da intermediação).

alter table public.formas_pagamento_contrato
  add column if not exists contrato_consignante_id uuid
    references public.contratos_consignante(id) on delete cascade;

alter table public.formas_pagamento_contrato
  alter column contrato_id drop not null;

alter table public.formas_pagamento_contrato
  drop constraint if exists formas_pagamento_contrato_um_contrato;
alter table public.formas_pagamento_contrato
  add constraint formas_pagamento_contrato_um_contrato
    check (num_nonnulls(contrato_id, contrato_consignante_id) = 1);

create index if not exists formas_pagamento_contrato_contrato_consignante_id_idx
  on public.formas_pagamento_contrato (contrato_consignante_id);

-- RLS: mesmo critério de antes (vendedor do atendimento ou master/gerente da loja),
-- chegando ao atendimento por contratos OU por contratos_consignante.
create or replace function public.pode_acessar_forma_pagamento_contrato(_contrato_id uuid, _contrato_consignante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.atendimentos_motos a
     where a.id = coalesce(
             (select c.atendimento_id from public.contratos c where c.id = _contrato_id),
             (select cc.atendimento_id from public.contratos_consignante cc where cc.id = _contrato_consignante_id)
           )
       and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
  );
$$;

drop policy if exists "Acesso formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Insert formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Update formas_pagamento_contrato" on public.formas_pagamento_contrato;
drop policy if exists "Delete formas_pagamento_contrato" on public.formas_pagamento_contrato;

create policy "Acesso formas_pagamento_contrato" on public.formas_pagamento_contrato
  for select using (public.pode_acessar_forma_pagamento_contrato(contrato_id, contrato_consignante_id));
create policy "Insert formas_pagamento_contrato" on public.formas_pagamento_contrato
  for insert with check (public.pode_acessar_forma_pagamento_contrato(contrato_id, contrato_consignante_id));
create policy "Update formas_pagamento_contrato" on public.formas_pagamento_contrato
  for update using (public.pode_acessar_forma_pagamento_contrato(contrato_id, contrato_consignante_id))
  with check (public.pode_acessar_forma_pagamento_contrato(contrato_id, contrato_consignante_id));
create policy "Delete formas_pagamento_contrato" on public.formas_pagamento_contrato
  for delete using (public.pode_acessar_forma_pagamento_contrato(contrato_id, contrato_consignante_id));
