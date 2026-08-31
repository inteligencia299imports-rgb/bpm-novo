-- atendimentos_motos.empresa_id: empresa escolhida no atendimento (card "Empresa").
-- Deriva da loja (loja_empresas.id = atendimento.loja_id) mas fica explícita e obrigatória no form.

alter table public.atendimentos_motos
  add column if not exists empresa_id uuid references public.empresas(id);

create index if not exists idx_atendimentos_motos_empresa on public.atendimentos_motos (empresa_id);
