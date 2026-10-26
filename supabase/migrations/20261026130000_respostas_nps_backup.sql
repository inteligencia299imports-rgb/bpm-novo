-- Respostas da pesquisa de NPS do sistema antigo (planilha RESPOSTAS_BACKUP) para o relatório do SisFin.
-- Mesmas perguntas da respostas_nps; id_atendimento é texto (ids não-uuid do sistema antigo) e casa com
-- vw_nps_backup.id_atendimento / vw_nps.id_atendimento. classe_nps vem pronta da planilha (só referência:
-- o relatório recalcula pela nota).
-- O relatório une respostas_nps + respostas_nps_backup; atendimento que já tem resposta na respostas_nps
-- ignora a do backup. Os dados foram carregados à parte em 26/10/2026.
create table if not exists public.respostas_nps_backup (
  id uuid primary key default gen_random_uuid(),
  id_atendimento text not null,
  data_resposta timestamptz,
  atendimento text,
  outros_setores text,
  produto text,
  experiencia text,
  nps text,
  melhorias text,
  espaco_livre text,
  classe_nps text,
  created_at timestamptz not null default now()
);

create index if not exists respostas_nps_backup_id_atendimento_idx on public.respostas_nps_backup (id_atendimento);

alter table public.respostas_nps_backup enable row level security;
-- Sem policies: só o service role (rota /api/relatorios/nps do SisFin) lê.
