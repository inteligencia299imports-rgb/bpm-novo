-- vw_envio_nps: ordenada do mais antigo para o mais recente pela data de previsão
-- (desempate: data da negociação e id). Pedido do usuário, 2026-10-09.
create or replace view public.vw_envio_nps with (security_invoker = on) as
SELECT id,
    departamento,
    loja,
    negociacao,
    cliente,
    telefone,
    data_negociacao,
    data_previsao,
    nps_status,
    data_envio
   FROM ( SELECT DISTINCT ON (am.id) am.id,
            'SHOWROOM'::text AS departamento,
            le.loja,
            upper(am.interesse) AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            vh.created_at::date AS data_negociacao,
            pv.data_conclusao::date AS data_previsao,
            am.nps_status,
            am.nps_enviado_at::date AS data_envio
           FROM atendimentos_motos am
             JOIN loja_empresas le ON le.id = am.loja_id
             JOIN clientes_fornecedores cf ON cf.id = am.cliente_id
             JOIN pos_venda_processos pv ON pv.atendimento_id = am.id
             JOIN LATERAL ( SELECT sh.created_at
                   FROM status_history sh
                  WHERE sh.entity_type = 'showroom'::text AND sh.entity_id = am.id AND sh.status = 'vendido'::text
                  ORDER BY sh.created_at DESC
                 LIMIT 1) vh ON true
          WHERE am.interesse <> 'vender'::text AND am.nps_status = 'em_aberto'::text AND pv.etapa = 'ENTREGA DA MOTO'::text AND pv.concluida = true
        UNION ALL
         SELECT DISTINCT ON (av.id) av.id,
            'AVALIAÇÃO'::text AS departamento,
            le.loja,
            upper(av.tipo_aquisicao) AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            s.created_at::date AS data_negociacao,
            (pc.data_conclusao::date + '7 days'::interval)::date AS data_previsao,
            av.nps_status,
            av.nps_enviado_at::date AS data_envio
           FROM avaliacoes av
             JOIN atendimentos_motos a ON a.id = av.atendimento_id
             JOIN loja_empresas le ON le.id = a.loja_id
             JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
             JOIN status_history s ON s.entity_type = 'avaliacao'::text AND s.entity_id = av.id AND s.status = 'adquirida'::text
             JOIN pos_compra_processos pc ON pc.avaliacao_id = av.id
          WHERE (av.tipo_aquisicao = ANY (ARRAY['convertida'::text, 'propria'::text])) AND a.interesse = 'vender'::text AND av.nps_status = 'em_aberto'::text AND pc.etapa = 'TRANSFERÊNCIA CONCLUÍDA'::text AND pc.concluida = true
        UNION ALL
         SELECT DISTINCT ON (av.id) av.id,
            'AVALIAÇÃO'::text AS departamento,
            le.loja,
            upper(av.tipo_aquisicao) AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            e.data_venda::date AS data_negociacao,
            (pv.data_conclusao::date + '1 day'::interval)::date AS data_previsao,
            av.nps_status,
            av.nps_enviado_at::date AS data_envio
           FROM avaliacoes av
             JOIN estoque_motos e ON e.avaliacao_id = av.id
             JOIN atendimentos_motos a ON a.id = av.atendimento_id
             JOIN loja_empresas le ON le.id = a.loja_id
             JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
             JOIN pos_venda_processos pv ON pv.atendimento_id = e.atendimento_venda_id
          WHERE a.interesse = 'vender'::text AND av.tipo_aquisicao = 'consignada'::text AND av.nps_status = 'em_aberto'::text AND e.status = 'vendido'::text AND pv.etapa = 'PREVISÃO DE PAGAMENTO'::text AND pv.concluida = true
        UNION ALL
         SELECT DISTINCT ON (av.id) av.id,
            'AVALIAÇÃO'::text AS departamento,
            le.loja,
            'RETIRADA'::text AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            s.created_at::date AS data_negociacao,
            (s.created_at + '1 day'::interval)::date AS data_previsao,
            av.nps_status,
            av.nps_enviado_at::date AS data_envio
           FROM avaliacoes av
             JOIN atendimentos_motos a ON a.id = av.atendimento_id
             JOIN loja_empresas le ON le.id = a.loja_id
             JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
             JOIN status_history s ON s.entity_type = 'avaliacao'::text AND s.entity_id = av.id AND s.status = 'RETIRADA'::text
          WHERE a.interesse = 'vender'::text AND av.nps_status = 'em_aberto'::text
        UNION ALL
         SELECT DISTINCT ON (ae.id) ae.id,
            'EQUIPAMENTOS'::text AS departamento,
            le.loja,
            'COMPRAR'::text AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            vh.created_at::date AS data_negociacao,
            (vh.created_at + '1 day'::interval)::date AS data_previsao,
            ae.nps_status,
            ae.nps_enviado_at::date AS data_envio
           FROM atendimento_equipamentos ae
             JOIN loja_empresas le ON le.id = ae.loja_id
             JOIN clientes_fornecedores cf ON cf.id = ae.cliente_id
             JOIN LATERAL ( SELECT sh.created_at
                   FROM status_history_equipamentos sh
                  WHERE sh.entity_type = 'atendimento_equipamento'::text AND sh.entity_id = ae.id AND sh.status = 'VENDIDO'::text
                  ORDER BY sh.created_at DESC
                 LIMIT 1) vh ON true
          WHERE ae.status = 'vendido'::text AND ae.nps_status = 'em_aberto'::text AND cf.nome_razao_social IS DISTINCT FROM 'Consumidor Final'::text
        UNION ALL
         SELECT DISTINCT ON (ats.id) ats.id,
            'OFICINA'::text AS departamento,
            le.loja,
            'SERVIÇO'::text AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            ats.entregue_em::date AS data_negociacao,
            (ats.entregue_em + '1 day'::interval)::date AS data_previsao,
            ats.nps_status,
            ats.nps_enviado_at::date AS data_envio
           FROM atendimento_servicos ats
             JOIN loja_empresas le ON le.id = ats.loja_id
             JOIN clientes_fornecedores cf ON cf.id = ats.cliente_id
          WHERE ats.status = 'entregue'::text AND ats.nps_status = 'em_aberto'::text AND ats.entregue_em IS NOT NULL) t
  WHERE data_previsao > '2026-09-01'::date
  ORDER BY t.data_previsao, t.data_negociacao, t.id;
