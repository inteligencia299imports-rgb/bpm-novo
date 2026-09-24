-- Guarda a loja de destino escolhida no popup de transferencia, na propria
-- linha da NF-e -- necessario pra reatribuir estoque_motos.loja_id quando a
-- autorizacao em producao chega via "consultar" (polling), nao so via
-- "emitir" (a Focus processa de forma assincrona; sem isso, o efeito de
-- negocio da entrada so disparava se a resposta sincrona do emitir ja
-- viesse autorizada).
alter table nfe_entradas
  add column if not exists transferencia_destino_loja_id uuid references loja_empresas(id) on delete set null;
