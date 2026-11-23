-- Novo perfil de acesso do BPM: Avaliador (pedido do usuário, 2026-11-22).
-- Fica em migration própria: valor novo de enum só pode ser usado depois do
-- commit desta transação (a migration seguinte já usa 'avaliador').
alter type public.app_role add value if not exists 'avaliador';
