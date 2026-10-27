-- NPS: atendimentos perdidos do CRM (equipamentos) e do OFC (oficina) também
-- entram na vw_nps e na vw_envio_nps; no envio a negociação aparece como
-- RETIRADA (pedido do usuário, 2026-10-27). Fora: voucher removido da proposta
-- da moto (CRM) e frota interna (OFC). Definições regeradas do banco (prod).

CREATE OR REPLACE VIEW public.vw_nps WITH (security_invoker = on) AS
SELECT a.situacao AS status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(a.cliente_id) AS uf,
    a.interesse,
    a.nps_status,
    nome_usuario(a.vendedor_id, '299bpm'::text) AS vendedor,
    COALESCE(e.tipo,
        CASE
            WHEN norm_loja(le.loja) = 'Ducati'::text THEN '0km'::text
            ELSE 'propria'::text
        END) AS tipo_moto,
    COALESCE(e.marca, mi.marca) AS marca,
    COALESCE(e.modelo, mi.modelo) AS modelo,
    e.placa,
        CASE
            WHEN a.situacao = 'perdido'::text THEN a.created_at
            ELSE COALESCE(
            CASE
                WHEN e.atendimento_venda_id = a.id THEN e.data_venda
                ELSE NULL::timestamp with time zone
            END, vh.created_at)
        END AS data_venda,
        CASE
            WHEN COALESCE(e.tipo,
            CASE
                WHEN norm_loja(le.loja) = 'Ducati'::text THEN '0km'::text
                ELSE 'propria'::text
            END) = '0km'::text THEN 'DUCATI'::text
            ELSE 'SHOWROOM'::text
        END AS departamento,
    a.nps_enviado_at AS data_envio,
    a.id AS id_atendimento,
    split_part(a.id::text, '-'::text, 1) AS id_prefix
   FROM atendimentos_motos a
     LEFT JOIN loja_empresas le ON le.id = a.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
     LEFT JOIN LATERAL ( SELECT mm.nome AS marca,
            mo.nome AS modelo,
            mi2.estoque_moto_id
           FROM motos_interesse mi2
             LEFT JOIN modelos_motos mo ON mo.id = mi2.modelo_id
             LEFT JOIN marcas_motos mm ON mm.id = COALESCE(mi2.marca_id, mo.marca_id)
          WHERE mi2.atendimento_id = a.id
          ORDER BY (mi2.estoque_moto_id IS NOT NULL) DESC, mi2.created_at
         LIMIT 1) mi ON true
     LEFT JOIN LATERAL ( SELECT x.atendimento_venda_id,
            x.tipo,
            x.marca,
            x.modelo,
            x.placa,
            x.data_venda,
            x.updated_at,
            x.created_at,
            x.prioridade
           FROM ( SELECT em.atendimento_venda_id,
                    COALESCE(av0.tipo_aquisicao, 'propria'::text) AS tipo,
                    mm.nome AS marca,
                    mo.nome AS modelo,
                    av0.placa,
                    em.data_venda,
                    em.updated_at,
                    em.created_at,
                        CASE
                            WHEN mi.estoque_moto_id = em.id::text THEN 0
                            ELSE 1
                        END AS prioridade
                   FROM estoque_motos em
                     LEFT JOIN avaliacoes av0 ON av0.id = em.avaliacao_id
                     LEFT JOIN modelos_motos mo ON mo.id = av0.modelo_id
                     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(av0.marca_id, mo.marca_id)
                  WHERE em.atendimento_venda_id = a.id OR mi.estoque_moto_id = em.id::text
                UNION ALL
                 SELECT en.atendimento_venda_id,
                        CASE
                            WHEN en.tipo = 'test_ride'::text THEN 'test-ride'::text
                            ELSE '0km'::text
                        END AS text,
                    mm.nome,
                    mo.nome,
                    en.placa,
                    en.data_venda,
                    en.updated_at,
                    en.created_at,
                        CASE
                            WHEN mi.estoque_moto_id = en.id::text THEN 0
                            ELSE 1
                        END AS "case"
                   FROM estoque_motos_novas en
                     LEFT JOIN modelos_motos mo ON mo.id = en.modelo_id
                     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(en.marca_id, mo.marca_id)
                  WHERE en.atendimento_venda_id = a.id OR mi.estoque_moto_id = en.id::text) x
          ORDER BY x.prioridade, x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
         LIMIT 1) e ON true
     LEFT JOIN LATERAL ( SELECT sh.created_at
           FROM status_history sh
          WHERE sh.entity_type = 'showroom'::text AND sh.entity_id = a.id AND sh.status = 'vendido'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) vh ON true
  WHERE (a.situacao = ANY (ARRAY['vendido'::text, 'perdido'::text])) AND (a.interesse = ANY (ARRAY['comprar'::text, 'trocar'::text]))
