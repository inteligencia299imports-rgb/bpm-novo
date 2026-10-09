-- respostas_nps: a RLS só liberava quando atendimento_id era um atendimento de
-- venda (atendimentos_motos). Resposta de NPS de AQUISIÇÃO grava o id da
-- AVALIAÇÃO (formulário ?id=<avaliacao_id>, vw_nps.id_atendimento), então ficava
-- invisível no BPM (achado: Maurilio Ferreira Matos Filho, avaliação 62e90a33,
-- 2026-10-09). Agora a resposta resolve o atendimento pelos dois caminhos; o
-- critério de acesso é o mesmo (vendedor do atendimento ou master/gerente da loja).

create or replace function public.pode_acessar_resposta_nps(_id uuid, _so_gestor boolean default false)
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
             (select am.id from public.atendimentos_motos am where am.id = _id),
             (select av.atendimento_id from public.avaliacoes av where av.id = _id)
           )
       and ((not _so_gestor and a.vendedor_id = auth.uid())
            or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
  );
$$;

drop policy if exists "Acesso respostas_nps" on public.respostas_nps;
drop policy if exists "Update respostas_nps" on public.respostas_nps;
drop policy if exists "Delete respostas_nps" on public.respostas_nps;

create policy "Acesso respostas_nps" on public.respostas_nps
  for select to authenticated using (public.pode_acessar_resposta_nps(atendimento_id));
create policy "Update respostas_nps" on public.respostas_nps
  for update to authenticated using (public.pode_acessar_resposta_nps(atendimento_id, true));
create policy "Delete respostas_nps" on public.respostas_nps
  for delete to authenticated using (public.pode_acessar_resposta_nps(atendimento_id, true));
