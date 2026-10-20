-- vw_nps: uma única coluna de id. Antes havia id (registro que guarda o NPS)
-- e id_atendimento (atendimento ligado), iguais exceto nas linhas de AVALIAÇÃO.
-- Pedido do usuário (2026-10-09): manter só o id do registro do NPS, com o
-- nome id_atendimento. Em AVALIAÇÃO ele é o id da avaliação (avaliacoes.id).
-- Remover/renomear coluna exige recriar a view (sem dependentes).
begin;
drop view if exists public.vw_nps;
create view public.vw_nps with (security_invoker = on) as
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
            WHEN norm_loja(le.loja) = 'Ducati'::text THEN 'ducati'::text
            ELSE 'propria'::text
        END) AS tipo_moto,
    COALESCE(e.marca, mi.marca) AS marca,
    COALESCE(e.modelo, mi.modelo) AS modelo,
    e.placa,
    COALESCE(
        CASE
            WHEN e.atendimento_venda_id = a.id THEN e.data_venda
            ELSE NULL::timestamp with time zone
        END, vh.created_at) AS data_venda,
    'SHOWROOM'::text AS departamento,
    a.nps_enviado_at AS data_envio,
    a.id AS id_atendimento
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
                    'ducati'::text AS text,
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
    av.id AS id_atendimento
   FROM avaliacoes av
     JOIN atendimentos_motos a ON a.id = av.atendimento_id
     LEFT JOIN loja_empresas le ON le.id = a.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = a.cliente_id
     LEFT JOIN modelos_motos mo ON mo.id = av.modelo_id
     LEFT JOIN marcas_motos mm ON mm.id = COALESCE(av.marca_id, mo.marca_id)
  WHERE a.interesse = 'vender'::text
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
    ae.id AS id_atendimento
   FROM atendimento_equipamentos ae
     LEFT JOIN loja_empresas le ON le.id = ae.loja_id
     LEFT JOIN clientes_fornecedores cf ON cf.id = ae.cliente_id
     JOIN LATERAL ( SELECT sh.created_at
           FROM status_history_equipamentos sh
          WHERE sh.entity_type = 'atendimento_equipamento'::text AND sh.entity_id = ae.id AND sh.status = 'VENDIDO'::text
          ORDER BY sh.created_at DESC
         LIMIT 1) s ON true;
grant all on public.vw_nps to anon, authenticated, service_role;
commit;
