-- Corrige duplicação de CNH em clientes_fornecedores_documentos.
--
-- Causa: cada tela que anexa CNH (AtendimentoDetail, AvaliacaoForm,
-- ClienteEditDialog...) decide inserir x atualizar olhando só pro seu próprio
-- estado local `cnhDocId`. Se o cliente já tinha uma linha de CNH criada por
-- OUTRA tela (ou a leitura inicial falhou), essa tela nunca descobre o docId
-- existente e faz um INSERT novo -> linha duplicada. A partir daí,
-- `.eq('tipo_documento','cnh').maybeSingle()` passa a dar erro (mais de uma
-- linha) em TODA leitura futura, e o app volta a achar que "não tem CNH" ->
-- todo upload seguinte insere mais uma duplicata. Loop que faz a CNH "sumir"
-- ao recarregar mesmo tendo sido salva.
--
-- Fix definitivo: uma linha por (cliente, tipo_documento), garantida pelo
-- banco. O código passa a usar upsert (ver src/lib/cnhAnexo.ts
-- upsertCnhDoc) em vez de insert-ou-update por estado local.

-- 1) Dedupe: mantém a linha mais recente de cada (cliente_fornecedor_id, tipo_documento).
delete from public.clientes_fornecedores_documentos t
where t.id in (
  select id from (
    select id, row_number() over (
      partition by cliente_fornecedor_id, tipo_documento
      order by created_at desc, id desc
    ) as rn
    from public.clientes_fornecedores_documentos
  ) x
  where x.rn > 1
);

-- 2) Garante que não volta a duplicar.
alter table public.clientes_fornecedores_documentos
  add constraint clientes_fornecedores_documentos_cliente_tipo_key
  unique (cliente_fornecedor_id, tipo_documento);
