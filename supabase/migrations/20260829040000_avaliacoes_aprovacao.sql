-- Etapa de aprovação de aquisição (motos próprias) no Pós-Compra.
-- aprovacao_status: null = não se aplica (consignada / registros antigos)
--                   'aguardando' | 'aprovada' | 'recusada'
alter table public.avaliacoes add column if not exists aprovacao_status text
  check (aprovacao_status in ('aguardando', 'aprovada', 'recusada'));
alter table public.avaliacoes add column if not exists aprovacao_observacao text;
alter table public.avaliacoes add column if not exists aprovado_por uuid;
alter table public.avaliacoes add column if not exists aprovado_em timestamptz;
