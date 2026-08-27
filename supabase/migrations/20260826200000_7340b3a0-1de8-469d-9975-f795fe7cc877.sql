-- Adiciona a loja principal do usuario, usada para pre-selecionar
-- concessionaria/unidade ao abrir o formulario de novo atendimento.
-- Guarda o nome da loja (mesmo formato usado em atendimentos_motos.loja,
-- ex: '299i', 'Ducati BSB') em vez de uma FK, evitando join extra no login.

alter table public.user_roles
  add column if not exists loja_principal text;
