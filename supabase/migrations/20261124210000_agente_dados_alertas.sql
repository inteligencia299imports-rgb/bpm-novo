-- Agente de dados: alertas para quem tem agente_dados_usuarios.alertas = true (Higor), pelo WhatsApp do agente.
--   - banco: tamanho do banco passou do limite de atenção (lembrete semanal enquanto continuar acima);
--   - custo: consumo do agente no mês passou de cada múltiplo de passo_custo_usd (10, 20, 30...).
alter table public.agente_dados_usuarios add column if not exists alertas boolean not null default false;
update public.agente_dados_usuarios set alertas = true where nome = 'Higor';

-- Limites ajustáveis sem publicar código.
create table if not exists public.agente_dados_config (
  id boolean primary key default true check (id),
  limite_banco_mb integer not null default 400,     -- 80% dos 500 MB do plano gratuito do Supabase
  passo_custo_usd numeric(10, 2) not null default 10,
  updated_at timestamptz not null default now()
);
insert into public.agente_dados_config (id) values (true) on conflict (id) do nothing;
alter table public.agente_dados_config enable row level security;

-- Alertas já enviados (a chave evita repetir: 'custo:2026-11:10', 'banco:400:2026-W48').
create table if not exists public.agente_dados_alertas (
  chave text primary key,
  detalhe text,
  enviado_at timestamptz not null default now()
);
alter table public.agente_dados_alertas enable row level security;

-- Tamanho do banco em MB (para a função do agente, via service_role).
create or replace function public.agente_dados_tamanho_banco_mb()
returns numeric
language sql
stable
security definer
set search_path = public
as $$ select round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) $$;
revoke all on function public.agente_dados_tamanho_banco_mb() from public, anon, authenticated;
grant execute on function public.agente_dados_tamanho_banco_mb() to service_role;

-- O papel de consulta do agente não vê essas tabelas.
revoke all on public.agente_dados_config, public.agente_dados_alertas from agente_leitura, agente_rh;

-- Verificação diária às 08:00 (Brasília) — o segredo do webhook fica no Vault (agente_dados_secret).
select cron.unschedule('agente-dados-alertas') where exists (select 1 from cron.job where jobname = 'agente-dados-alertas');
select cron.schedule(
  'agente-dados-alertas',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://gnpkkgygjfxlipqbtybg.supabase.co/functions/v1/agente-dados?acao=alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agente_dados_secret')),
    body := '{}'::jsonb
  );
  $$
);
