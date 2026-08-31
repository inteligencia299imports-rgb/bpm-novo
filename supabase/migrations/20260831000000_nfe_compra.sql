-- Emissao de NF-e de compra de moto seminova (Pos-Compra + Focus-NFe).
-- Replica a estrutura fiscal de outro sistema (naturezas de operacao + NF-e de
-- entrada) e adiciona a config de tokens Focus-NFe por empresa.

-- =====================================================================
-- 1. Naturezas de operacao
-- =====================================================================
create table if not exists public.naturezas_operacao (
  id uuid not null default gen_random_uuid(),
  descricao text not null,
  serie text null,
  tipo text not null,
  regime_tributario text null,
  indicador_presenca smallint null,
  faturada boolean not null default true,
  consumidor_final boolean not null default true,
  operacao_devolucao boolean not null default false,
  informacoes_complementares text null,
  informacoes_adicionais_fisco text null,
  ativo boolean not null default true,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  operacao_garantia boolean not null default false,
  empresa_id uuid not null,
  constraint naturezas_operacao_pkey primary key (id),
  constraint naturezas_operacao_created_by_fkey foreign key (created_by) references auth.users (id),
  constraint naturezas_operacao_empresa_id_fkey foreign key (empresa_id) references public.empresas (id),
  constraint naturezas_operacao_tipo_check check (tipo = any (array['entrada'::text, 'saida'::text]))
);

create index if not exists idx_naturezas_operacao_tipo on public.naturezas_operacao using btree (tipo);
create index if not exists idx_naturezas_operacao_regime on public.naturezas_operacao using btree (regime_tributario);
create index if not exists idx_naturezas_operacao_empresa on public.naturezas_operacao using btree (empresa_id);

drop trigger if exists trg_naturezas_operacao_updated_at on public.naturezas_operacao;
create trigger trg_naturezas_operacao_updated_at before update on public.naturezas_operacao
  for each row execute function set_updated_at();

create table if not exists public.naturezas_operacao_regras (
  id uuid not null default gen_random_uuid(),
  natureza_operacao_id uuid not null,
  imposto text not null,
  destino_ufs text[] not null default '{}'::text[],
  cfop text null,
  situacao_tributaria text null,
  aliquota numeric(7, 4) null,
  reducao_base_calculo numeric(7, 4) null,
  codigo_servico_issqn text null,
  tipo_retencao text null,
  observacoes text null,
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tipo_tributacao text null,
  produto_tipo text not null default 'todos'::text,
  produto_ncms text[] not null default '{}'::text[],
  produto_categorias text[] not null default '{}'::text[],
  informacoes_complementares text null,
  informacoes_adicionais_fisco text null,
  base_calculo numeric null,
  aliquota_interna_destino numeric null,
  aliquota_fcp numeric null,
  base_percentual numeric null,
  descontar_iss_total boolean not null default false,
  reter_iss boolean not null default false,
  presumido_pis_cofins boolean not null default false,
  somar_outras_despesas boolean not null default false,
  aliquota_funrural numeric null,
  compra_produtor_rural boolean not null default false,
  descontar_funrural_total boolean not null default false,
  tipo_aprox_trib text null,
  tipo_desconto text null,
  possui_retencao_csrf boolean not null default false,
  aliquota_csrf numeric null,
  possui_retencao_ir boolean not null default false,
  aliquota_ir numeric null,
  codigo_enquadramento_ipi text null,
  constraint naturezas_operacao_regras_pkey primary key (id),
  constraint naturezas_operacao_regras_natureza_operacao_id_fkey foreign key (natureza_operacao_id)
    references public.naturezas_operacao (id) on delete cascade,
  constraint naturezas_operacao_regras_imposto_check check (
    imposto = any (array['icms'::text, 'ipi'::text, 'pis'::text, 'cofins'::text, 'issqn'::text, 'outros'::text, 'retencoes'::text])
  ),
  constraint naturezas_operacao_regras_tipo_retencao_check check (
    (tipo_retencao is null) or (tipo_retencao = any (array['irrf'::text, 'inss'::text, 'csll'::text, 'pis'::text, 'cofins'::text, 'iss'::text]))
  )
);

