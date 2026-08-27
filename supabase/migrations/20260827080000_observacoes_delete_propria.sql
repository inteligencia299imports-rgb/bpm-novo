-- Usuarios nao-master podem apagar as proprias observacoes, mas nao as de
-- outras pessoas (antes so master podia apagar qualquer uma).
drop policy if exists "Master deletes observacoes" on public.observacoes;

create policy "Delete own or master deletes observacoes" on public.observacoes
  for delete to authenticated
  using (user_id = auth.uid() OR public.has_app_role(auth.uid(), 'master'));
