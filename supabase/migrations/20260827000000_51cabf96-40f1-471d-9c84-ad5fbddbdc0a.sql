-- =====================================================================
-- atendimentos_motos.loja (texto) -> loja_id (FK para loja_empresas.id)
-- Mesma normalizacao ja feita em user_roles.loja_principal -> loja_id.
-- Todas as definicoes de policy/function abaixo foram puxadas ao vivo do
-- banco (pg_policies / pg_proc) antes de escrever esta migration, entao
-- refletem o estado real (inclusive as policies criadas em migrations
-- anteriores que so existiam no banco, nao no texto de uma migration
-- "atual" isolada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Overloads de autorizacao por uuid (nao substituem as versoes texto:
--    estoque.loja continua texto solto, fora de escopo desta migration).
--    Postgres despacha por assinatura -- as duas convivem.
-- ---------------------------------------------------------------------
create or replace function public.user_has_empresa(_user_id uuid, _loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_empresas ue
    join public.loja_empresas le on le.empresa_id = ue.empresa_id
    where ue.user_id = _user_id and le.id = _loja_id
  )
$$;

create or replace function public.has_master_or_gerente_empresa(_user_id uuid, _loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_app_role(_user_id, 'master')
    or (public.has_app_role(_user_id, 'gerente') and public.user_has_empresa(_user_id, _loja_id))
$$;

-- ---------------------------------------------------------------------
-- 2) Coluna: atendimentos_motos.loja -> loja_id
-- ---------------------------------------------------------------------
alter table public.atendimentos_motos add column if not exists loja_id uuid references public.loja_empresas(id);

update public.atendimentos_motos a
set loja_id = le.id
from public.loja_empresas le
where le.loja = a.loja and le.sistema = 'motos' and a.loja_id is null;

alter table public.atendimentos_motos alter column loja_id set not null;

-- ---------------------------------------------------------------------
-- 3) Policies (55, geradas a partir do dump ao vivo do banco: a.loja ->
--    a.loja_id, e a coluna propria de atendimentos_motos loja -> loja_id).
--    estoque fica de fora -- usa sua propria coluna loja, sem relacao com
--    atendimentos_motos.
--    IMPORTANTE: drop column loja so pode acontecer DEPOIS que todas as
--    policies abaixo forem recriadas usando loja_id -- senao a coluna
--    ainda tem policies antigas dependendo dela (2BP01).
-- ---------------------------------------------------------------------
drop policy if exists "Acesso atendimentos" on public.atendimentos_motos;
create policy "Acesso atendimentos" on public.atendimentos_motos for select to authenticated
  using (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));

drop policy if exists "Deleta atendimentos" on public.atendimentos_motos;
create policy "Deleta atendimentos" on public.atendimentos_motos for delete to authenticated
  using (has_master_or_gerente_empresa(auth.uid(), loja_id));

drop policy if exists "Edita atendimentos" on public.atendimentos_motos;
create policy "Edita atendimentos" on public.atendimentos_motos for update to authenticated
  using (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));

drop policy if exists "Vendedor cria atendimentos" on public.atendimentos_motos;
create policy "Vendedor cria atendimentos" on public.atendimentos_motos for insert to authenticated
  with check (((auth.uid() = vendedor_id) OR has_master_or_gerente_empresa(auth.uid(), loja_id)));

