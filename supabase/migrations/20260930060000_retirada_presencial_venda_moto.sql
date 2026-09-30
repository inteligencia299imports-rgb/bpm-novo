-- Retirada presencial na venda de moto (mesmo esquema do crm-novo/ofc — docs-fiscal-299
-- difal-ec87.md §6.3/§6.4): o cliente de outra UF vem à loja e leva a moto. A operação vira
-- interna — CFOP 5xxx, alíquota interna, idDest=1, sem DIFAL — e a NF-e leva o grupo
-- <entrega> com o endereço da loja. Marcado no card "NF-e de Venda" do contrato.
alter table public.atendimentos_motos
  add column if not exists retirada_presencial boolean not null default false;

-- Endereço do emitente (grupo <entrega>) para as empresas que vendem moto e ainda não
-- tinham: transcrito do <enderEmit> de NF-e autorizadas emitidas por elas (nfe_entradas).
-- Só preenche o que está vazio.
update public.empresas set
  logradouro = coalesce(empresas.logradouro, v.logradouro), numero = coalesce(empresas.numero, v.numero),
  complemento = coalesce(empresas.complemento, v.complemento), bairro = coalesce(empresas.bairro, v.bairro),
  cidade = coalesce(empresas.cidade, v.cidade), cep = coalesce(empresas.cep, v.cep),
  codigo_municipio_ibge = coalesce(empresas.codigo_municipio_ibge, v.cmun)
from (values
  ('49580035000136', 'TRECHO SIA TRECHO 3', '1205', 'LOJA', 'ZONA INDUSTRIAL (GUARA)', 'BRASILIA', '71200037', '5300108'),
  ('21194795000196', 'ST SCIA QD 15 CONJUNTO 3', '06', 'LOTE', 'ZONA INDUSTRIAL (GUARA)', 'BRASILIA', '71250015', '5300108'),
  ('05564902000255', 'RUA PEREIRA FRANCO', '283', null, 'SAO JOAO', 'PORTO ALEGRE', '90240520', '4314902')
) as v(cnpj, logradouro, numero, complemento, bairro, cidade, cep, cmun)
where regexp_replace(empresas.cnpj, '\D', '', 'g') = v.cnpj;
