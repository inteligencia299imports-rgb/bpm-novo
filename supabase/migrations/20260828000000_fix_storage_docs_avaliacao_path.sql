-- CRLV/ATPV/Procuracao sao enviados pelo frontend em docs/{avaliacao_id}/tipo.ext
-- (mesmo prefixo "docs/" usado pela CNH, so troca cliente_id por avaliacao_id no
-- segundo segmento). As policies de storage.objects para o branch de avaliacao
-- exigiam (storage.foldername(name))[1] = avaliacao_id (sem o prefixo "docs/"),
-- entao NENHUM upload de CRLV/ATPV/Procuracao nunca autorizava -- toda tentativa
-- falhava com "Erro ao enviar CRLV/ATPV/Procuracao".

drop policy if exists "Upload moto photos" on storage.objects;
create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moto-fotos'
    and (storage.foldername(name))[1] = 'docs'
    and (
      exists (
        select 1 from public.atendimentos_motos a
        where a.cliente_id::text = (storage.foldername(objects.name))[2]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[2]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
      )
    )
  );

drop policy if exists "Update moto photos" on storage.objects;
create policy "Update moto photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (storage.foldername(name))[1] = 'docs'
    and (
      exists (
        select 1 from public.atendimentos_motos a
        where a.cliente_id::text = (storage.foldername(objects.name))[2]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[2]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
      )
    )
  );

drop policy if exists "Delete moto photos" on storage.objects;
create policy "Delete moto photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'moto-fotos'
    and (storage.foldername(name))[1] = 'docs'
    and (
      exists (
        select 1 from public.atendimentos_motos a
        where a.cliente_id::text = (storage.foldername(objects.name))[2]
          and public.has_master_or_gerente_empresa(auth.uid(), a.loja_id)
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[2]
          and public.has_master_or_gerente_empresa(auth.uid(), a.loja_id)
      )
    )
  );
