-- Sync existing client data from contratos_consignacao to atendimentos
UPDATE atendimentos a
SET 
  cpf_cnpj = cc.cpf_cnpj,
  email = cc.email,
  cep = cc.cep,
  endereco = cc.endereco
FROM avaliacoes av
JOIN contratos_consignacao cc ON cc.avaliacao_id = av.id
WHERE av.atendimento_id = a.id
  AND (a.cpf_cnpj IS NULL OR a.cpf_cnpj = '')
  AND cc.cpf_cnpj IS NOT NULL;