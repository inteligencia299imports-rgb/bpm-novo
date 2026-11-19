-- Robô de NPS — agendamento do disparo (rodar UMA vez no SQL Editor do Supabase,
-- depois da migration 20261119150000_nps_chatbot.sql e do deploy das funções).
-- Fica fora de migrations/ porque leva o segredo: troque <NPS_BOT_SECRET> pelo mesmo
-- valor cadastrado em Edge Functions > Secrets.

create extension if not exists pg_net;

-- Segredo guardado no Vault (não aparece no texto do cron).
select vault.create_secret('<NPS_BOT_SECRET>', 'nps_bot_secret', 'Robô de NPS: x-nps-bot-secret');

-- Disparo a cada minuto. A função decide se envia (horário comercial, intervalo
-- aleatório, limite diário, ativo/modo_teste); fora disso só encerra conversas paradas.
select cron.unschedule(jobid) from cron.job where jobname = 'nps-bot-disparo';
select cron.schedule('nps-bot-disparo', '* * * * *', $$
  select net.http_post(
    url := 'https://gnpkkgygjfxlipqbtybg.supabase.co/functions/v1/nps-bot-disparo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-nps-bot-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nps_bot_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- ------------------------------------------------------------------
-- Operação do dia a dia
-- ------------------------------------------------------------------
-- Ligar só em teste (envio manual com {"acao":"teste"}):
--   update nps_bot_config set ativo = true, modo_teste = true, telefone_teste = '5561999999999';
-- Ligar para valer:
--   update nps_bot_config set ativo = true, modo_teste = false;
-- Desligar tudo na hora:
--   update nps_bot_config set ativo = false;
-- Acompanhar:
--   select status, count(*) from nps_bot_conversas where not teste group by 1;
--   select * from vw_nps_bot_fila order by enviar_a_partir limit 50;
