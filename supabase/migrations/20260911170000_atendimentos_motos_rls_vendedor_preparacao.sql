-- Restaura a visibilidade de atendimentos com moto em preparação para
-- QUALQUER vendedor — não só o vendedor_id do próprio atendimento.
--
-- Causa: a política "Vendedor vê atendimentos preparacao" existia desde
-- 2026-03-26 na tabela antiga `atendimentos` (has_role 'vendedor' +
-- atendimento_has_avaliacao_preparacao(id)), mas foi DROPADA na consolidação
-- para `atendimentos_motos` (20260826152724_...sql, linha 234) e nunca
-- recriada — a nova política "Acesso atendimentos" só libera SELECT pro
-- vendedor_id do próprio atendimento (ou gerente/master). Preparação é uma
-- etapa compartilhada (qualquer vendedor prepara qualquer moto do estoque),
-- então PreparacaoTab.tsx (`atendimentos_motos!inner(...)` embutido na
-- query de avaliacoes) sumia pra vendedores que não eram o vendedor_id
-- original da avaliação/atendimento de aquisição.
--
-- A função `atendimento_has_avaliacao_preparacao` já existe no banco (não
-- foi dropada, só ficou sem política usando ela) — só recria a política.

create policy "Vendedor ve atendimentos preparacao" on public.atendimentos_motos
  for select to authenticated
  using (
    public.has_app_role(auth.uid(), 'vendedor'::app_role)
    and public.atendimento_has_avaliacao_preparacao(id)
  );
