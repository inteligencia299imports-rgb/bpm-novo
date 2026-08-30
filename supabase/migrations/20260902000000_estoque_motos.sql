-- Estoque de motos: estrutura enxuta. A tabela "estoque" esta vazia; renomeamos
-- para "estoque_motos" e removemos todas as colunas denormalizadas (specs da
-- moto, preco, empresa, classificacao, tipo, loja, data_entrada) -- que passam a
-- ser derivadas de avaliacoes / loja_empresas / empresas em tempo de leitura.
-- Mantidos: valor_venda / valor_sinal / data_venda / preco_acao / observacoes /
-- status / avaliacao_id / atendimento_venda_id. Novo: loja_id (text = loja_empresas.id).

-- Policies antigas referenciam a coluna "loja" (que sera removida) -> dropar antes.
drop policy if exists "Acesso estoque" on public.estoque;
drop policy if exists "Gerencia estoque" on public.estoque;
drop policy if exists "Vendedor atualiza estoque venda" on public.estoque;

alter table public.estoque rename to estoque_motos;

alter table public.estoque_motos
  drop column if exists tipo,
  drop column if exists marca,
  drop column if exists categoria,
  drop column if exists modelo,
  drop column if exists cor,
  drop column if exists cilindrada,
  drop column if exists placa,
  drop column if exists ano_fabricacao,
  drop column if exists ano_modelo,
  drop column if exists km,
  drop column if exists preco,
  drop column if exists empresa,
  drop column if exists classificacao,
  drop column if exists loja,
  drop column if exists data_entrada;

alter table public.estoque_motos add column if not exists loja_id text;

create index if not exists idx_estoque_motos_avaliacao on public.estoque_motos (avaliacao_id);
create index if not exists idx_estoque_motos_atend_venda on public.estoque_motos (atendimento_venda_id);
create index if not exists idx_estoque_motos_status on public.estoque_motos (status);

-- =====================================================================
-- RLS: recria usando loja_id (= loja_empresas.id) + fallback pelo atendimento
-- de origem.
-- =====================================================================
create policy "Acesso estoque_motos" on public.estoque_motos
  for select to authenticated
  using (
    public.has_app_role(auth.uid(), 'master'::app_role)
    or (loja_id is not null and public.has_master_or_gerente_empresa(auth.uid(), loja_id::uuid))
    or exists (
      select 1
      from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = estoque_motos.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );

create policy "Gerencia estoque_motos" on public.estoque_motos
  for all to authenticated
  using (
    public.has_app_role(auth.uid(), 'master'::app_role)
    or (loja_id is not null and public.has_master_or_gerente_empresa(auth.uid(), loja_id::uuid))
  )
  with check (
    public.has_app_role(auth.uid(), 'master'::app_role)
    or (loja_id is not null and public.has_master_or_gerente_empresa(auth.uid(), loja_id::uuid))
  );

create policy "Vendedor atualiza estoque_motos venda" on public.estoque_motos
  for update to authenticated
  using (
    public.has_app_role(auth.uid(), 'vendedor'::app_role)
    and exists (
      select 1
      from public.motos_interesse mi
      join public.atendimentos_motos a on a.id = mi.atendimento_id
      where mi.estoque_moto_id = estoque_motos.id::text
        and a.vendedor_id = auth.uid()
    )
  );
