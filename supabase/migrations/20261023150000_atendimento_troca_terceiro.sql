-- Exceção (pedido do usuário, 2026-10-23): moto de TERCEIRO entrando como parte
-- do pagamento de uma venda. Ex.: TPS9J76 foi comprada da Alessandra (atendimento
-- de venda dela), mas entra no pagamento da 0km 95V5D00AATM000107 vendida à
-- Marthina. A NF-e de venda referencia essa moto no infCpl ("NF DE ENTRADA nº -
-- PLACA ...") igual a uma troca, sem somar o valor no pag (o contrato da venda
-- já traz a forma "Moto Parte Pagamento").
alter table public.atendimentos_motos
  add column if not exists troca_terceiro_avaliacao_id uuid references public.avaliacoes(id) on delete set null;

comment on column public.atendimentos_motos.troca_terceiro_avaliacao_id is
  'Avaliação (de outro atendimento/cliente) cuja moto entra como parte do pagamento desta venda — só referência na NF-e de venda.';

update public.atendimentos_motos
   set troca_terceiro_avaliacao_id = 'b4c25844-b87f-4d4d-a259-7b8d6004b477'
 where id = '2ce6665c-0fd8-4bca-8bfb-4c9f60904994';
