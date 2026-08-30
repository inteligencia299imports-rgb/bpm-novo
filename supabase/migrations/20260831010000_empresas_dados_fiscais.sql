-- Substitui as empresas-fixture do homolog (CNPJ vazio) pelos dados fiscais
-- reais e reaponta loja_empresas conforme o de-para de producao informado.
-- Reseed das naturezas de operacao "Compra de moto seminova" para as empresas
-- reais referenciadas pelas lojas de motos.

-- =====================================================================
-- 1. Empresas reais (ids de producao)
-- =====================================================================
insert into public.empresas (id, nome, cnpj, regime_tributario, uf, inscricao_estadual, bpm, crm, ativo)
values
  ('1577327e-afab-44e7-aa95-318f11a002a8', 'AVENTURA',      '30.430.239/0001-62', 'SIMPLES NACIONAL', 'DF', '0785809100120', true,  true,  true),
  ('1bbde74c-5bbc-4033-90ce-0d251852b07f', 'PARK',          '59.378.676/0001-66', null,               'DF', null,            false, false, true),
  ('30496c3b-721f-4795-98fd-2785d3821f3b', 'FAG',           '49.580.035/0001-36', 'LUCRO REAL',       'DF', '0819762400139', true,  true,  true),
  ('3530fd65-62f8-4be3-b41d-8b3d4a22b63b', 'PORTO ALEGRE',  '05.564.902/0002-55', 'LUCRO REAL',       'RS', '0963755463',    true,  true,  true),
  ('35b86ec5-7124-4806-9abe-0d76be7473f0', 'IGUATEMI',      '68.002.632/0001-28', null,               'DF', null,            false, false, true),
  ('4849e81b-7835-4b00-a1d1-189b752075a5', 'AGUAS LINDAS',  '59.565.514/0001-37', null,               'DF', null,            false, false, true),
  ('ae6edb42-e3ac-4390-baae-269844701031', 'FLORIANOPOLIS', '05.564.902/0001-74', 'LUCRO REAL',       'SC', '260290890',     true,  true,  true),
  ('ccd5ba7b-ec24-415a-bc7f-6c7ae0a4a4dc', 'M2 FILIAL',     '15.490.693/0002-04', 'SIMPLES NACIONAL', 'DF', '0760680500209', true,  true,  true),
  ('d3a6370f-31fa-465c-8ff2-8a0dd1f310b0', 'MMATOS',        '21.194.795/0001-96', 'LUCRO PRESUMIDO',  'DF', '0769842800141', true,  false, true),
  ('e9b4cbd8-c3be-4d49-89cf-4c29a7a047d1', 'M2 MATRIZ',     '15.490.693/0001-15', 'SIMPLES NACIONAL', 'DF', null,            true,  true,  true)
on conflict (id) do update set
  nome = excluded.nome,
  cnpj = excluded.cnpj,
  regime_tributario = excluded.regime_tributario,
  uf = excluded.uf,
  inscricao_estadual = excluded.inscricao_estadual,
  bpm = excluded.bpm;

-- =====================================================================
-- 2. Reaponta loja_empresas (de-para de producao)
-- =====================================================================
update public.loja_empresas set empresa_id = 'ae6edb42-e3ac-4390-baae-269844701031' where loja = '299f'       and sistema = 'motos';
update public.loja_empresas set empresa_id = '30496c3b-721f-4795-98fd-2785d3821f3b' where loja = '299i'       and sistema = 'motos';
update public.loja_empresas set empresa_id = '3530fd65-62f8-4be3-b41d-8b3d4a22b63b' where loja = '299p'       and sistema = 'motos';
update public.loja_empresas set empresa_id = 'ccd5ba7b-ec24-415a-bc7f-6c7ae0a4a4dc' where loja = '299s'       and sistema = 'motos';
update public.loja_empresas set empresa_id = '1577327e-afab-44e7-aa95-318f11a002a8' where loja = 'Aventura'   and sistema = 'motos';
update public.loja_empresas set empresa_id = '30496c3b-721f-4795-98fd-2785d3821f3b' where loja = 'Ducati BSB' and sistema = 'motos';
update public.loja_empresas set empresa_id = 'ae6edb42-e3ac-4390-baae-269844701031' where loja = 'Ducati FLN' and sistema = 'motos';
update public.loja_empresas set empresa_id = '3530fd65-62f8-4be3-b41d-8b3d4a22b63b' where loja = 'Ducati POA' and sistema = 'motos';

-- =====================================================================
-- 3. Remove as empresas-fixture antigas (agora sem referencias)
-- =====================================================================
delete from public.naturezas_operacao where empresa_id in (
  'edc651c0-02ec-42a4-b8c9-71038d8a944c','0fae913b-885f-4a81-8fbe-28559929375d',
  '0d518971-7a6f-4992-bdc0-e90a6b555ba9','9ed3dc04-a926-45e0-8f8d-133846b665fb',
  'bf7d99f2-56aa-416a-917b-4e3edafac999','ce3c1250-9fa4-41b6-99f5-11ba7d5cd093',
  'd7c38e3f-d931-437c-9e54-8434c4681df1','f9884e71-683b-437c-9d95-a6490cd701a2'
);
delete from public.empresas where id in (
  'edc651c0-02ec-42a4-b8c9-71038d8a944c','0fae913b-885f-4a81-8fbe-28559929375d',
  '0d518971-7a6f-4992-bdc0-e90a6b555ba9','9ed3dc04-a926-45e0-8f8d-133846b665fb',
  'bf7d99f2-56aa-416a-917b-4e3edafac999','ce3c1250-9fa4-41b6-99f5-11ba7d5cd093',
  'd7c38e3f-d931-437c-9e54-8434c4681df1','f9884e71-683b-437c-9d95-a6490cd701a2'
);

-- =====================================================================
-- 4. Reseed natureza "Compra de moto seminova" para as empresas reais de motos
-- =====================================================================
insert into public.naturezas_operacao (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, empresa_id)
select 'Compra de moto seminova', '1', 'entrada', true, false, false, e.id
from public.empresas e
where e.id in (
  select distinct empresa_id from public.loja_empresas where sistema = 'motos'
)
and not exists (
  select 1 from public.naturezas_operacao n
  where n.empresa_id = e.id and n.descricao = 'Compra de moto seminova'
);

-- Regra ICMS: Simples Nacional -> CSOSN 102; demais regimes -> CST 90.
insert into public.naturezas_operacao_regras (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo)
select n.id, 'icms', '1102',
       case when upper(coalesce(e.regime_tributario, '')) like 'SIMPLES%' then '102' else '90' end,
       0, 0, 'todos'
from public.naturezas_operacao n
join public.empresas e on e.id = n.empresa_id
where n.descricao = 'Compra de moto seminova'
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = 'icms'
  );

-- =====================================================================
-- 5. Linhas de config Focus-NFe (tokens preenchidos pelo usuario depois)
-- =====================================================================
insert into public.empresas_focus_config (empresa_id, habilitado)
select distinct empresa_id, true
from public.loja_empresas
where sistema = 'motos'
on conflict (empresa_id) do nothing;
