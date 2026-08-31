# Guia de cutover — BPM para o banco compartilhado de produção

Projeto alvo: **`gnpkkgygjfxlipqbtybg`** (`https://gnpkkgygjfxlipqbtybg.supabase.co`)
Projeto atual (homolog): `frvclkoljxovzsrnjtlt`

> Contexto: homolog tem **1 usuário** e só dados de teste. Não há migração de dados —
> o BPM entra em produção com as tabelas vazias. Produção já tem 56 usuários, 3
> `user_roles` com `projeto_id` do BPM, e o módulo financeiro/fiscal compartilhado.

## Ordem de execução

### 1. Schema (banco)
```
# revisar primeiro!
psql "<conn prod>" -f supabase/port-prod/01_schema.sql
psql "<conn prod>" -f supabase/port-prod/02_naturezas_seed.sql
```
- `01_schema.sql` roda tudo em UMA transação (`begin`/`commit`). Se falhar, nada é aplicado.
- Alternativa de validação sem persistir: trocar o `commit;` final por `rollback;` e rodar —
  confirma que executa limpo, sem gravar nada.
- Pré-requisito de `02`: produção precisa ter `empresas.bpm=true` nas empresas do BPM
  (4 já existem) + `empresas.uf` + `empresas.regime_tributario` preenchidos, e linhas
  `loja_empresas` com `sistema='motos'` apontando pra essas empresas.

### 2. Código do front
Aplicar `supabase/port-prod/03_code_changes.md`:
- `formas_pagamento` → `formas_pagamento_contrato` (`ContratoDialog.tsx` ×3 + types.ts)
- `observacoes.user_id` → `observacoes.created_by` (`AtendimentoObservacoes.tsx`)
- `src/lib/aprovacao.ts`: `APROVADOR_USER_ID` → UUID real do aprovador BPM em produção
  (usuário master; buscar em `auth.users`/`user_roles` do projeto novo)

### 3. Cliente Supabase (front)
- `src/integrations/supabase/client.ts` — `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`
  para o projeto novo (pegar a anon key em Settings → API do `gnpkkgygjfxlipqbtybg`).
- `.env` / `.env.local` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- `supabase/config.toml` — `project_id = "gnpkkgygjfxlipqbtybg"`.
- No Lovable: reconectar a integração Supabase ao projeto novo.

### 4. Edge Functions (deploy no projeto novo)
```
cd homolog-bpm
npx supabase link --project-ref gnpkkgygjfxlipqbtybg
npx supabase functions deploy emitir-nfe-compra   --project-ref gnpkkgygjfxlipqbtybg
npx supabase functions deploy consulta-veicular   --project-ref gnpkkgygjfxlipqbtybg
npx supabase functions deploy create-user         --project-ref gnpkkgygjfxlipqbtybg
npx supabase functions deploy extrair-dados-cnh   --project-ref gnpkkgygjfxlipqbtybg
npx supabase functions deploy extrair-dados-crlv  --project-ref gnpkkgygjfxlipqbtybg
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` já são injetadas pelo
runtime no projeto novo.

### 5. Secrets das Edge Functions (projeto novo)
```
npx supabase secrets set FOCUS_NFE_AMBIENTE=homologacao --project-ref gnpkkgygjfxlipqbtybg
npx supabase secrets set ANTHROPIC_API_KEY=<...>        --project-ref gnpkkgygjfxlipqbtybg
# RENAVE_MOCK / RENAVE_* se usados pela consulta-veicular
```
Tokens Focus-NFe por empresa ficam na tabela `empresas_focus_config` (não é secret) —
preencher `token_homologacao` / `token_producao` / `habilitado` por `empresa_id` no projeto novo.

### 6. Storage
`01_schema.sql` cria o bucket `moto-fotos` (público) + as 4 policies em `storage.objects`.
Nada a fazer manualmente.

### 7. Dados de apoio a conferir em produção
- [ ] `empresas`: `bpm=true`, `cnpj`, `uf`, `regime_tributario` (CRT correto no painel Focus!)
- [ ] `loja_empresas` com `sistema='motos'` (o de-para loja→empresa)
- [ ] `empresas_focus_config`: linha por empresa BPM com token + `habilitado=true`
- [ ] `user_roles`: usuários BPM com `projeto_id='d007a2c2-7576-4a60-ba1b-c506a9c4fcac'`
      e `app_role` correto (`master` / `gerente` / `vendedor` / `avaliador`)
- [ ] `marcas_motos` / `modelos_motos` populados (já existem as tabelas)
- [ ] Painel Focus-NFe: certificado A1 + NF-e habilitada por CNPJ

### 8. Verificação pós-cutover
- Login no BPM apontando pro projeto novo
- Criar atendimento → avaliação → aprovar → contrato → pós-compra → **emitir NF-e**
  (homologação Focus) → conferir `nfe_entradas` (`operacao`, `ref_externa`), `compromissos`
  (`FIN-D-XXXX`), etapa `NF EMITIDA` concluída
- Venda de moto do estoque + NF-e de venda (etapa `NF-E DE VENDA`)
- Upload de foto (bucket `moto-fotos`)
- Relatórios (as funções `relatorio_*` foram portadas)

## Rollback
- Schema: as tabelas novas são todas exclusivas do BPM; `drop table ... cascade` nelas +
  remover as colunas `*_bpm` de `nfe_entradas` e `centros_custo.empresa_id` reverte 100%
  sem afetar os outros 6 sistemas. As funções portadas idem (`drop function`).
- Guardar um `pg_dump` do schema `public` de produção antes de rodar.
