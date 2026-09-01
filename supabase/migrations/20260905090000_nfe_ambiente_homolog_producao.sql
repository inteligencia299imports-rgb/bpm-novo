-- Ate agora o ambiente da Focus NFe (homologacao/producao) era decidido por uma
-- env var GLOBAL do Supabase (FOCUS_NFE_AMBIENTE), a mesma para toda emissao do
-- sistema, e nao ficava registrada em lugar nenhum. Passa a ser escolhida por
-- operacao: o front manda "homologacao" ou "producao" a cada emissao, e a
-- producao so e permitida depois de um sucesso em homologacao para a MESMA
-- operacao (nfe_entradas.homologado_em preenchido). A promocao reaproveita a
-- mesma linha de nfe_entradas (e o mesmo compromisso financeiro, quando existe)
-- em vez de duplicar.

alter table public.nfe_entradas
  add column if not exists ambiente text not null default 'homologacao'
    check (ambiente in ('homologacao', 'producao')),
  add column if not exists homologado_em timestamptz null;

comment on column public.nfe_entradas.ambiente is
  'Ambiente da Focus NFe usado na ultima emissao/atualizacao desta linha.';
comment on column public.nfe_entradas.homologado_em is
  'Quando a emissao em homologacao foi autorizada pela primeira vez para esta operacao; exigido antes de permitir emitir em producao.';

-- Backfill: linhas ja autorizadas foram emitidas sob o antigo default global
-- (homologacao), entao ja "passaram" pelo teste de homologacao.
update public.nfe_entradas
set homologado_em = coalesce(data_emissao, created_at)
where status = 'processada' and homologado_em is null;
