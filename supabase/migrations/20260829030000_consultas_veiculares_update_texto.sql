-- Permite editar o TEXTO do resultado da consulta (SERPRO ou manual) direto na
-- tela. A consulta continua imutável nos dados estruturados -- o app só
-- reescreve `resultado` para incluir/atualizar `resultado.texto`.
-- Mesmo critério de acesso do resto.

drop policy if exists "Update consultas_veiculares" on public.consultas_veiculares;
create policy "Update consultas_veiculares" on public.consultas_veiculares
  for update to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = consultas_veiculares.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );
