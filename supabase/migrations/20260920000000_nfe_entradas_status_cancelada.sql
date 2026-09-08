-- 'cancelada' passou a ser um status válido de nfe_entradas (NF-e autorizada e
-- depois cancelada na SEFAZ — pelo botão do sistema ou direto no painel da Focus).
alter table nfe_entradas drop constraint if exists nfe_entradas_status_check;
alter table nfe_entradas add constraint nfe_entradas_status_check
  check (status = any (array[
    'recebida', 'validando', 'processando_itens', 'gerando_contas',
    'processada', 'processada_com_pendencias', 'erro', 'cancelada'
  ]::text[]));
