-- Agente de dados: perfil vendedor também no CRM (equipamentos) — esconde custo e dados de compra
-- do estoque de equipamentos e da garantia. Daniel passa a ver BPM + CRM como vendedor.

insert into agente.restricao_perfil (perfil, tabela, coluna)
select 'vendedor', 'estoque_equipamentos', c from unnest(array['custo_unitario', 'custo_total_real', 'valor_desconto',
  'icms_valor', 'icms_st_valor', 'ipi_valor', 'pis_valor', 'cofins_valor', 'frete_rateado', 'nfe_id', 'nfe_item_id',
  'pedido_compra_id', 'pedido_compra_item_id', 'produto_fornecedor_id', 'consignacao_pendente_compra',
  'consignacao_compra_nfe_item_id']) c
union all
select 'vendedor', 'garantia', c from unnest(array['nf_compra', 'data_compra', 'fornecedor', 'fornecedor_id', 'nfe_entrada_id']) c
union all
select 'vendedor', 'transferencias_estoque_equipamentos', 'nfe_entrada_id'
on conflict do nothing;

update public.agente_dados_usuarios set sistemas = array['bpm', 'crm'] where chave_telefone = '6196462857';
select agente.configurar_usuario('6196462857');
