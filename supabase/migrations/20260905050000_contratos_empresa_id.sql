-- contratos.empresa_id: empresa emitente da NF-e de compra, escolhida na tela de emissão.
-- Restrita às empresas vinculadas à loja do atendimento (loja_empresas.id = atendimento.loja_id).

alter table public.contratos
  add column if not exists empresa_id uuid references public.empresas(id);

create index if not exists idx_contratos_empresa on public.contratos (empresa_id);