UNION ALL
 SELECT av.situacao AS status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(a.cliente_id) AS uf,
    a.interesse,
    av.nps_status,
    nome_usuario(av.avaliador_id, '299bpm'::text) AS vendedor,
    av.tipo_aquisicao AS tipo_moto,
    mm.nome AS marca,
    mo.nome AS modelo,
    av.placa,
    ( SELECT min(sh.created_at) AS min
           FROM status_history sh
          WHERE sh.entity_type = 'avaliacao'::text AND sh.entity_id = av.id AND sh.status = 'adquirida'::text) AS data_venda,
    'AVALIAÇÃO'::text AS departamento,
    av.nps_enviado_at AS data_envio,
    av.id AS id_atendimento,
    split_part(av.id::text, '-'::text, 1) AS id_prefix
   FROM avaliacoes av
     JOIN atendimentos_motos a ON a.id = av.atendimento_id
     LEFT JOIN loja_empresas le ON le.id = a.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
     LEFT JOIN modelos_motos mo ON mo.id = av.modelo_id
     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(av.marca_id, mo.marca_id)
  WHERE a.interesse = 'vender'::text AND (av.situacao = ANY (ARRAY['adquirida'::text, 'estoque'::text, 'oficina'::text, 'perdido'::text]))
UNION ALL
 SELECT ae.status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(ae.cliente_id) AS uf,
    'comprar'::text AS interesse,
    ae.nps_status,
    COALESCE(nome_usuario(ae.user_id, '299crm'::text), 'Sem nome'::text) AS vendedor,
    NULL::text AS tipo_moto,
    NULL::text AS marca,
    NULL::text AS modelo,
    NULL::text AS placa,
    s.created_at AS data_venda,
    'EQUIPAMENTOS'::text AS departamento,
    ae.nps_enviado_at AS data_envio,
    ae.id AS id_atendimento,
    split_part(ae.id::text, '-'::text, 1) AS id_prefix
   FROM atendimento_equipamentos ae
     LEFT JOIN loja_empresas le ON le.id = ae.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = ae.cliente_id
     JOIN LATERAL ( SELECT sh.created_at
           FROM status_history_equipamentos sh
          WHERE sh.entity_type = 'atendimento_equipamento'::text AND sh.entity_id = ae.id AND sh.status = 'VENDIDO'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) s ON true
  WHERE ae.status = 'vendido'::text
UNION ALL
 SELECT ats.status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(ats.cliente_id) AS uf,
    'comprar'::text AS interesse,
    ats.nps_status,
    COALESCE(nome_usuario(ats.user_id, '299oficina'::text), 'Sem nome'::text) AS vendedor,
    NULL::text AS tipo_moto,
    mm.nome AS marca,
    mo.nome AS modelo,
    ats.moto_placa AS placa,
    s.created_at AS data_venda,
    'OFICINA'::text AS departamento,
    ats.nps_enviado_at AS data_envio,
    ats.id AS id_atendimento,
    split_part(ats.id::text, '-'::text, 1) AS id_prefix
   FROM atendimento_servicos ats
     LEFT JOIN loja_empresas le ON le.id = ats.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = ats.cliente_id
     LEFT JOIN modelos_motos mo ON mo.id = ats.modelo_id
     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(ats.marca_id, mo.marca_id)
     JOIN LATERAL ( SELECT sh.created_at
           FROM status_history_servicos sh
          WHERE sh.entity_type = 'atendimento_servico'::text AND sh.entity_id = ats.id AND sh.status = 'faturado'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) s ON true
  WHERE ats.status = 'faturado'::text AND COALESCE(ats.tipo_cliente, ''::text) <> 'frota_interna'::text
