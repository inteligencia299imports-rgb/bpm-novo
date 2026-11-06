-- Valor do Sinal e Valor da Venda também no contrato (06/11/2026).
-- Até aqui eles só existiam na linha da moto no estoque (estoque_motos / estoque_motos_novas). Com a
-- Moto de Interesse "externa" (não escolhida do estoque — ex.: 0km que ainda vai chegar da fábrica) não
-- havia linha para gravar e os valores sumiam ao salvar/gerar o contrato de sinal. O ContratoDialog passa a
-- gravar aqui sempre e a ler daqui quando não há moto do estoque vinculada.
-- APLICAR ANTES do deploy do front (o front novo grava essas colunas).
alter table public.contratos add column if not exists valor_sinal numeric;
alter table public.contratos add column if not exists valor_venda numeric;
