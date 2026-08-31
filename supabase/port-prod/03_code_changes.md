# Mudanças de código necessárias (port BPM → produção)

O banco de produção compartilhado (`gnpkkgygjfxlipqbtybg`) já tem tabelas com nomes que
colidem com o BPM. O schema portado renomeia/adapta; o código do front precisa acompanhar.

## 1. `formas_pagamento` / `formas_pagamento_contrato` — FEATURE OFF nesta rodada

**Decisão: a seção "Negociação / formas de pagamento" do contrato de venda fica desligada
por enquanto.** A tabela `formas_pagamento_contrato` NÃO foi criada em produção.

Enquanto estiver OFF, `ContratoDialog.tsx` continua chamando `.from('formas_pagamento')` —
em produção isso é a tabela lookup compartilhada, então `.select().eq('contrato_id', ...)`
não quebra (retorna vazio) mas **`.insert({contrato_id, ...})` vai falhar**. Opções:
- (recomendado) esconder o bloco "Adicionar Forma de Pagamento" no `ContratoDialog` até religar.
- ou deixar como está e o erro só aparece se o usuário tentar adicionar uma forma.

Para **religar** depois: criar a tabela (DDL abaixo), reverter o `NULL;` em
`delete_avaliacao_cascade`, e trocar os 3 `.from('formas_pagamento')` →
`.from('formas_pagamento_contrato')` + o bloco em `types.ts`.

```sql
create table public.formas_pagamento_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null,
  valor_total numeric, valor_entrada numeric, financeira text,
  numero_parcelas integer, valor_parcelas numeric, valor_financiado numeric,
  created_at timestamptz not null default now()
);
alter table public.formas_pagamento_contrato enable row level security;
-- + policies espelhando "Acesso/Insert/Update/Delete contratos" via join em contratos->atendimentos_motos
```

Arquivos (quando religar):

| Arquivo | Linhas | Mudança |
|---|---|---|
| `src/components/showroom/ContratoDialog.tsx` | 241, 325, 345 | `.from('formas_pagamento')` → `.from('formas_pagamento_contrato')` |
| `src/integrations/supabase/types.ts` | ~1101 | renomear o bloco `formas_pagamento:` |

Em produção, `formas_pagamento` é uma **tabela lookup compartilhada** (`nome`, `ativo`,
flags `crm/mini/bpm/fin/ofc`). A tabela do BPM (formas de pagamento do contrato de venda,
com `contrato_id`, `valor_financiado`, etc.) foi portada como **`formas_pagamento_contrato`**.

Arquivos a mudar:

| Arquivo | Linhas | Mudança |
|---|---|---|
| `src/components/showroom/ContratoDialog.tsx` | 241, 325, 345 | `supabase.from('formas_pagamento')` → `supabase.from('formas_pagamento_contrato')` |
| `src/integrations/supabase/types.ts` | ~1101 | renomear a chave `formas_pagamento:` do bloco `Tables` para `formas_pagamento_contrato:` (ou regenerar os types do projeto novo) |

Nenhum outro arquivo referencia essa tabela. O estado local do componente
(`formasPagamento`, `FormaPagamento`) não muda.

## 2. `observacoes` — usar `created_by` em vez de `user_id` (OBRIGATÓRIO)

Em produção `observacoes` (compartilhada, genérica por `id_operacao`) tem `created_by uuid`
(FK auth.users) + `tipo text NOT NULL default 'observacao'` — **não tem `user_id`**.

Arquivo: `src/components/showroom/AtendimentoObservacoes.tsx`

- linha ~36: `.select('id, observacao, created_at, user_id')` → `... created_at, created_by')`
- linhas ~40, ~46, ~118: `n.user_id` → `n.created_by`
- linha ~63 (insert): `user_id: user?.id || null` → `created_by: user?.id || null`
- interface local linha ~18: `user_id` → `created_by`

Não precisa mudar o schema de produção (o `tipo` tem default).

> Verificar na revisão: RLS de `observacoes` em produção — se for restritiva (só via join
> com `pedidos_compra`), os inserts do BPM podem ser bloqueados e aí precisa de uma policy
> adicional para `id_operacao` de atendimento.

## 3. Regenerar `src/integrations/supabase/types.ts`

Depois do cutover, os types devem sair do projeto novo (`gnpkkgygjfxlipqbtybg`), que tem
~95 tabelas de 7 sistemas. Regenerar com:

```
npx supabase gen types typescript --project-id gnpkkgygjfxlipqbtybg > src/integrations/supabase/types.ts
```

(ou manter o arquivo enxuto manualmente só com as tabelas que o BPM usa — recomendado,
pra não inflar o bundle de tipos.)

## 4. Nada mais muda

- `nfe_entradas` / `nfe_itens` — mesmas colunas (o port só adiciona as do BPM).
- `compromissos` / `compromissos_parcelas` — idênticas; o número passa a ser `FIN-D-XXXX`
  (trigger de produção) em vez de `CPR-D-XXXX`. O BPM não usa o número em lugar nenhum.
- `plano_contas` / `centros_custo` / IDs fixos — já existem em produção.
- `naturezas_operacao` / `empresas` / `loja_empresas` / `user_roles` / `clientes_fornecedores`
  — schemas idênticos entre homolog e produção.
