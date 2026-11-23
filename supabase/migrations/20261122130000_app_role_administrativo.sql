-- Novo perfil de acesso do BPM: Administrativo (pedido do usuário, 2026-11-22).
-- Migration própria: o valor novo do enum só pode ser usado depois do commit
-- (a migration seguinte já usa 'administrativo').
alter type public.app_role add value if not exists 'administrativo';