drop policy if exists "Acesso avaliacoes" on public.avaliacoes;
create policy "Acesso avaliacoes" on public.avaliacoes for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete avaliacoes" on public.avaliacoes;
create policy "Delete avaliacoes" on public.avaliacoes for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert avaliacoes" on public.avaliacoes;
create policy "Insert avaliacoes" on public.avaliacoes for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update avaliacoes" on public.avaliacoes;
create policy "Update avaliacoes" on public.avaliacoes for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = avaliacoes.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso consignacao_processos" on public.consignacao_processos;
create policy "Acesso consignacao_processos" on public.consignacao_processos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete consignacao_processos" on public.consignacao_processos;
create policy "Delete consignacao_processos" on public.consignacao_processos for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert consignacao_processos" on public.consignacao_processos;
create policy "Insert consignacao_processos" on public.consignacao_processos for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update consignacao_processos" on public.consignacao_processos;
create policy "Update consignacao_processos" on public.consignacao_processos for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = consignacao_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso contratos" on public.contratos;
create policy "Acesso contratos" on public.contratos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Insert contratos" on public.contratos;
create policy "Insert contratos" on public.contratos for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update contratos" on public.contratos;
create policy "Update contratos" on public.contratos for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso contratos_consignacao" on public.contratos_consignacao;
create policy "Acesso contratos_consignacao" on public.contratos_consignacao for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Insert contratos_consignacao" on public.contratos_consignacao;
create policy "Insert contratos_consignacao" on public.contratos_consignacao for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update contratos_consignacao" on public.contratos_consignacao;
create policy "Update contratos_consignacao" on public.contratos_consignacao for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = contratos_consignacao.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso contratos_consignante" on public.contratos_consignante;
create policy "Acesso contratos_consignante" on public.contratos_consignante for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Insert contratos_consignante" on public.contratos_consignante;
create policy "Insert contratos_consignante" on public.contratos_consignante for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update contratos_consignante" on public.contratos_consignante;
create policy "Update contratos_consignante" on public.contratos_consignante for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = contratos_consignante.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso custos_oficina" on public.custos_oficina;
create policy "Acesso custos_oficina" on public.custos_oficina for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete custos_oficina" on public.custos_oficina;
create policy "Delete custos_oficina" on public.custos_oficina for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert custos_oficina" on public.custos_oficina;
create policy "Insert custos_oficina" on public.custos_oficina for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update custos_oficina" on public.custos_oficina;
create policy "Update custos_oficina" on public.custos_oficina for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = custos_oficina.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso custos_operacionais" on public.custos_operacionais;
create policy "Acesso custos_operacionais" on public.custos_operacionais for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete custos_operacionais" on public.custos_operacionais;
create policy "Delete custos_operacionais" on public.custos_operacionais for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert custos_operacionais" on public.custos_operacionais;
create policy "Insert custos_operacionais" on public.custos_operacionais for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update custos_operacionais" on public.custos_operacionais;
create policy "Update custos_operacionais" on public.custos_operacionais for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos_consignante cc
     JOIN atendimentos_motos a ON ((a.id = cc.atendimento_id)))
  WHERE ((cc.id = custos_operacionais.contrato_consignante_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso formas_pagamento" on public.formas_pagamento;
create policy "Acesso formas_pagamento" on public.formas_pagamento for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos c
     JOIN atendimentos_motos a ON ((a.id = c.atendimento_id)))
  WHERE ((c.id = formas_pagamento.contrato_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete formas_pagamento" on public.formas_pagamento;
create policy "Delete formas_pagamento" on public.formas_pagamento for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos c
     JOIN atendimentos_motos a ON ((a.id = c.atendimento_id)))
  WHERE ((c.id = formas_pagamento.contrato_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert formas_pagamento" on public.formas_pagamento;
create policy "Insert formas_pagamento" on public.formas_pagamento for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (contratos c
     JOIN atendimentos_motos a ON ((a.id = c.atendimento_id)))
  WHERE ((c.id = formas_pagamento.contrato_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update formas_pagamento" on public.formas_pagamento;
create policy "Update formas_pagamento" on public.formas_pagamento for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (contratos c
     JOIN atendimentos_motos a ON ((a.id = c.atendimento_id)))
  WHERE ((c.id = formas_pagamento.contrato_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso fotos" on public.moto_fotos;
create policy "Acesso fotos" on public.moto_fotos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete fotos" on public.moto_fotos;
create policy "Delete fotos" on public.moto_fotos for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert fotos" on public.moto_fotos;
create policy "Insert fotos" on public.moto_fotos for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = moto_fotos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso motos interesse" on public.motos_interesse;
create policy "Acesso motos interesse" on public.motos_interesse for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete motos interesse" on public.motos_interesse;
create policy "Delete motos interesse" on public.motos_interesse for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert motos interesse" on public.motos_interesse;
create policy "Insert motos interesse" on public.motos_interesse for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update motos interesse" on public.motos_interesse;
create policy "Update motos interesse" on public.motos_interesse for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = motos_interesse.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso observacoes_processo" on public.observacoes_processo;
create policy "Acesso observacoes_processo" on public.observacoes_processo for select to authenticated
  using (((usuario_id = (auth.uid())::text) OR has_app_role(auth.uid(), 'master'::app_role) OR ((entity_type = ANY (ARRAY['atendimento'::text, 'pos_venda'::text, 'intermediacao'::text])) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.id)::text = observacoes_processo.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))) OR ((entity_type = ANY (ARRAY['avaliacao'::text, 'pos_compra'::text, 'consignacao'::text, 'preparacao'::text])) AND (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = observacoes_processo.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));

drop policy if exists "Acesso pos_compra_processos" on public.pos_compra_processos;
create policy "Acesso pos_compra_processos" on public.pos_compra_processos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Insert pos_compra_processos" on public.pos_compra_processos;
create policy "Insert pos_compra_processos" on public.pos_compra_processos for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update pos_compra_processos" on public.pos_compra_processos;
create policy "Update pos_compra_processos" on public.pos_compra_processos for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = pos_compra_processos.avaliacao_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso pos_venda_processos" on public.pos_venda_processos;
create policy "Acesso pos_venda_processos" on public.pos_venda_processos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Insert pos_venda_processos" on public.pos_venda_processos;
create policy "Insert pos_venda_processos" on public.pos_venda_processos for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Update pos_venda_processos" on public.pos_venda_processos;
create policy "Update pos_venda_processos" on public.pos_venda_processos for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = pos_venda_processos.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Acesso respostas_nps" on public.respostas_nps;
create policy "Acesso respostas_nps" on public.respostas_nps for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))));

drop policy if exists "Delete respostas_nps" on public.respostas_nps;
create policy "Delete respostas_nps" on public.respostas_nps for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Insert respostas_nps" on public.respostas_nps;
create policy "Insert respostas_nps" on public.respostas_nps for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Update respostas_nps" on public.respostas_nps;
create policy "Update respostas_nps" on public.respostas_nps for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = respostas_nps.atendimento_id) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))));

