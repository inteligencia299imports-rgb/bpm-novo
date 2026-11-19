-- Robô de pesquisa NPS pelo WhatsApp (uazapi). Pedido do usuário, 2026-11-19.
--
-- Substitui o envio do n8n: lê a mesma fila (vw_envio_nps), conversa com o cliente com os
-- botões de sempre, pergunta o motivo quando a resposta fica abaixo de "Neutro" e grava em
-- respostas_nps (origem = 'chatbot'), que os relatórios já leem.
--
-- Escopo do robô (o resto segue manual):
--   * todos os PERDIDOS (qualquer loja);
--   * concluídos (NF emitida) de FLN e POA, todos os departamentos;
--   * concluídos da OFICINA de Brasília.
--
-- Nada é enviado enquanto nps_bot_config.ativo = false. Com modo_teste = true, só o
-- telefone_teste recebe e nada é gravado em respostas_nps nem nos status.

-- ------------------------------------------------------------------
-- Lojas: nome mostrado ao cliente, cidade e link de avaliação no Google.
-- Loja que não estiver aqui (ou com ativo = false) não entra no robô.
-- ------------------------------------------------------------------
-- A oficina não tem loja própria: em Brasília ela é a loja 'Ducati BSB'. Por isso a oficina tem
-- nome e link do Google próprios (nome_oficina/link_google_oficina; vazio = usa os da loja).
create table if not exists public.nps_bot_lojas (
  loja text primary key,                -- loja_empresas.loja
  nome_exibicao text not null,          -- "Obrigado por escolher a <nome_exibicao>"
  cidade text not null check (cidade in ('BSB', 'FLN', 'POA')),
  link_google text,
  nome_oficina text,
  link_google_oficina text,
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.nps_bot_lojas (loja, nome_exibicao, cidade, link_google, nome_oficina, link_google_oficina) values
  ('299i',       '299 Imports',          'BSB', 'https://g.page/r/Cb4cpKHzrnJREBM/review', null, null),
  ('299s',       '299 Imports',          'BSB', 'https://g.page/r/CbwQl8FNLskcEBM/review', null, null),
  ('Aventura',   'Aventura',             'BSB', 'https://g.page/r/CT-UmBEZqeacEBM/review', null, null),
  ('Ducati BSB', 'Ducati Brasília',      'BSB', 'https://g.page/r/CT-UmBEZqeacEBM/review',
                 null, 'https://g.page/r/CUW3Rpk79cZzEBM/review'),
  ('Ducati FLN', 'Ducati Florianópolis', 'FLN', 'https://g.page/r/CSVaro5U6XEUEBM/review', null, null),
  ('Ducati POA', 'Ducati Porto Alegre',  'POA', 'https://g.page/r/CStEn9l0hvyAEBM/review', null, null),
  -- Sem link do Google ainda: o cliente recebe só o agradecimento.
  ('299f',       '299 Imports',          'FLN', null, null, null),
  ('299p',       '299 Imports',          'POA', null, null, null)
on conflict (loja) do nothing;

-- ------------------------------------------------------------------
-- Configuração (uma linha só).
-- ------------------------------------------------------------------
create table if not exists public.nps_bot_config (
  id boolean primary key default true check (id),
  ativo boolean not null default false,          -- chave geral: false = não envia nada
  modo_teste boolean not null default true,      -- true = só envia para telefone_teste
  telefone_teste text,
  limite_diario integer not null default 120,    -- novas conversas por dia
  intervalo_min_seg integer not null default 90, -- espaço aleatório entre um envio e outro
  intervalo_max_seg integer not null default 240,
  proximo_envio_at timestamptz,                  -- controlado pelo disparo
  enviar_desde date,                             -- só negociações a partir desta data (corta o acúmulo antigo)
  link_portal_ducati text not null
    default 'https://my.ducati.com/csiaccess?dealerCode=0000111790&country=BR&lang=',
  updated_at timestamptz not null default now()
);
insert into public.nps_bot_config (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- Conversas e mensagens.
-- ------------------------------------------------------------------
create table if not exists public.nps_bot_conversas (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,             -- só dígitos, com 55
  chave_telefone text not null,       -- DDD + 8 últimos dígitos (casa com ou sem o 9)
  chatid text,                        -- JID devolvido pela uazapi
  cliente_id uuid,
  cliente_nome text,
  cliente_email text,
  loja text,                          -- loja principal (fechamento e textos)
  itens jsonb not null,               -- [{id, tabela, departamento, negociacao, loja, ducati, produto}]
  passos jsonb not null default '[]', -- roteiro montado no envio
  passo_atual integer not null default 0,
  aguardando text,                    -- 'opcao' | 'motivo' | 'comentario' | null
  respostas jsonb not null default '{}',
  status text not null default 'enviada'
    check (status in ('enviada', 'em_andamento', 'concluida', 'expirada', 'optout', 'erro')),
  teste boolean not null default false,
  erro text,
  enviada_at timestamptz not null default now(),
  ultima_interacao_at timestamptz not null default now(),
  concluida_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists nps_bot_conversas_chave_idx
  on public.nps_bot_conversas (chave_telefone) where status in ('enviada', 'em_andamento');
create index if not exists nps_bot_conversas_enviada_idx on public.nps_bot_conversas (enviada_at);

create table if not exists public.nps_bot_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.nps_bot_conversas(id) on delete cascade,
  direcao text not null check (direcao in ('enviada', 'recebida')),
  message_id text,
  tipo text,
  conteudo text,
  created_at timestamptz not null default now()
);
-- Evita processar o mesmo evento do webhook duas vezes.
create unique index if not exists nps_bot_mensagens_msgid_uniq
  on public.nps_bot_mensagens (message_id) where message_id is not null and direcao = 'recebida';
create index if not exists nps_bot_mensagens_conversa_idx on public.nps_bot_mensagens (conversa_id, created_at);

-- Quem pediu para não receber mais.
create table if not exists public.nps_bot_optout (
  chave_telefone text primary key,
  telefone text,
  created_at timestamptz not null default now()
);

alter table public.nps_bot_lojas enable row level security;
alter table public.nps_bot_config enable row level security;
alter table public.nps_bot_conversas enable row level security;
alter table public.nps_bot_mensagens enable row level security;
alter table public.nps_bot_optout enable row level security;

-- Leitura para usuários logados (acompanhamento); escrita só pelas funções (service role).
drop policy if exists "nps_bot_lojas leitura" on public.nps_bot_lojas;
create policy "nps_bot_lojas leitura" on public.nps_bot_lojas for select to authenticated using (true);
drop policy if exists "nps_bot_config leitura" on public.nps_bot_config;
create policy "nps_bot_config leitura" on public.nps_bot_config for select to authenticated using (true);
drop policy if exists "nps_bot_conversas leitura" on public.nps_bot_conversas;
create policy "nps_bot_conversas leitura" on public.nps_bot_conversas for select to authenticated using (true);
drop policy if exists "nps_bot_mensagens leitura" on public.nps_bot_mensagens;
create policy "nps_bot_mensagens leitura" on public.nps_bot_mensagens for select to authenticated using (true);

-- ------------------------------------------------------------------
-- Telefone: chave para casar o número do cadastro com o JID do WhatsApp,
-- que às vezes vem sem o 9 (celulares antigos de algumas regiões).
-- ------------------------------------------------------------------
create or replace function public.nps_bot_telefone(_tel text)
returns text language sql immutable set search_path = public as $$
  select case
    when d is null or length(d) < 10 then null
    when length(d) in (10, 11) then '55' || d
    else d
  end
  from (select nullif(regexp_replace(coalesce(_tel, ''), '\D', '', 'g'), '') as d) x;
$$;

create or replace function public.nps_bot_chave_telefone(_tel text)
returns text language sql immutable set search_path = public as $$
  select case when t is null then null
              else substr(t, 3, 2) || right(t, 8) end
  from (select public.nps_bot_telefone(_tel) as t) x;
$$;

-- ------------------------------------------------------------------
-- Fila do robô: vw_envio_nps + escopo + dados que a conversa precisa.
-- ------------------------------------------------------------------
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
   and public.nps_bot_telefone(b.telefone) is not null
   and (b.negociacao = 'PERDIDO'
        or l.cidade in ('FLN', 'POA')
        or b.departamento = 'OFICINA')
   and not exists (select 1 from public.nps_bot_optout o
                    where o.chave_telefone = public.nps_bot_chave_telefone(b.telefone));

grant select on public.vw_nps_bot_fila to authenticated, service_role;
