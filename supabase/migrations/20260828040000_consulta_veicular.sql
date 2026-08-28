-- Consulta veicular SERPRO/SENATRAN + RENAVE: colunas novas em avaliacoes
-- pra guardar dados devolvidos pela consulta (reaproveitados nas proximas)
-- e tabela de auditoria/historico das consultas realizadas.

alter table public.avaliacoes
  add column if not exists renavam text,
  add column if not exists chassi text,
  add column if not exists uf text;

create table if not exists public.consultas_veiculares (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid references public.avaliacoes(id) on delete cascade,
  usuario_id uuid not null,
  placa text not null,
  uf text,
  renavam text,
  fontes_consultadas jsonb not null default '{}'::jsonb,
  tempo_resposta_ms integer,
  resultado jsonb not null,
  correlation_id text,
  created_at timestamp with time zone not null default now()
);

create index if not exists consultas_veiculares_avaliacao_id_idx
  on public.consultas_veiculares (avaliacao_id, created_at desc);

alter table public.consultas_veiculares enable row level security;

-- Mesmo padrao de acesso do resto do sistema: quem tem acesso a avaliacao
-- (via atendimento -> loja) tem acesso ao historico de consulta dela.
create policy "Acesso consultas_veiculares" on public.consultas_veiculares
  for select to authenticated
  using (
    exists (
      select 1 from public.avaliacoes av
      join public.atendimentos_motos a on a.id = av.atendimento_id
      where av.id = consultas_veiculares.avaliacao_id
        and (a.vendedor_id = auth.uid() or public.has_master_or_gerente_empresa(auth.uid(), a.loja_id))
    )
  );

-- Insert so pelo service role (Edge Function usa a service role key, que
-- ignora RLS) -- nenhuma policy de insert/update/delete pro papel authenticated,
-- log de auditoria e append-only e nunca deve ser escrito direto pelo cliente.
