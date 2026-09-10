-- Compromissos financeiros passam a nascer na GERAÇÃO DA PROPOSTA (venda/compra),
-- não mais só quando a NF-e é autorizada. Para isso o compromisso precisa de um
-- vínculo estável antes de existir NF-e. `emitir-nfe-compra` passa a reconciliar
-- (vincula nfe_entrada_id + ajusta parcelas não pagas) em vez de sempre inserir.
--
-- origem: 'venda' (a receber) | 'compra' (a pagar, repasse) | 'troca' (a pagar da
-- moto que entra na troca) | 'consignante' (a pagar do proprietário da consignada).

alter table public.compromissos add column if not exists origem text;
alter table public.compromissos add column if not exists contrato_id uuid references public.contratos(id);
alter table public.compromissos add column if not exists avaliacao_id uuid references public.avaliacoes(id);
alter table public.compromissos add column if not exists atendimento_id uuid references public.atendimentos_motos(id);

-- Idempotência: um compromisso por "slot" de negócio (ignora cancelados/apagados).
create unique index if not exists idx_compromissos_origem_venda
  on public.compromissos (contrato_id)
  where origem = 'venda' and deleted_at is null;

create unique index if not exists idx_compromissos_origem_repasse
  on public.compromissos (avaliacao_id)
  where origem in ('compra', 'troca') and deleted_at is null;

create unique index if not exists idx_compromissos_origem_consignante
  on public.compromissos (atendimento_id)
  where origem = 'consignante' and deleted_at is null;

create index if not exists idx_compromissos_contrato on public.compromissos (contrato_id) where contrato_id is not null;
create index if not exists idx_compromissos_avaliacao on public.compromissos (avaliacao_id) where avaliacao_id is not null;