create index if not exists idx_naturezas_operacao_regras_natureza on public.naturezas_operacao_regras using btree (natureza_operacao_id);
create index if not exists idx_naturezas_operacao_regras_imposto on public.naturezas_operacao_regras using btree (imposto);
create index if not exists idx_naturezas_operacao_regras_destino_ufs on public.naturezas_operacao_regras using gin (destino_ufs);

drop trigger if exists trg_naturezas_operacao_regras_updated_at on public.naturezas_operacao_regras;
create trigger trg_naturezas_operacao_regras_updated_at before update on public.naturezas_operacao_regras
  for each row execute function set_updated_at();

-- =====================================================================
-- 2. NF-e de entrada
-- =====================================================================
create table if not exists public.nfe_entradas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid null,
  chave_nfe text null,
  numero text null,
  serie text null,
  fornecedor_id uuid null,
  data_emissao timestamp with time zone null,
  data_entrada timestamp with time zone null,
  valor_total numeric(14, 2) not null default 0,
  valor_frete numeric(14, 2) not null default 0,
  valor_desconto numeric(14, 2) not null default 0,
  status text not null default 'recebida'::text,
  fase_atual text null,
  erro_mensagem text null,
  xml_raw text null,
  etapa_entrada text not null default 'conferencia'::text,
  departamento text not null default 'motos'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  -- extensoes para o fluxo de compra BPM / Focus-NFe:
  avaliacao_id uuid null,
  natureza_operacao_id uuid null,
  ref_externa text null,
  caminho_danfe text null,
  focus_status text null,
  constraint nfe_entradas_pkey primary key (id),
  constraint nfe_entradas_chave_nfe_key unique (chave_nfe),
  constraint nfe_entradas_fornecedor_id_fkey foreign key (fornecedor_id) references public.clientes_fornecedores (id) on delete set null,
  constraint nfe_entradas_avaliacao_id_fkey foreign key (avaliacao_id) references public.avaliacoes (id) on delete set null,
  constraint nfe_entradas_natureza_operacao_id_fkey foreign key (natureza_operacao_id) references public.naturezas_operacao (id),
  constraint nfe_entradas_etapa_entrada_check check (
    etapa_entrada = any (array['pedido_compra'::text, 'vinculacao'::text, 'conferencia'::text, 'categorizacao'::text, 'concluido'::text])
  ),
  constraint nfe_entradas_status_check check (
    status = any (array['recebida'::text, 'validando'::text, 'processando_itens'::text, 'gerando_contas'::text, 'processada'::text, 'processada_com_pendencias'::text, 'erro'::text])
  )
);

create index if not exists idx_nfe_entradas_fornecedor on public.nfe_entradas using btree (fornecedor_id);
create index if not exists idx_nfe_entradas_status on public.nfe_entradas using btree (status);
create index if not exists idx_nfe_entradas_etapa on public.nfe_entradas using btree (etapa_entrada);
create index if not exists idx_nfe_entradas_avaliacao on public.nfe_entradas using btree (avaliacao_id);
create unique index if not exists nfe_entradas_ref_externa_key on public.nfe_entradas using btree (ref_externa);

drop trigger if exists trg_nfe_entradas_upd on public.nfe_entradas;
create trigger trg_nfe_entradas_upd before update on public.nfe_entradas
  for each row execute function set_updated_at();

create table if not exists public.nfe_itens (
  id uuid not null default gen_random_uuid(),
  nfe_id uuid not null,
  descricao_nf text null,
  codigo_fornecedor text null,
  ean text null,
  ncm text null,
  cfop text null,
  cst text null,
  unidade text null,
  quantidade numeric(14, 3) not null default 0,
  valor_unitario numeric(14, 4) not null default 0,
  valor_total_item numeric(14, 2) not null default 0,
  valor_desconto numeric(14, 2) not null default 0,
  frete_rateado numeric(14, 2) not null default 0,
  custo_total_real numeric(14, 4) null,
  icms_base numeric(14, 2) null default 0,
  icms_aliquota numeric(7, 4) null default 0,
  icms_valor numeric(14, 2) null default 0,
  icms_st_base numeric(14, 2) null default 0,
  icms_st_valor numeric(14, 2) null default 0,
  ipi_valor numeric(14, 2) null default 0,
  pis_valor numeric(14, 2) null default 0,
  cofins_valor numeric(14, 2) null default 0,
  departamento text not null default 'oficina'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint nfe_itens_pkey primary key (id),
  constraint nfe_itens_nfe_id_fkey foreign key (nfe_id) references public.nfe_entradas (id) on delete cascade
);

