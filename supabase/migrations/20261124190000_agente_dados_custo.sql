-- Agente de dados: consumo e custo por pergunta (o agente informa só o próprio consumo).
-- Preço Claude Opus 5.5 (US$ por milhão de tokens): entrada 4, saída 20, leitura de cache 0,20,
-- escrita de cache (5 min) 5. Transcrição de áudio (gpt-4o-mini-transcribe): ~US$ 0,003 por minuto.
alter table public.agente_dados_log
  add column if not exists tokens_cache_leitura integer,
  add column if not exists tokens_cache_escrita integer,
  add column if not exists audio_segundos integer,
  add column if not exists custo_usd numeric(12, 6);

update public.agente_dados_log
   set custo_usd = round((coalesce(tokens_entrada, 0) * 4 + coalesce(tokens_saida, 0) * 20)::numeric / 1e6, 6)
 where custo_usd is null and (tokens_entrada is not null or tokens_saida is not null);
