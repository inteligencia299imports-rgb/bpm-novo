-- Agente de dados: id da mensagem do WhatsApp no log, único (reenvio do webhook não processa duas vezes).
alter table public.agente_dados_log add column if not exists msg_id text;
create unique index if not exists agente_dados_log_msg_id on public.agente_dados_log (msg_id) where msg_id is not null;
