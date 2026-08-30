-- A NF-e exige CST de PIS e COFINS por item. Como a Edge Function nao usa mais
-- default no codigo, essas regras precisam existir na natureza. CST 70 =
-- "Operacao de Aquisicao sem Direito a Credito" (entrada de compra).

insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select n.id, imp.imposto, '70', 0, 0, 'todos', '{}'::text[]
from public.naturezas_operacao n
cross join (values ('pis'), ('cofins')) as imp(imposto)
where n.descricao = 'Compra de moto seminova'
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = imp.imposto
  );