UNION ALL
 SELECT ae.status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(ae.cliente_id) AS uf,
    'comprar'::text AS interesse,
    COALESCE(ae.nps_status, 'em_aberto'::text) AS nps_status,
    COALESCE(nome_usuario(ae.user_id, '299crm'::text), 'Sem nome'::text) AS vendedor,
    NULL::text AS tipo_moto,
    NULL::text AS marca,
    NULL::text AS modelo,
    NULL::text AS placa,
    COALESCE(p.created_at, ae.created_at) AS data_venda,
    'EQUIPAMENTOS'::text AS departamento,
    ae.nps_enviado_at AS data_envio,
    ae.id AS id_atendimento,
    split_part(ae.id::text, '-'::text, 1) AS id_prefix
   FROM atendimento_equipamentos ae
     LEFT JOIN loja_empresas le ON le.id = ae.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = ae.cliente_id
     LEFT JOIN LATERAL ( SELECT sh.created_at
           FROM status_history_equipamentos sh
          WHERE sh.entity_type = 'atendimento_equipamento'::text AND sh.entity_id = ae.id AND sh.status = 'PERDIDO'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) p ON true
  WHERE ae.status = 'perdido'::text AND COALESCE(ae.operacao, ''::text) <> 'voucher'::text
UNION ALL
 SELECT ats.status,
    le.loja,
    cf.nome_razao_social AS nome_cliente,
    cf.telefone,
    cf.sexo,
    uf_cliente(ats.cliente_id) AS uf,
    'comprar'::text AS interesse,
    COALESCE(ats.nps_status, 'em_aberto'::text) AS nps_status,
    COALESCE(nome_usuario(ats.user_id, '299oficina'::text), 'Sem nome'::text) AS vendedor,
    NULL::text AS tipo_moto,
    mm.nome AS marca,
    mo.nome AS modelo,
    ats.moto_placa AS placa,
    COALESCE(p.created_at, ats.created_at) AS data_venda,
    'OFICINA'::text AS departamento,
    ats.nps_enviado_at AS data_envio,
    ats.id AS id_atendimento,
    split_part(ats.id::text, '-'::text, 1) AS id_prefix
   FROM atendimento_servicos ats
     LEFT JOIN loja_empresas le ON le.id = ats.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = ats.cliente_id
     LEFT JOIN modelos_motos mo ON mo.id = ats.modelo_id
     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(ats.marca_id, mo.marca_id)
     LEFT JOIN LATERAL ( SELECT sh.created_at
           FROM status_history_servicos sh
          WHERE sh.entity_type = 'atendimento_servico'::text AND sh.entity_id = ats.id AND sh.status = 'perdido'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) p ON true
  WHERE ats.status = 'perdido'::text AND COALESCE(ats.tipo_cliente, ''::text) <> 'frota_interna'::text;

