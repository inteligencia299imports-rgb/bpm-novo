-- Add DELETE policy for moto-fotos bucket
CREATE POLICY "Delete moto photos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'moto-fotos' AND auth.role() = 'authenticated');

-- Add UPDATE policy for moto-fotos bucket (needed for upsert)
CREATE POLICY "Update moto photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'moto-fotos' AND auth.role() = 'authenticated');