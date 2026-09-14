-- Log/auditoria de cada chamada feita ao RENAVE-WS (SERPRO), por moto
-- (chassi) e por operação (ação de alto nível do edge function `renave`:
-- cliente | pendentes | entrada | saida | atpv-pdf). Uma "operação" da UI
-- pode disparar mais de uma chamada HTTP ao RENAVE (ex.: `saida` chama
-- municípios + notas-fiscais + saída de estoque + PDF do ATPV) — cada uma
-- vira uma linha aqui, todas com a mesma `operacao`.
create table if not exists renave_chamadas (
  id uuid primary key default gen_random_uuid(),
  chassi text,
  estoque_moto_nova_id uuid references estoque_motos_novas(id) on delete set null,
  operacao text not null,        -- 'cliente' | 'pendentes' | 'entrada' | 'saida' | 'atpv-pdf'
  endpoint text not null,        -- path chamado no RENAVE-WS, ex.: '/api/entradas-estoque-zero-km'
  metodo text not null,          -- GET | POST
  request_body jsonb,
  status_http integer,
  sucesso boolean not null default false,
  response_body jsonb,
  erro_mensagem text,
  usuario_id uuid,               -- caller.id (auth.users) do edge function
  created_at timestamptz not null default now()
);

create index if not exists idx_renave_chamadas_chassi on renave_chamadas(chassi);
create index if not exists idx_renave_chamadas_estoque_moto_nova on renave_chamadas(estoque_moto_nova_id);
create index if not exists idx_renave_chamadas_operacao on renave_chamadas(operacao);
create index if not exists idx_renave_chamadas_created_at on renave_chamadas(created_at desc);

alter table renave_chamadas enable row level security;

-- Leitura: todo usuário autenticado do BPM (auditoria/diagnóstico). Escrita:
-- só o edge function `renave` (service role, contorna RLS) — nenhuma policy
-- de insert/update/delete pro client autenticado, de propósito (log não deve
-- ser editável/apagável pela UI).
drop policy if exists "Leitura renave_chamadas" on renave_chamadas;
create policy "Leitura renave_chamadas" on renave_chamadas
  for select to authenticated using (true);
