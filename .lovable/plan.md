

## Diagnóstico: Checks do Pós-Compra não salvam

### Problema identificado

No `PosCompraProcessoDialog.tsx`, a função `handleSave` (linha 190-192) executa o `upsert` dos checks mas **não verifica o resultado para erros**. Se a operação falhar (por RLS, constraint ausente, etc.), o código continua normalmente e exibe "Processo salvo com sucesso!" — dando a falsa impressão de que salvou.

```text
Fluxo atual:
  upsert checks → (erro silenciado) → atualiza status → toast "sucesso" ✗

Fluxo correto:
  upsert checks → verifica erro → se ok, atualiza status → toast "sucesso" ✓
                               → se erro, toast "erro" e para ✓
```

### Causa provável

No seu banco Supabase externo, pode faltar:
1. A **unique constraint** em `(avaliacao_id, etapa)` na tabela `pos_compra_processos` — necessária para o `upsert` funcionar com `onConflict`
2. Ou as **políticas RLS** podem estar bloqueando a inserção/atualização

### Plano de implementação

**1. Corrigir tratamento de erros no `handleSave`** (`PosCompraProcessoDialog.tsx`)
- Capturar o `{ error }` retornado pelo `upsert`
- Se houver erro, exibir toast com a mensagem e interromper a execução
- Aplicar o mesmo tratamento ao `update` da avaliação

**2. Fornecer script SQL de correção**
- Script para criar a unique constraint caso não exista no banco externo
- Script para verificar/criar as políticas RLS necessárias

### Seção técnica

Arquivo modificado: `src/components/pos-compra/PosCompraProcessoDialog.tsx`

Mudança principal na função `handleSave` (linhas 190-215):
- Desestruturar `{ error }` do upsert e do update
- Adicionar `if (error) { toast.error(...); return; }` após cada operação
- Manter o fluxo de status history e toast de sucesso apenas se ambas operações tiverem sucesso

