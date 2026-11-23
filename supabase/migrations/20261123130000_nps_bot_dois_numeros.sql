-- Robô de NPS: envio por dois números de WhatsApp, para não sobrecarregar um só.
-- Cada número tem seu limite (60/dia), dividido em lotes (manhã e tarde), e seu próprio
-- intervalo aleatório entre envios. Se um número cair, só ele é pausado; o outro segue.
create table if not exists public.nps_bot_instancias (
  id text primary key,                 -- 'comunicacao', 'cerebro' (define o secret do token)
  nome text not null,
  telefone text,
  ativo boolean not null default true,
  limite_diario integer not null default 60,
  proximo_envio_at timestamptz,
  pausado_motivo text,
  pausado_at timestamptz,
  falhas_conexao integer not null default 0,
  ordem integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.nps_bot_instancias enable row level security;

insert into public.nps_bot_instancias (id, nome, telefone, ordem) values
  ('comunicacao', 'Comunicação', '556193758680', 1),
  ('cerebro', 'Cérebro', '556191070913', 2)
on conflict (id) do nothing;

alter table public.nps_bot_conversas add column if not exists instancia text not null default 'comunicacao';

-- Lotes do dia (horário de Brasília). O limite diário do número é dividido igualmente entre eles.
alter table public.nps_bot_config add column if not exists lotes jsonb not null
  default '[{"nome":"manhã","inicio":"09:00","fim":"12:30"},{"nome":"tarde","inicio":"13:30","fim":"18:00"}]'::jsonb;

-- 3 a 7 minutos entre envios do mesmo número.
update public.nps_bot_config set intervalo_min_seg = 180, intervalo_max_seg = 420;