drop policy if exists "Acesso status_history" on public.status_history;
create policy "Acesso status_history" on public.status_history for select to authenticated
  using (((changed_by = auth.uid()) OR has_app_role(auth.uid(), 'master'::app_role) OR ((entity_type = ANY (ARRAY['atendimento'::text, 'pos_venda'::text, 'intermediacao'::text])) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE ((a.id = status_history.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))) OR ((entity_type = ANY (ARRAY['avaliacao'::text, 'pos_compra'::text, 'consignacao'::text, 'preparacao'::text, 'showroom'::text, 'consulta'::text])) AND (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE ((av.id = status_history.entity_id) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));

drop policy if exists "Delete moto photos" on storage.objects;
create policy "Delete moto photos" on storage.objects for delete to authenticated
  using (((bucket_id = 'moto-fotos'::text) AND ((((storage.foldername(name))[1] = 'docs'::text) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id))))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[1]) AND has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))));

drop policy if exists "Update moto photos" on storage.objects;
create policy "Update moto photos" on storage.objects for update to authenticated
  using (((bucket_id = 'moto-fotos'::text) AND ((((storage.foldername(name))[1] = 'docs'::text) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[1]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));

drop policy if exists "Upload moto photos" on storage.objects;
create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (((bucket_id = 'moto-fotos'::text) AND ((((storage.foldername(name))[1] = 'docs'::text) AND (EXISTS ( SELECT 1
   FROM atendimentos_motos a
  WHERE (((a.cliente_id)::text = (storage.foldername(objects.name))[2]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id)))))) OR (EXISTS ( SELECT 1
   FROM (avaliacoes av
     JOIN atendimentos_motos a ON ((a.id = av.atendimento_id)))
  WHERE (((av.id)::text = (storage.foldername(objects.name))[1]) AND ((a.vendedor_id = auth.uid()) OR has_master_or_gerente_empresa(auth.uid(), a.loja_id))))))));

-- Agora sim: nenhuma policy mais depende de atendimentos_motos.loja.
alter table public.atendimentos_motos drop column if exists loja;

-- ---------------------------------------------------------------------
-- 4) Cascade deletes: resolvem loja_id direto (sem join, o novo overload
--    de has_master_or_gerente_empresa aceita uuid).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5) Funcoes de relatorio: onde faziam JOIN atendimentos_motos a e usavam
--    a.loja, passam a fazer tambem JOIN loja_empresas le ON le.id = a.loja_id
--    e usar le.loja. Os parametros de filtro (_loja/p_loja text) NAO mudam.
--    relatorio_estoque_kpis/_mensal/_kpis_comparado ficam de fora -- so
--    usam estoque.loja (coluna propria, fora de escopo).
-- ---------------------------------------------------------------------
create or replace function public.relatorio_avaliacoes_avaliadores(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v record;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := 'todos'; END IF;
  FOR v IN
    SELECT DISTINCT av.avaliador_id, ur.nome
    FROM avaliacoes av LEFT JOIN user_roles ur ON ur.user_id = av.avaliador_id
    WHERE av.avaliador_id IS NOT NULL
  LOOP
    DECLARE v_avaliacoes bigint; v_aq_trocar bigint; v_aq_vender bigint; v_aq_propria bigint; v_aq_consignada bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes
      FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.avaliador_id = v.avaliador_id AND av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND (_date_from IS NULL OR av.created_at >= _date_from) AND (_date_to IS NULL OR av.created_at <= _date_to);
      WITH base AS (
        SELECT av.id, av.tipo_aquisicao, a.interesse,
          COALESCE((SELECT MIN(sh.created_at) FROM status_history sh WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'), av.updated_at, av.created_at) AS data_aq
        FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
        WHERE av.avaliador_id = v.avaliador_id AND av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
      ), filt AS (SELECT * FROM base WHERE (_date_from IS NULL OR data_aq >= _date_from) AND (_date_to IS NULL OR data_aq <= _date_to))
      SELECT COUNT(*) FILTER (WHERE interesse = 'trocar'), COUNT(*) FILTER (WHERE interesse = 'vender'),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')),
        COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aq_trocar, v_aq_vender, v_aq_propria, v_aq_consignada FROM filt;
      IF v_avaliacoes > 0 OR (COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0)) > 0 THEN
        result := result || jsonb_build_object('nome', COALESCE(v.nome,'-'), 'avaliacoes', v_avaliacoes, 'aqTrocar', COALESCE(v_aq_trocar,0), 'aqVender', COALESCE(v_aq_vender,0), 'aqPropria', COALESCE(v_aq_propria,0), 'aqConsignada', COALESCE(v_aq_consignada,0), 'total', COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0), 'conversao', CASE WHEN v_avaliacoes > 0 THEN round((COALESCE(v_aq_trocar,0)+COALESCE(v_aq_vender,0))::numeric / v_avaliacoes, 4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_avaliacoes_kpis(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default null::text)
returns json
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_loja text := lower(trim(coalesce(_loja, '')));
  v_result json;
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := NULL; END IF;

  WITH base AS (
    SELECT
      av.id,
      CASE
        WHEN coalesce(translate(lower(trim(av.tipo_aquisicao)),
                                'áàâãäéèêëíìîïóòôõöúùûüç',
                                'aaaaaeeeeiiiiooooouuuuc'), '') IN ('', 'propria')
          THEN 'propria'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('consignada','consignacao','consignado')
          THEN 'consignada'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('convertida','convertido')
          THEN 'convertida'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') IN ('test-ride','test ride','testride')
          THEN 'test-ride'
        WHEN translate(lower(trim(av.tipo_aquisicao)),
                       'áàâãäéèêëíìîïóòôõöúùûüç',
                       'aaaaaeeeeiiiiooooouuuuc') = 'repasse'
          THEN 'repasse'
        ELSE 'propria'
      END AS tipo_norm,
      av.situacao,
      av.created_at,
      av.updated_at,
      a.interesse,
      COALESCE(
        (SELECT MIN(sh.created_at) FROM status_history sh
          WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
        av.updated_at, av.created_at
      ) AS data_aquisicao
    FROM avaliacoes av
    JOIN atendimentos_motos a ON a.id = av.atendimento_id
    JOIN loja_empresas le ON le.id = a.loja_id
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND (v_loja IS NULL OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
  ),
  filtrado_avaliacoes AS (
    SELECT * FROM base
    WHERE (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to   IS NULL OR created_at <= _date_to)
  ),
  filtrado_aquisicoes AS (
    SELECT * FROM base
    WHERE situacao = 'adquirida'
      AND (_date_from IS NULL OR data_aquisicao >= _date_from)
      AND (_date_to   IS NULL OR data_aquisicao <= _date_to)
  )
  SELECT json_build_object(
    'total_avaliacoes',       (SELECT COUNT(*) FROM filtrado_avaliacoes),
    'total_aquisicoes',       (SELECT COUNT(*) FROM filtrado_aquisicoes),
    'aquisicoes_propria',     (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm IN ('propria','convertida','repasse','test-ride')),
    'aquisicoes_consignada',  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm = 'consignada'),
    'aquisicoes_convertida',  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE tipo_norm = 'convertida'),
    'entrada_direta',         (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'vender'),
    'troca',                  (SELECT COUNT(*) FROM filtrado_aquisicoes WHERE interesse = 'trocar'),
    'retiradas',              (SELECT COUNT(*) FROM filtrado_avaliacoes WHERE situacao = 'retirada')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

create or replace function public.relatorio_avaliacoes_mensal(_loja text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
  v_loja text := lower(trim(coalesce(_loja, 'todos')));
BEGIN
  IF v_loja IN ('', 'todos') THEN v_loja := 'todos'; END IF;
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := v_cs_d::timestamptz;
    v_cycle_end := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_avaliacoes bigint; v_aquisicoes bigint; v_proprias bigint; v_consignadas bigint; v_neg_trocar bigint; v_neg_vender bigint;
    BEGIN
      SELECT count(*) INTO v_avaliacoes FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      WITH base AS (
        SELECT av.id, av.tipo_aquisicao,
          COALESCE((SELECT MIN(sh.created_at) FROM status_history sh WHERE sh.entity_id = av.id AND sh.entity_type='avaliacao' AND sh.status='adquirida'), av.updated_at, av.created_at) AS data_aq
        FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
        WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
          AND lower(trim(coalesce(av.tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
          AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
      ) SELECT COUNT(*), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')), COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação'))
      INTO v_aquisicoes, v_proprias, v_consignadas FROM base WHERE data_aq >= v_cycle_start AND data_aq <= v_cycle_end;
      SELECT count(*) FILTER (WHERE a.interesse='trocar'), count(*) FILTER (WHERE a.interesse='vender') INTO v_neg_trocar, v_neg_vender
      FROM avaliacoes av JOIN atendimentos_motos a ON a.id = av.atendimento_id JOIN loja_empresas le ON le.id = a.loja_id
      WHERE av.situacao <> 'sem_avaliar' AND a.interesse IN ('trocar','vender')
        AND (v_loja = 'todos' OR norm_loja(le.loja) = norm_loja(v_loja) OR lower(le.loja) = v_loja)
        AND av.created_at >= v_cycle_start AND av.created_at <= v_cycle_end;
      result := result || jsonb_build_object('label', v_label, 'mes', v_label, 'avaliacoes', v_avaliacoes, 'aquisicoes', v_aquisicoes, 'proprias', v_proprias, 'consignadas', v_consignadas, 'negTrocar', v_neg_trocar, 'negVender', v_neg_vender);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_avaliacoes_por_avaliador(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  WITH v_loja AS (
    SELECT lower(trim(coalesce(_loja, 'todos'))) AS l
  ),
  base AS (
    SELECT av.id, av.avaliador_id, av.tipo_aquisicao, av.created_at, av.updated_at, a.interesse,
      COALESCE((SELECT MIN(sh.created_at) FROM status_history sh
                WHERE sh.entity_id = av.id AND sh.entity_type = 'avaliacao' AND sh.status = 'adquirida'),
               av.updated_at, av.created_at) AS data_aq
    FROM avaliacoes av
    JOIN atendimentos_motos a ON a.id = av.atendimento_id
    JOIN loja_empresas le ON le.id = a.loja_id
    CROSS JOIN v_loja
    WHERE av.situacao <> 'sem_avaliar'
      AND a.interesse IN ('trocar','vender')
      AND av.avaliador_id IS NOT NULL
      AND (v_loja.l IN ('', 'todos')
           OR norm_loja(le.loja) = norm_loja(v_loja.l)
           OR lower(le.loja) = v_loja.l)
  ),
  aval_periodo AS (
    SELECT avaliador_id, COUNT(*) AS avaliacoes
    FROM base
    WHERE (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to IS NULL OR created_at <= _date_to)
    GROUP BY avaliador_id
  ),
  aq_periodo AS (
    SELECT avaliador_id,
      COUNT(*) FILTER (WHERE interesse = 'trocar') AS aqTrocar,
      COUNT(*) FILTER (WHERE interesse = 'vender') AS aqVender,
      COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','convertida','repasse','test-ride','test ride')) AS aqPropria,
      COUNT(*) FILTER (WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('consignada','consignacao','consignação')) AS aqConsignada
    FROM base
    WHERE lower(trim(coalesce(tipo_aquisicao,''))) IN ('propria','própria','consignada','convertida','repasse','test-ride','test ride','consignacao','consignação')
      AND (_date_from IS NULL OR data_aq >= _date_from)
      AND (_date_to IS NULL OR data_aq <= _date_to)
    GROUP BY avaliador_id
  ),
  merged AS (
    SELECT COALESCE(a.avaliador_id, q.avaliador_id) AS avaliador_id,
      COALESCE(a.avaliacoes, 0) AS avaliacoes,
      COALESCE(q.aqTrocar, 0) AS aqTrocar,
      COALESCE(q.aqVender, 0) AS aqVender,
      COALESCE(q.aqPropria, 0) AS aqPropria,
      COALESCE(q.aqConsignada, 0) AS aqConsignada
    FROM aval_periodo a
    FULL OUTER JOIN aq_periodo q ON q.avaliador_id = a.avaliador_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'avaliador_id', avaliador_id,
    'avaliacoes', avaliacoes,
    'aqTrocar', aqTrocar,
    'aqVender', aqVender,
    'aqPropria', aqPropria,
    'aqConsignada', aqConsignada
  )), '[]'::jsonb) FROM merged;
$function$;

create or replace function public.relatorio_showroom_kpis(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text, _tipo text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE v_qtd_atendimentos bigint; v_qtd_vendas bigint; v_qtd_sinais bigint;
  v_faturamento_previsto numeric := 0; v_faturamento_realizado numeric := 0;
  v_margem_prevista numeric := 0; v_margem_realizada numeric := 0; v_total_quanto_vende numeric := 0; rec record;
BEGIN
  SELECT count(*) INTO v_qtd_atendimentos FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
  WHERE (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
    AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_qtd_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
  WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
    AND a.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
    AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
  SELECT count(*) INTO v_qtd_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.situacao = 'sinal' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja);
  FOR rec IN SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.id as estoque_id, e.preco as estoque_preco, e.valor_venda as estoque_valor_venda, e.tipo as estoque_tipo, av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
    FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id = a.id LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    WHERE a.situacao = 'vendido' AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
      AND a.data_venda IS NOT NULL AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
      AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to)
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende, 0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento, 0);
      v_preco_estoque numeric := COALESCE(rec.estoque_preco, 0); v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric; v_custo_oficina_loja_prev numeric; v_custo_processo_loja numeric; v_custo_prev_cliente numeric; v_custo_real_cliente numeric; v_custo_op_loja numeric; v_fat_real numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel)='cliente';
      ELSE v_custo_oficina_loja_exec := 0; v_custo_oficina_loja_prev := 0; v_custo_processo_loja := 0; v_custo_prev_cliente := 0; v_custo_real_cliente := 0;
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel)='loja';
      v_faturamento_previsto := v_faturamento_previsto + v_quanto_vende; v_total_quanto_vende := v_total_quanto_vende + v_quanto_vende;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_faturamento_realizado := v_faturamento_realizado + v_fat_real;
      v_margem_prevista := v_margem_prevista + (v_quanto_vende - v_valor_fechamento);
      v_margem_realizada := v_margem_realizada + (v_fat_real - (v_valor_fechamento + 445 + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja));
    END;
  END LOOP;
  RETURN jsonb_build_object('qtdAtendimentos', v_qtd_atendimentos, 'qtdVendas', v_qtd_vendas, 'qtdSinais', v_qtd_sinais,
    'taxaConversao', CASE WHEN v_qtd_atendimentos > 0 THEN round((v_qtd_vendas::numeric / v_qtd_atendimentos), 4) ELSE 0 END,
    'faturamentoPrevisto', round(v_faturamento_previsto,2), 'faturamentoRealizado', round(v_faturamento_realizado,2),
    'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_total_quanto_vende > 0 THEN round(v_margem_prevista / v_total_quanto_vende, 4) ELSE 0 END,
    'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_faturamento_realizado > 0 THEN round(v_margem_realizada / v_faturamento_realizado, 4) ELSE 0 END);
END;
$function$;

create or replace function public.relatorio_showroom_mensal(_loja text default 'todos'::text, _tipo text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21';
  v_now date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cycle_start timestamptz; v_cycle_end timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cycle_start := (v_cs_d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
    v_cycle_end := ((v_ce_d::timestamp + interval '23 hours 59 minutes 59 seconds 999 milliseconds') AT TIME ZONE 'America/Sao_Paulo');
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');

    DECLARE
      v_atend bigint; v_vendas bigint;
      v_faturamento numeric := 0; v_faturamento_real numeric := 0;
      v_margem_prevista numeric := 0; v_margem_realizada numeric := 0;
      v_total_qv numeric := 0; rec record;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
      WHERE (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
        AND a.created_at >= v_cycle_start AND a.created_at <= v_cycle_end;

      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id
      LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
      WHERE a.situacao = 'vendido'
        AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
        AND a.data_venda IS NOT NULL
        AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
        AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end;

      FOR rec IN
        SELECT a.id as atend_id, a.valor_venda as atend_valor_venda, e.preco, e.valor_venda as estoque_valor_venda,
               av.id as avaliacao_id, av.quanto_vende, av.valor_fechamento
        FROM atendimentos_motos a
        JOIN loja_empresas le ON le.id = a.loja_id
        LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
        LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
        WHERE a.situacao = 'vendido'
          AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
          AND a.data_venda IS NOT NULL
          AND (_tipo = 'todos' OR COALESCE(e.tipo, 'propria') = _tipo)
          AND a.data_venda >= v_cycle_start AND a.data_venda <= v_cycle_end
      LOOP
        DECLARE
          vvr numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.preco, 0);
          qv numeric := COALESCE(rec.quanto_vende, 0);
          vf numeric := COALESCE(rec.valor_fechamento, 0);
          cole numeric; colp numeric; cpl numeric; cpc numeric; crc numeric; cop numeric; fr numeric;
        BEGIN
          IF rec.avaliacao_id IS NOT NULL THEN
            SELECT COALESCE(SUM(valor_executado), 0) INTO cole FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO colp FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NOT NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpl FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'loja' AND valor_executado IS NULL;
            SELECT COALESCE(SUM(valor_previsto), 0) INTO cpc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
            SELECT COALESCE(SUM(valor_executado), 0) INTO crc FROM custos_oficina WHERE avaliacao_id = rec.avaliacao_id AND lower(responsavel) = 'cliente';
          ELSE cole := 0; colp := 0; cpl := 0; cpc := 0; crc := 0;
          END IF;
          SELECT COALESCE(SUM(co.valor), 0) INTO cop FROM custos_operacionais co
          JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id
          WHERE cc.atendimento_id = rec.atend_id AND lower(co.responsavel) = 'loja';
          v_faturamento := v_faturamento + vvr;
          v_total_qv := v_total_qv + qv;
          v_margem_prevista := v_margem_prevista + (qv - vf);
          fr := vvr + (cpc - crc) + (colp - cole);
          v_faturamento_real := v_faturamento_real + fr;
          v_margem_realizada := v_margem_realizada + (fr - (vf + 445 + cole + cpl + cop));
        END;
      END LOOP;

      result := result || jsonb_build_object(
        'label', v_label,
        'atendimentos', v_atend,
        'vendas', v_vendas,
        'conversao', CASE WHEN v_atend > 0 THEN round(v_vendas::numeric / v_atend, 4) ELSE 0 END,
        'faturamento', round(v_faturamento, 2),
        'pctMargemPrevista', CASE WHEN v_total_qv > 0 THEN round(v_margem_prevista / v_total_qv, 4) ELSE 0 END,
        'pctMargemRealizada', CASE WHEN v_faturamento_real > 0 THEN round(v_margem_realizada / v_faturamento_real, 4) ELSE 0 END
      );
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_showroom_sinais(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text, _tipo text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE result jsonb := '[]'::jsonb; rec record;
BEGIN
  FOR rec IN
    SELECT a.nome_cliente, le.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa,'-') as placa, a.created_at as data_sinal,
      av.quanto_vende, av.valor_fechamento, av.avaliacao_compra, av.avaliacao_consignacao,
      c.valor_fechamento as contrato_valor_fechamento, cc.valor_fechamento as consignante_valor_fechamento,
      a.valor_venda as atend_valor_venda, e.valor_venda as estoque_valor_venda, e.preco as estoque_preco, e.preco_acao as estoque_preco_acao,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM (
      SELECT am.*, cf.nome_razao_social as nome_cliente
      FROM atendimentos_motos am
      LEFT JOIN clientes_fornecedores cf ON cf.id = am.cliente_id
    ) a
    JOIN loja_empresas le ON le.id = a.loja_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo, mi2.estoque_moto_id FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id ORDER BY (mi2.estoque_moto_id IS NOT NULL) DESC, mi2.created_at ASC LIMIT 1) mi ON true
    LEFT JOIN LATERAL (SELECT e2.* FROM estoque e2 WHERE e2.atendimento_venda_id = a.id
      ORDER BY e2.updated_at DESC NULLS LAST, e2.created_at DESC NULLS LAST LIMIT 1) e ON true
    LEFT JOIN LATERAL (SELECT av2.* FROM avaliacoes av2 WHERE av2.id = e.avaliacao_id
      ORDER BY av2.updated_at DESC NULLS LAST, av2.created_at DESC NULLS LAST LIMIT 1) av ON true
    LEFT JOIN contratos c ON c.atendimento_id = a.id
    LEFT JOIN contratos_consignante cc ON cc.atendimento_id = a.id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    WHERE a.situacao = 'sinal'
      AND (_loja = 'todos' OR norm_loja(le.loja) = _loja OR le.loja = _loja)
      AND (_tipo = 'todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
    ORDER BY a.created_at DESC
  LOOP
    DECLARE v_tipo text := COALESCE(rec.tipo,'propria');
      v_quanto_vende numeric := COALESCE(NULLIF(rec.quanto_vende,0), NULLIF(rec.estoque_preco_acao,0), NULLIF(rec.estoque_preco,0), NULLIF(rec.atend_valor_venda,0), NULLIF(rec.estoque_valor_venda,0), 0);
      v_valor_fechamento numeric := COALESCE(NULLIF(rec.valor_fechamento,0), NULLIF(rec.consignante_valor_fechamento,0), NULLIF(rec.contrato_valor_fechamento,0), CASE WHEN v_tipo='consignada' THEN NULLIF(rec.avaliacao_consignacao,0) ELSE NULLIF(rec.avaliacao_compra,0) END, 0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco_acao, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0; v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0; v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric; v_abatimentos numeric; v_margem_realizada numeric; v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc2 ON cc2.id = co.contrato_consignante_id WHERE cc2.atendimento_id = rec.atendimento_id AND lower(co.responsavel)='loja';
      v_taxa_fixa := CASE WHEN v_tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object('nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome,'-'), 'loja', rec.loja, 'tipo', v_tipo, 'modelo', rec.modelo, 'placa', COALESCE(rec.placa,'-'), 'dataSinal', rec.data_sinal, 'quantoVende', round(v_quanto_vende,2), 'valorFechamento', round(v_valor_fechamento,2), 'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_quanto_vende>0 THEN round(v_margem_prevista/v_quanto_vende,4) ELSE 0 END, 'valorVenda', round(v_valor_venda_real,2), 'margemOficina', round(v_margem_oficina,2), 'abatimentos', round(v_abatimentos,2), 'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_fat_real>0 THEN round(v_margem_realizada/v_fat_real,4) ELSE 0 END);
    END;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_showroom_vendedores(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text, _tipo text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint; v_faturamento numeric := 0;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id = v.user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
      SELECT COALESCE(SUM(COALESCE(e.preco, a.valor_venda, 0)),0) INTO v_faturamento FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.data_venda IS NOT NULL AND (_tipo='todos' OR COALESCE(e.tipo,'propria')=_tipo) AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END, 'faturamento', round(v_faturamento,2));
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_showroom_vendidas(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text, _tipo text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE result jsonb := '[]'::jsonb; rec record;
BEGIN
  FOR rec IN
    SELECT a.nome_cliente, le.loja, ur.nome as vendedor_nome,
      COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) as tipo,
      COALESCE(e.marca || ' ' || e.modelo, mi.marca || ' ' || mi.modelo, '-') as modelo,
      COALESCE(e.placa,'-') as placa, a.data_venda as data_venda,
      av.quanto_vende, av.valor_fechamento, a.valor_venda as atend_valor_venda, e.valor_venda as estoque_valor_venda, e.preco as estoque_preco,
      av.id as avaliacao_id, a.id as atendimento_id
    FROM (
      SELECT am.*, cf.nome_razao_social as nome_cliente
      FROM atendimentos_motos am
      LEFT JOIN clientes_fornecedores cf ON cf.id = am.cliente_id
    ) a
    JOIN loja_empresas le ON le.id = a.loja_id
    LEFT JOIN estoque e ON e.atendimento_venda_id = a.id
    LEFT JOIN avaliacoes av ON av.id = e.avaliacao_id
    LEFT JOIN user_roles ur ON ur.user_id = a.vendedor_id
    LEFT JOIN LATERAL (SELECT mi2.marca, mi2.modelo FROM motos_interesse mi2 WHERE mi2.atendimento_id = a.id LIMIT 1) mi ON true
    WHERE a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja)
      AND a.data_venda IS NOT NULL
      AND (_tipo='todos' OR COALESCE(e.tipo, CASE WHEN norm_loja(le.loja)='Ducati' THEN 'ducati' ELSE 'propria' END) = _tipo)
      AND (_date_from IS NULL OR a.data_venda >= _date_from)
      AND (_date_to IS NULL OR a.data_venda <= _date_to)
    ORDER BY a.data_venda DESC
  LOOP
    DECLARE v_quanto_vende numeric := COALESCE(rec.quanto_vende,0); v_valor_fechamento numeric := COALESCE(rec.valor_fechamento,0);
      v_valor_venda_real numeric := COALESCE(rec.atend_valor_venda, rec.estoque_valor_venda, rec.estoque_preco, 0);
      v_custo_oficina_loja_exec numeric := 0; v_custo_oficina_loja_prev numeric := 0; v_custo_processo_loja numeric := 0;
      v_custo_prev_cliente numeric := 0; v_custo_real_cliente numeric := 0; v_custo_op_loja numeric := 0;
      v_fat_real numeric; v_margem_prevista numeric; v_margem_oficina numeric; v_abatimentos numeric; v_margem_realizada numeric; v_taxa_fixa numeric;
    BEGIN
      IF rec.avaliacao_id IS NOT NULL THEN
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_oficina_loja_exec FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_oficina_loja_prev FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NOT NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_processo_loja FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='loja' AND valor_executado IS NULL;
        SELECT COALESCE(SUM(valor_previsto),0) INTO v_custo_prev_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
        SELECT COALESCE(SUM(valor_executado),0) INTO v_custo_real_cliente FROM custos_oficina WHERE avaliacao_id=rec.avaliacao_id AND lower(responsavel)='cliente';
      END IF;
      SELECT COALESCE(SUM(co.valor),0) INTO v_custo_op_loja FROM custos_operacionais co JOIN contratos_consignante cc ON cc.id = co.contrato_consignante_id WHERE cc.atendimento_id = rec.atendimento_id AND lower(co.responsavel)='loja';
      v_taxa_fixa := CASE WHEN rec.tipo IN ('propria','convertida') THEN 445 ELSE 0 END;
      v_fat_real := v_valor_venda_real + (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_margem_prevista := v_quanto_vende - v_valor_fechamento;
      v_margem_oficina := (v_custo_prev_cliente - v_custo_real_cliente) + (v_custo_oficina_loja_prev - v_custo_oficina_loja_exec);
      v_abatimentos := v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja;
      v_margem_realizada := v_fat_real - (v_valor_fechamento + v_taxa_fixa + v_custo_oficina_loja_exec + v_custo_processo_loja + v_custo_op_loja);
      result := result || jsonb_build_object('nomeCliente', rec.nome_cliente, 'vendedor', COALESCE(rec.vendedor_nome,'-'), 'loja', rec.loja, 'tipo', rec.tipo, 'modelo', rec.modelo, 'placa', rec.placa, 'dataVenda', rec.data_venda, 'quantoVende', round(v_quanto_vende,2), 'valorFechamento', round(v_valor_fechamento,2), 'margemPrevista', round(v_margem_prevista,2), 'pctMargemPrevista', CASE WHEN v_quanto_vende>0 THEN round(v_margem_prevista/v_quanto_vende,4) ELSE 0 END, 'valorVenda', round(v_valor_venda_real,2), 'margemOficina', round(v_margem_oficina,2), 'abatimentos', round(v_abatimentos,2), 'margemRealizada', round(v_margem_realizada,2), 'pctMargemRealizada', CASE WHEN v_fat_real>0 THEN round(v_margem_realizada/v_fat_real,4) ELSE 0 END);
    END;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_vendedor_equipe(_date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE result jsonb := '[]'::jsonb; v record;
BEGIN
  FOR v IN SELECT ur.user_id, ur.nome FROM user_roles ur LOOP
    DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id = a.id WHERE a.vendedor_id=v.user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.data_venda IS NOT NULL AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
      SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=v.user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
      IF v_atend>0 OR v_vendas>0 OR v_sinais>0 THEN
        result := result || jsonb_build_object('nome', v.nome, 'atendimentos', v_atend, 'vendas', v_vendas, 'sinais', v_sinais, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
      END IF;
    END;
  END LOOP;
  RETURN result;
END;
$function$;

create or replace function public.relatorio_vendedor_kpis(_user_id uuid, _date_from timestamp with time zone default null::timestamp with time zone, _date_to timestamp with time zone default null::timestamp with time zone, _loja text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE v_atend bigint; v_vendas bigint; v_sinais bigint;
BEGIN
  SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND (_date_from IS NULL OR a.created_at >= _date_from) AND (_date_to IS NULL OR a.created_at <= _date_to);
  SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.data_venda IS NOT NULL AND (_date_from IS NULL OR a.data_venda >= _date_from) AND (_date_to IS NULL OR a.data_venda <= _date_to);
  SELECT count(*) INTO v_sinais FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND a.situacao='sinal' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja);
  RETURN jsonb_build_object('qtdAtendimentos', v_atend, 'qtdVendas', v_vendas, 'qtdSinais', v_sinais, 'taxaConversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
END;
$function$;

create or replace function public.relatorio_vendedor_mensal(_user_id uuid, _loja text default 'todos'::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  result jsonb := '[]'::jsonb;
  v_start date := '2025-12-21'; v_now date := current_date;
  v_cs_d date; v_ce_d date; v_next date;
  v_cs timestamptz; v_ce timestamptz; v_label text;
BEGIN
  WHILE v_start <= v_now LOOP
    SELECT cycle_start, cycle_end, next_start INTO v_cs_d, v_ce_d, v_next FROM public.next_report_cycle(v_start);
    v_cs := v_cs_d::timestamptz;
    v_ce := v_ce_d::timestamptz + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
    v_label := to_char(v_cs_d, 'DD/MM') || ' - ' || to_char(v_ce_d, 'DD/MM');
    DECLARE v_atend bigint; v_vendas bigint;
    BEGIN
      SELECT count(*) INTO v_atend FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id WHERE a.vendedor_id=_user_id AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.created_at >= v_cs AND a.created_at <= v_ce;
      SELECT count(*) INTO v_vendas FROM atendimentos_motos a JOIN loja_empresas le ON le.id = a.loja_id LEFT JOIN estoque e ON e.atendimento_venda_id=a.id WHERE a.vendedor_id=_user_id AND a.situacao='vendido' AND (_loja='todos' OR norm_loja(le.loja)=_loja OR le.loja=_loja) AND a.data_venda IS NOT NULL AND a.data_venda >= v_cs AND a.data_venda <= v_ce;
      result := result || jsonb_build_object('label', v_label, 'atendimentos', v_atend, 'vendas', v_vendas, 'conversao', CASE WHEN v_atend>0 THEN round(v_vendas::numeric/v_atend,4) ELSE 0 END);
    END;
    v_start := v_next;
  END LOOP;
  RETURN result;
END;
$function$;
