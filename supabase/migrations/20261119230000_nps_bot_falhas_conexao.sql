-- Robô de NPS: falha de rede ao falar com a uazapi não é "WhatsApp fora do ar".
-- Em 2026-11-19 14:51 um timeout de rede pausou o robô por engano. Agora só pausa se a uazapi
-- disser que o WhatsApp desconectou, ou após 5 ciclos seguidos sem resposta da uazapi.
alter table public.nps_bot_config add column if not exists falhas_conexao integer not null default 0;
