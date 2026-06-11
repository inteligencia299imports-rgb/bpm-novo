
-- 1) consignacao_processos: add DELETE policy
CREATE POLICY "Delete consignacao_processos"
ON public.consignacao_processos
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.avaliacoes av
    JOIN public.atendimentos a ON a.id = av.atendimento_id
    WHERE av.id = consignacao_processos.avaliacao_id
      AND (
        a.vendedor_id = auth.uid()
        OR public.has_role(auth.uid(), 'gestor'::app_role)
        OR public.has_role(auth.uid(), 'avaliador'::app_role)
        OR public.has_role(auth.uid(), 'secretaria'::app_role)
      )
  )
);

-- 2) respostas_nps: replace permissive SELECT with scoped one
DROP POLICY IF EXISTS "Authenticated users can view respostas_nps" ON public.respostas_nps;

CREATE POLICY "Scoped select respostas_nps"
ON public.respostas_nps
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'secretaria'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.atendimentos a
    WHERE a.id = respostas_nps.atendimento_id
      AND a.vendedor_id = auth.uid()
  )
);

-- 3) storage.objects: scope moto-fotos write policies to ownership
DROP POLICY IF EXISTS "Upload moto photos" ON storage.objects;
DROP POLICY IF EXISTS "Update moto photos" ON storage.objects;
DROP POLICY IF EXISTS "Delete moto photos" ON storage.objects;

-- Helper predicate inlined: path "{moto_avaliacao_id}/..." OR "docs/{atendimento_id}/..."
CREATE POLICY "Upload moto photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'moto-fotos'
  AND (
    -- docs/{atendimento_id}/...
    (
      (storage.foldername(name))[1] = 'docs'
      AND EXISTS (
        SELECT 1 FROM public.atendimentos a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND (
            a.vendedor_id = auth.uid()
            OR public.has_role(auth.uid(), 'gestor'::app_role)
            OR public.has_role(auth.uid(), 'avaliador'::app_role)
            OR public.has_role(auth.uid(), 'secretaria'::app_role)
          )
      )
    )
    OR
    -- {moto_avaliacao_id}/...
    EXISTS (
      SELECT 1 FROM public.motos_avaliacao ma
      JOIN public.atendimentos a ON a.id = ma.atendimento_id
      WHERE ma.id::text = (storage.foldername(name))[1]
        AND (
          a.vendedor_id = auth.uid()
          OR public.has_role(auth.uid(), 'gestor'::app_role)
          OR public.has_role(auth.uid(), 'avaliador'::app_role)
          OR public.has_role(auth.uid(), 'secretaria'::app_role)
        )
    )
  )
);

CREATE POLICY "Update moto photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'moto-fotos'
  AND (
    (
      (storage.foldername(name))[1] = 'docs'
      AND EXISTS (
        SELECT 1 FROM public.atendimentos a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND (
            a.vendedor_id = auth.uid()
            OR public.has_role(auth.uid(), 'gestor'::app_role)
            OR public.has_role(auth.uid(), 'avaliador'::app_role)
            OR public.has_role(auth.uid(), 'secretaria'::app_role)
          )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.motos_avaliacao ma
      JOIN public.atendimentos a ON a.id = ma.atendimento_id
      WHERE ma.id::text = (storage.foldername(name))[1]
        AND (
          a.vendedor_id = auth.uid()
          OR public.has_role(auth.uid(), 'gestor'::app_role)
          OR public.has_role(auth.uid(), 'avaliador'::app_role)
          OR public.has_role(auth.uid(), 'secretaria'::app_role)
        )
    )
  )
);

CREATE POLICY "Delete moto photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'moto-fotos'
  AND (
    (
      (storage.foldername(name))[1] = 'docs'
      AND EXISTS (
        SELECT 1 FROM public.atendimentos a
        WHERE a.id::text = (storage.foldername(name))[2]
          AND (
            a.vendedor_id = auth.uid()
            OR public.has_role(auth.uid(), 'gestor'::app_role)
            OR public.has_role(auth.uid(), 'avaliador'::app_role)
            OR public.has_role(auth.uid(), 'secretaria'::app_role)
          )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.motos_avaliacao ma
      JOIN public.atendimentos a ON a.id = ma.atendimento_id
      WHERE ma.id::text = (storage.foldername(name))[1]
        AND (
          a.vendedor_id = auth.uid()
          OR public.has_role(auth.uid(), 'gestor'::app_role)
          OR public.has_role(auth.uid(), 'avaliador'::app_role)
          OR public.has_role(auth.uid(), 'secretaria'::app_role)
        )
    )
  )
);
