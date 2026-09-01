-- A migration 20260828000000_fix_storage_docs_avaliacao_path.sql recriou as
-- policies de storage.objects para o bucket moto-fotos so com o branch
-- docs/{cliente_id ou avaliacao_id}/... (CRLV/ATPV/Procuracao/CNH).
--
-- Isso removeu por engano o branch que ja existia desde 20260826240000 e
-- autorizava o path direto {avaliacao_id}/{tipo}.webp -- usado pelo
-- PhotoUpload.tsx para as fotos da moto (lateral_direita.webp etc). Sem esse
-- branch, todo upload de foto de moto passou a falhar com 400 (RLS).
--
-- Esta migration restaura o branch direto, mantendo o branch docs/ como esta.

drop policy if exists "Upload moto photos" on storage.objects;
create policy "Upload moto photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'moto-fotos'
    and (
      (
        (storage.foldername(name))[1] = 'docs'
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
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
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
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
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
      )
      or exists (
        select 1 from public.avaliacoes av join public.atendimentos_motos a on a.id = av.atendimento_id
        where av.id::text = (storage.foldername(objects.name))[1]
          and public.has_master_or_gerente_empresa(auth.uid(), a.loja_id)
      )
    )
  );
