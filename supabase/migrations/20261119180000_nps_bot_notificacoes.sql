-- Robô de NPS: notificação dos gerentes/responsáveis a cada resposta. Pedido do usuário, 2026-11-19.
--
-- Cada resposta nova em respostas_nps dispara a função nps-bot-notificar (pg_net), que avisa no
-- WhatsApp quem cuida daquela loja/departamento. "Atenção" = nota de 0 a 6, alguma resposta abaixo
-- de "Neutro" ou algum texto em melhorias.
--
-- Por padrão só notifica respostas do robô (origem = 'chatbot'): as do fluxo antigo (n8n) já têm
-- notificação própria. Para notificar todas: update nps_bot_config set notificar_todas_origens = true.

alter table public.nps_bot_config
  add column if not exists notificar_todas_origens boolean not null default false;

-- Quem recebe. lojas/departamentos nulos = todos. Uma pessoa pode ter mais de uma regra;
-- recebe uma mensagem só por resposta.
create table if not exists public.nps_bot_destinatarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,              -- 55 + DDD + número
  lojas text[],                        -- loja_empresas.loja
  departamentos text[],                -- SHOWROOM | AVALIAÇÃO | EQUIPAMENTOS | OFICINA
  so_atencao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.nps_bot_destinatarios enable row level security;
drop policy if exists "nps_bot_destinatarios leitura" on public.nps_bot_destinatarios;
create policy "nps_bot_destinatarios leitura" on public.nps_bot_destinatarios for select to authenticated using (true);

insert into public.nps_bot_destinatarios (nome, telefone, lojas, departamentos, so_atencao)
select * from (values
  -- Todas as respostas
  ('Matheus',  '5561995005308', array['299i','299s','Aventura'],               null::text[],                                  false),
  ('João',     '5561981764340', array['Ducati BSB'],                           array['SHOWROOM','AVALIAÇÃO','OFICINA'],        false),
  ('Filipe',   '5561992587259', array['Ducati BSB'],                           array['OFICINA'],                               false),
  ('Vitor',    '5561998705489', array['Ducati POA'],                           null::text[],                                  false),
  ('Diego',    '5561986230897', array['Ducati FLN'],                           null::text[],                                  false),
  ('Maurílio', '5561981152272', array['Ducati BSB','Ducati POA','Ducati FLN'], null::text[],                                  false),
  -- Só as que precisam de atenção
  ('Taís',     '5561995359881', null::text[],                                  array['EQUIPAMENTOS'],                          true),
  ('Maurílio', '5561981152272', null::text[],                                  null::text[],                                  true)
) v(nome, telefone, lojas, departamentos, so_atencao)
where not exists (select 1 from public.nps_bot_destinatarios);

-- Registro do que foi enviado (evita aviso duplicado da mesma resposta para a mesma pessoa).
create table if not exists public.nps_bot_notificacoes (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null,
  telefone text not null,
  nome text,
  atencao boolean,
  erro text,
  created_at timestamptz not null default now(),
  unique (resposta_id, telefone)
);
alter table public.nps_bot_notificacoes enable row level security;
drop policy if exists "nps_bot_notificacoes leitura" on public.nps_bot_notificacoes;
create policy "nps_bot_notificacoes leitura" on public.nps_bot_notificacoes for select to authenticated using (true);

-- Gatilho: resposta nova (recente) chama a função. Segredo e URL vêm do Vault, criados pelo
-- supabase/nps-bot-setup.sql. Falha no envio nunca impede a gravação da resposta.
create or replace function public.fn_nps_bot_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _secret text;
  _todas boolean;
begin
  if new.data_resposta < now() - interval '2 days' then
    return new; -- importação/carga antiga: não notifica
  end if;
  select notificar_todas_origens into _todas from public.nps_bot_config limit 1;
  if coalesce(new.origem, '') <> 'chatbot' and not coalesce(_todas, false) then
    return new;
  end if;
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'nps_bot_secret';
  if _secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://gnpkkgygjfxlipqbtybg.supabase.co/functions/v1/nps-bot-notificar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nps-bot-secret', _secret),
    body := jsonb_build_object('resposta_id', new.id),
    timeout_milliseconds := 60000
  );
  return new;
exception when others then
  raise warning 'nps-bot-notificar: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_nps_bot_notificar on public.respostas_nps;
create trigger trg_nps_bot_notificar
  after insert on public.respostas_nps
  for each row execute function public.fn_nps_bot_notificar();
