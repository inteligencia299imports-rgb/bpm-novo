-- Rastreia separadamente se o vínculo da chave NF-e no estoque RENAVE (passo
-- 4) de fato deu certo. Achado 2026-09-22: a tela marcava o passo 4 como
-- "feito" só por causa da entrada (passo 2) ter dado certo, sem checar o
-- resultado real da chamada /api/notas-fiscais -- se ela falhasse, ninguém
-- saberia sem ir direto no log de renave_chamadas.
alter table avaliacoes
  add column if not exists renave_nf_vinculada_em timestamptz;
