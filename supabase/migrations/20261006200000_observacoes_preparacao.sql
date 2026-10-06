-- Observações da preparação: registros livres sobre a moto na tela de
-- Preparação (botão "Observação"). Não movem status nem entram no histórico
-- de movimentações — mesmo padrão de public.observacoes (atendimento).
create table if not exists public.observacoes_preparacao (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  observacao text not null check (length(trim(observacao)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists observacoes_preparacao_avaliacao_id_idx
  on public.observacoes_preparacao (avaliacao_id, created_at desc);

alter table public.observacoes_preparacao enable row level security;

drop policy if exists "obs_prep_select" on public.observacoes_preparacao;
drop policy if exists "obs_prep_insert" on public.observacoes_preparacao;
drop policy if exists "obs_prep_delete" on public.observacoes_preparacao;

create policy "obs_prep_select" on public.observacoes_preparacao
  for select to authenticated using (true);
create policy "obs_prep_insert" on public.observacoes_preparacao
  for insert to authenticated with check (created_by = auth.uid());
-- Remover: o próprio autor (a tela também libera para master).
create policy "obs_prep_delete" on public.observacoes_preparacao
  for delete to authenticated using (
    created_by = auth.uid()
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.app_role = 'master' and ur.ativo)
  );
