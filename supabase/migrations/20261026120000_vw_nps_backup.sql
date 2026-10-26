-- Vendas do sistema antigo (planilha exportada da vw_nps antiga) para o relatório de NPS do SisFin.
-- Mesmas colunas da vw_nps; id_atendimento é texto porque o sistema antigo usava ids não-uuid.
-- O relatório une vw_nps + vw_nps_backup; quando o id existe nas duas, vale a vw_nps.
-- Os dados (5.141 linhas, vendas de 15/05/2025 a 31/08/2026) foram carregados à parte em 26/10/2026.
create table if not exists public.vw_nps_backup (
  id_atendimento text primary key,
  status text,
  loja text,
  nome_cliente text,
  telefone text,
  sexo text,
  uf text,
  interesse text,
  nps_status text,
  vendedor text,
  tipo_moto text,
  marca text,
  modelo text,
  placa text,
  data_venda timestamptz,
  departamento text,
  data_envio timestamptz,
  created_at timestamptz not null default now()
);

alter table public.vw_nps_backup enable row level security;
-- Sem policies: só o service role (rota /api/relatorios/nps do SisFin) lê.