create index if not exists idx_nfe_itens_nfe on public.nfe_itens using btree (nfe_id);
create index if not exists idx_nfe_itens_codigo_forn on public.nfe_itens using btree (codigo_fornecedor);

drop trigger if exists trg_nfe_itens_upd on public.nfe_itens;
create trigger trg_nfe_itens_upd before update on public.nfe_itens
  for each row execute function set_updated_at();

-- =====================================================================
-- 3. Config de tokens Focus-NFe por empresa
-- =====================================================================
create table if not exists public.empresas_focus_config (
  empresa_id uuid not null,
  token_homologacao text null,
  token_producao text null,
  habilitado boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint empresas_focus_config_pkey primary key (empresa_id),
  constraint empresas_focus_config_empresa_id_fkey foreign key (empresa_id) references public.empresas (id)
);

drop trigger if exists trg_empresas_focus_config_upd on public.empresas_focus_config;
create trigger trg_empresas_focus_config_upd before update on public.empresas_focus_config
  for each row execute function set_updated_at();

-- =====================================================================
-- 4. Seed: 1 natureza "Compra de moto seminova" por empresa BPM + regra ICMS
-- =====================================================================
insert into public.naturezas_operacao (descricao, serie, tipo, faturada, consumidor_final, operacao_devolucao, empresa_id)
select 'Compra de moto seminova', '1', 'entrada', true, false, false, e.id
from public.empresas e
where e.bpm = true
  and not exists (
    select 1 from public.naturezas_operacao n
    where n.empresa_id = e.id and n.descricao = 'Compra de moto seminova'
  );

insert into public.naturezas_operacao_regras (natureza_operacao_id, imposto, cfop, situacao_tributaria, aliquota, ordem, produto_tipo)
select n.id, 'icms', '1102', '102', 0, 0, 'todos'
from public.naturezas_operacao n
where n.descricao = 'Compra de moto seminova'
  and not exists (
    select 1 from public.naturezas_operacao_regras r
    where r.natureza_operacao_id = n.id and r.imposto = 'icms'
  );

-- =====================================================================
-- 5. RLS
-- =====================================================================
alter table public.naturezas_operacao enable row level security;
alter table public.naturezas_operacao_regras enable row level security;
alter table public.nfe_entradas enable row level security;
alter table public.nfe_itens enable row level security;
alter table public.empresas_focus_config enable row level security;

-- Naturezas: leitura liberada a usuarios autenticados (config, nao sensivel).
drop policy if exists "Leitura naturezas_operacao" on public.naturezas_operacao;
create policy "Leitura naturezas_operacao" on public.naturezas_operacao
  for select to authenticated using (true);

drop policy if exists "Leitura naturezas_operacao_regras" on public.naturezas_operacao_regras;
create policy "Leitura naturezas_operacao_regras" on public.naturezas_operacao_regras
  for select to authenticated using (true);

-- NF-e de entrada: mesmo criterio de acesso do resto do sistema (via avaliacao -> atendimento -> loja).
drop policy if exists "Acesso nfe_entradas" on public.nfe_entradas;
create policy "Acesso nfe_entradas" on public.nfe_entradas
  for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = nfe_entradas.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );

drop policy if exists "Acesso nfe_itens" on public.nfe_itens;
create policy "Acesso nfe_itens" on public.nfe_itens
  for select to authenticated
  using (
    exists (
      select 1
      from public.nfe_entradas ne
      join public.avaliacoes av on av.id = ne.avaliacao_id
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where ne.id = nfe_itens.nfe_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );

-- Insert/update/delete de NF-e: so via service role (Edge Function). Sem policies.

-- empresas_focus_config: contem tokens -> nenhuma policy, acesso somente service role.
