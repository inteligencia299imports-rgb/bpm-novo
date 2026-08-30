-- Permite que a consulta MANUAL (digitada no pop-up "Consulta > Manual") seja
-- gravada em public.consultas_veiculares, para aparecer na mesma listagem das
-- consultas SERPRO. As consultas SERPRO continuam sendo inseridas pela Edge
-- Function (service role, ignora RLS); esta policy é só para o caminho manual,
-- feito pelo cliente autenticado.
--
-- Mesmo critério de acesso do resto: quem tem acesso à avaliação (via
-- atendimento -> loja) pode registrar a consulta manual dela.

drop policy if exists "Insert consulta manual consultas_veiculares" on public.consultas_veiculares;
create policy "Insert consulta manual consultas_veiculares" on public.consultas_veiculares
  for insert to authenticated
  with check (
    exists (
      select 1 from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = consultas_veiculares.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );

-- Continua sem UPDATE/DELETE para authenticated: log de consulta é append-only.
