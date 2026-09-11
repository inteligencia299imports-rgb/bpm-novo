-- Revertendo 20260911150000: o endereço RESIDENCIAL (ATPV) passa a ser uma
-- 2ª linha (tipo='residencial') na própria clientes_fornecedores_enderecos —
-- que já existe pra isso — em vez de uma tabela separada.
drop table if exists public.clientes_fornecedores_enderecos_atpv;
