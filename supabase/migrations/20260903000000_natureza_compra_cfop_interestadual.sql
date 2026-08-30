-- CFOP interna x interestadual vem da tabela de regras da natureza, nao mais
-- de logica no codigo. Para cada natureza "Compra de moto seminova":
--   - a regra ICMS existente vira a regra INTERNA (destino_ufs = {UF da empresa}, CFOP 1xxx)
--   - adiciona a regra INTERESTADUAL (destino_ufs = {} curinga, CFOP 2xxx)

-- 1) Marca a regra atual como interna (destino_ufs = UF da empresa) e ordem 0.
update public.naturezas_operacao_regras r
set destino_ufs = array[e.uf], ordem = 0
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where r.natureza_operacao_id = n.id
  and r.imposto = 'icms'
  and n.descricao = 'Compra de moto seminova'
  and e.uf is not null
  and (r.destino_ufs = '{}'::text[] or r.destino_ufs is null);

-- 2) Cria a regra interestadual (curinga) copiando CST/aliquota, CFOP com 1o digito 2.
insert into public.naturezas_operacao_regras
  (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo, destino_ufs)
select
  r.natureza_operacao_id,
  'icms',
  '2' || substr(coalesce(r.cfop, '1102'), 2),
  r.situacao_tributaria,
  r.aliquota,
  1,
  'todos',
  '{}'::text[]
from public.naturezas_operacao_regras r
join public.naturezas_operacao n on n.id = r.natureza_operacao_id
where r.imposto = 'icms'
  and n.descricao = 'Compra de moto seminova'
  and r.ordem = 0
  and not exists (
    select 1 from public.naturezas_operacao_regras r2
    where r2.natureza_operacao_id = r.natureza_operacao_id
      and r2.imposto = 'icms'
      and r2.ordem = 1
  );
