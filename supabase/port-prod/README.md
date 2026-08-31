# Port do módulo BPM (motos) → banco de produção compartilhado

Gerado por introspecção do homolog `frvclkoljxovzsrnjtlt` contra o alvo
`gnpkkgygjfxlipqbtybg` (banco de produção com 7 sistemas: BPM, CRM, HCM, MINI, OFC, PONTO, SISFIN).

**STATUS: aplicado em produção em 2026-08-30. Front-end apontado para `gnpkkgygjfxlipqbtybg` em 2026-08-31.**
- `01_schema.sql` (validado antes via `begin`+`rollback`) e `02_naturezas_seed.sql` — OK.

### Ajustes pós-cutover (2026-08-31)

Refletidos neste `01_schema.sql` + migrations `20260905020000`..`20260905040000`:

1. `motos_novas` → **`estoque_motos_novas`** (tabela + pkey + fkey + índices + trigger + policy).
   Tabela estava vazia; DDL direto em `gnpkkgygjfxlipqbtybg`.
2. `estoque_motos_novas.marca` / `.modelo` (text) → **`marca_id` / `modelo_id`** (uuid NOT NULL,
   FK p/ `marcas_motos` / `modelos_motos`). O sistema externo que alimenta a tabela precisa
   passar os IDs, não os nomes.
3. **`formas_pagamento_contrato` RELIGADA** — tabela + 4 policies (espelho de `contratos`) criadas;
   `delete_avaliacao_cascade` voltou a limpar a tabela (era `NULL; -- OFF`). Os 3 `.from('formas_pagamento')`
   do `ContratoDialog.tsx` passaram a apontar para `formas_pagamento_contrato`. Ver `03_` §1.
4. **Aprovador de compras (produção):** `APROVADOR_USER_ID` em `src/lib/aprovacao.ts` =
   `efab8eff-b62f-4506-83b3-9a66aabb8691` (Alline Borges, master, financeiro@299imports.com.br).
5. **`observacoes`:** código usa `created_by` (não `user_id`) — `AtendimentoObservacoes.tsx`. Ver `03_` §2.
6. **Config front:** `supabase/config.toml`, `src/integrations/supabase/client.ts` e `.env`
   apontando para `gnpkkgygjfxlipqbtybg` / `https://gnpkkgygjfxlipqbtybg.supabase.co`.
7. **`contratos.empresa_id`** (FK `empresas`) — empresa emitente/compradora escolhida na tela de
   NF-e/contrato de compra. Migration `20260905050000`.
8. **`atendimentos_motos.empresa_id`** (FK `empresas`) — empresa do atendimento, escolhida no
   card "Empresa" do form (filtro bidirecional com a loja). Migration `20260905060000`.

## Arquivos

| Arquivo | O quê |
|---|---|
| `01_schema.sql` | 39 funções + 18 tabelas novas + índices + FKs + triggers + RLS/policies + ajustes aditivos em `nfe_entradas`/`centros_custo` + `formas_pagamento_financeiro` + bucket `moto-fotos`. Roda em UMA transação. |
| `02_naturezas_seed.sql` | Naturezas de operação BPM (compra / consignação / venda seminova / venda 0km) por empresa `bpm=true`. Idempotente. Rodar **depois** de `01`. |
| `03_code_changes.md` | Mudanças no front (colisões `formas_pagamento` e `observacoes`). |
| `04_cutover.md` | Passo a passo do cutover (env vars, deploy de functions, secrets, verificação). |

## O que já existe em produção (não é tocado)

- `empresas`, `loja_empresas`, `clientes_fornecedores(_enderecos/_documentos)`, `user_roles`,
  `naturezas_operacao(_regras)`, `nfe_entradas`/`nfe_itens`, `empresas_focus_config`,
  `compromissos(_parcelas)`, `plano_contas`, `centros_custo`, `marcas_motos`, `modelos_motos`
  — schemas idênticos ao homolog (exceto ajustes aditivos listados).
- `set_compromisso_numero`, `set_updated_at`, enum `app_role` — já existem; **não substituir**
  (a `set_compromisso_numero` de produção gera `FIN-D/FIN-R` e é mais completa que a do homolog).
- IDs fixos de `plano_contas` / `centros_custo` do fluxo de compra — já existem.
- 3 linhas de `user_roles` com `projeto_id` do BPM já existem.

## Colisões resolvidas no `01_schema.sql`

| Homolog | Produção | Solução |
|---|---|---|
| `formas_pagamento` (pagamentos do contrato) | tabela lookup compartilhada | portada como **`formas_pagamento_contrato`** — exige mudança de código (`03_`) |
| `observacoes` (`user_id`) | `observacoes` (`created_by` + `tipo`) | usar `created_by` no código (`03_`) — sem mudança de schema |

## Bugs pré-existentes do homolog já corrigidos na geração

- `delete_atendimento_cascade` / `delete_avaliacao_cascade` referenciavam `public.estoque`
  (renomeada p/ `estoque_motos`) e `public.observacoes_processo` (nunca existiu) → corrigido
  no `01_schema.sql`.

## Validação sugerida (sem persistir)

Trocar o `commit;` final de `01_schema.sql` por `rollback;` e rodar contra produção:
confirma que executa 100% limpo, adquire/solta os locks, e **não grava nada**. Depois
reverter pra `commit;` e rodar de verdade.

## Rollback real

Todas as tabelas novas são exclusivas do BPM. Reverter =
`drop table <as 18> cascade` + `drop function <as 39>` + remover colunas `*_bpm` de
`nfe_entradas` + `centros_custo.empresa_id` + `drop table formas_pagamento_financeiro,
formas_pagamento_contrato`. Nenhum dos outros 6 sistemas é afetado. Fazer `pg_dump`
do schema `public` antes.
