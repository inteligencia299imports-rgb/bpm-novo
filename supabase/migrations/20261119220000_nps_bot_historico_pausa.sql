-- Robô de NPS: histórico de movimentações e pausa automática se o WhatsApp cair.
-- Pedido do usuário, 2026-11-19.
--
-- 1) Envio registrado no histórico do atendimento, como o n8n fazia (autor "Setor de Inteligência"):
--    "NPS ENVIADO", "NPS NÃO ENVIADO" (telefone inválido, sem WhatsApp ou falha no envio) e
--    "NPS RESPONDIDO". Não enviado também sai da fila (nps_status = 'enviado'), igual ao n8n.
-- 2) Se a instância do WhatsApp desconectar (queda ou bloqueio), o robô pausa sozinho
--    (ativo = false, pausado_motivo/pausado_at) e avisa telefone_alerta.

alter table public.nps_bot_config
  add column if not exists telefone_alerta text default '5561995582949',
  add column if not exists pausado_motivo text,
  add column if not exists pausado_at timestamptz;
update public.nps_bot_config set telefone_alerta = '5561995582949' where telefone_alerta is null;

-- Fila: agora inclui telefone inválido (telefone_envio nulo) para registrar o não envio.
create or replace view public.vw_nps_bot_fila with (security_invoker = on) as
with base as (
  select f.*,
         case f.departamento
           when 'SHOWROOM' then 'atendimentos_motos'
           when 'AVALIAÇÃO' then 'avaliacoes'
           when 'EQUIPAMENTOS' then 'atendimento_equipamentos'
           when 'OFICINA' then 'atendimento_servicos'
         end as tabela,
         coalesce(am.cliente_id, av_am.cliente_id, ae.cliente_id, ats.cliente_id) as cliente_id,
         nm.marca
    from public.vw_envio_nps f
    left join public.atendimentos_motos am
           on f.departamento = 'SHOWROOM' and am.id = f.id
    left join public.avaliacoes av
           on f.departamento = 'AVALIAÇÃO' and av.id = f.id
    left join public.atendimentos_motos av_am on av_am.id = av.atendimento_id
    left join public.atendimento_equipamentos ae
           on f.departamento = 'EQUIPAMENTOS' and ae.id = f.id
    left join public.atendimento_servicos ats
           on f.departamento = 'OFICINA' and ats.id = f.id
    -- Marca da moto como a vw_nps resolve (venda, avaliação e oficina).
    left join lateral (
      select n.marca from public.vw_nps n where n.id_atendimento = f.id and n.marca is not null limit 1
    ) nm on true
)
select b.id,
       b.tabela,
       b.departamento,
       b.negociacao,
       b.loja,
       l.cidade,
       case when b.departamento = 'OFICINA' then coalesce(l.nome_oficina, l.nome_exibicao)
            else l.nome_exibicao end as nome_exibicao,
       case when b.departamento = 'OFICINA' then coalesce(l.link_google_oficina, l.link_google)
            else l.link_google end as link_google,
       b.cliente_id,
       b.cliente,
       cf.email as cliente_email,
       b.telefone,
       public.nps_bot_telefone(b.telefone) as telefone_envio,
       public.nps_bot_chave_telefone(b.telefone) as chave_telefone,
       b.data_negociacao,
       -- Avaliação segue a data da view; o resto vai no dia seguinte à negociação.
       case when b.departamento = 'AVALIAÇÃO' then b.data_previsao
            else greatest(b.data_previsao, b.data_negociacao + 1) end as enviar_a_partir,
       -- Oficina: Ducati é a MARCA da moto (a oficina de BSB fica na loja Ducati BSB e atende
       -- outras marcas). Demais departamentos: loja Ducati ou moto Ducati.
       case when b.departamento = 'OFICINA'
            then upper(coalesce(b.marca, '')) like '%DUCATI%'
            else upper(coalesce(b.loja, '')) like '%DUCATI%'
                 or upper(coalesce(b.marca, '')) like '%DUCATI%' end as ducati
  from base b
  join public.nps_bot_lojas l on l.loja = b.loja and l.ativo
  left join public.clientes_fornecedores cf on cf.id = b.cliente_id
 where b.nps_status = 'em_aberto'
   -- Telefone inválido também entra: o disparo registra "NPS NÃO ENVIADO" (como o n8n fazia).
   and (b.negociacao = 'PERDIDO'
        or l.cidade in ('FLN', 'POA')
        or b.departamento = 'OFICINA')
   and not exists (select 1 from public.nps_bot_optout o
                    where o.chave_telefone = public.nps_bot_chave_telefone(b.telefone));

grant select on public.vw_nps_bot_fila to authenticated, service_role;