CREATE OR REPLACE VIEW public.vw_envio_nps WITH (security_invoker = on) AS
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
                CASE
                    WHEN ats.numero_venda_balcao IS NOT NULL THEN 'VENDA BALCÃO'::text
                    ELSE 'SERVIÇO'::text
                END AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            fh.created_at::date AS data_negociacao,
            (fh.created_at + '1 day'::interval)::date AS data_previsao,
            ats.nps_status,
            ats.nps_enviado_at::date AS data_envio
           FROM atendimento_servicos ats
             JOIN loja_empresas le ON le.id = ats.loja_id
             JOIN clientes_fornecedores cf ON cf.id = ats.cliente_id
             JOIN LATERAL ( SELECT sh.created_at
                   FROM status_history_servicos sh
                  WHERE sh.entity_type = 'atendimento_servico'::text AND sh.entity_id = ats.id AND sh.status = 'faturado'::text
                  ORDER BY sh.created_at DESC
                 LIMIT 1) fh ON true
          WHERE ats.status = 'faturado'::text AND ats.nps_status = 'em_aberto'::text AND cf.nome_razao_social IS DISTINCT FROM 'Consumidor Final'::text AND COALESCE(ats.tipo_cliente, ''::text) <> 'frota_interna'::text
        UNION ALL
         SELECT DISTINCT ON (ae.id) ae.id,
            'EQUIPAMENTOS'::text AS departamento,
            le.loja,
            'RETIRADA'::text AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            COALESCE(p.created_at, ae.created_at)::date AS data_negociacao,
            (COALESCE(p.created_at, ae.created_at) + '1 day'::interval)::date AS data_previsao,
            COALESCE(ae.nps_status, 'em_aberto'::text) AS nps_status,
            ae.nps_enviado_at::date AS data_envio
           FROM atendimento_equipamentos ae
             JOIN loja_empresas le ON le.id = ae.loja_id
             JOIN clientes_fornecedores cf ON cf.id = ae.cliente_id
             LEFT JOIN LATERAL ( SELECT sh.created_at
                   FROM status_history_equipamentos sh
                  WHERE sh.entity_type = 'atendimento_equipamento'::text AND sh.entity_id = ae.id AND sh.status = 'PERDIDO'::text
                  ORDER BY sh.created_at DESC
                 LIMIT 1) p ON true
          WHERE ae.status = 'perdido'::text AND COALESCE(ae.operacao, ''::text) <> 'voucher'::text AND COALESCE(ae.nps_status, 'em_aberto'::text) = 'em_aberto'::text AND cf.nome_razao_social IS DISTINCT FROM 'Consumidor Final'::text
        UNION ALL
         SELECT DISTINCT ON (ats.id) ats.id,
            'OFICINA'::text AS departamento,
            le.loja,
            'RETIRADA'::text AS negociacao,
            cf.nome_razao_social AS cliente,
            cf.telefone,
            COALESCE(p.created_at, ats.created_at)::date AS data_negociacao,
            (COALESCE(p.created_at, ats.created_at) + '1 day'::interval)::date AS data_previsao,
            COALESCE(ats.nps_status, 'em_aberto'::text) AS nps_status,
            ats.nps_enviado_at::date AS data_envio
           FROM atendimento_servicos ats
             JOIN loja_empresas le ON le.id = ats.loja_id
             JOIN clientes_fornecedores cf ON cf.id = ats.cliente_id
             LEFT JOIN LATERAL ( SELECT sh.created_at
                   FROM status_history_servicos sh
                  WHERE sh.entity_type = 'atendimento_servico'::text AND sh.entity_id = ats.id AND sh.status = 'perdido'::text
                  ORDER BY sh.created_at DESC
                 LIMIT 1) p ON true
          WHERE ats.status = 'perdido'::text AND COALESCE(ats.nps_status, 'em_aberto'::text) = 'em_aberto'::text AND cf.nome_razao_social IS DISTINCT FROM 'Consumidor Final'::text AND COALESCE(ats.tipo_cliente, ''::text) <> 'frota_interna'::text) t
  WHERE ((departamento <> ALL (ARRAY['SHOWROOM'::text, 'EQUIPAMENTOS'::text])) OR data_negociacao >= '2026-09-01'::date) AND NOT (EXISTS ( SELECT 1
           FROM respostas_nps r
          WHERE r.atendimento_id = t.id))
  ORDER BY data_previsao, data_negociacao, id;
