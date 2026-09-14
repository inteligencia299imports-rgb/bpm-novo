# Edge function `renave` — RENAVE-WS (SERPRO)

Registro Nacional de Veículos em Estoque. Fluxo de moto **0km** da concessionária.

## Ambiente / autenticação

- **Homologação:** SERPRO oferece um "cliente padrão de teste" — basta **não enviar
  certificado**. Base default: `https://renave.estaleiro.serpro.gov.br/renave-ws`.
- **Produção:** mTLS com certificado ICP-Brasil e-CNPJ do estabelecimento.
  Setar secrets:
  - `RENAVE_BASE_URL` (host de produção)
  - `RENAVE_CERT_PEM` (certificado PEM)
  - `RENAVE_KEY_PEM` (chave privada PEM)
- **O certificado só é usado quando `RENAVE_BASE_URL` está setado** (produção) —
  `RENAVE_CERT_PEM`/`RENAVE_KEY_PEM` podem estar configurados de antemão sem
  "ligar" produção sozinhos; enquanto `RENAVE_BASE_URL` não existir, a função
  continua chamando o estaleiro (homolog) sem certificado, mesmo com o par
  cert/key já presente. Evita usar certificado real de produção contra o
  estaleiro por engano. Certificado atual: e-CNPJ A1 da **FAG** (CNPJ
  49.580.035/0001-36), válido até 18/03/2027 — configurado em 2026-09-14.

## Ações (body JSON `{ acao: ... }`)

| ação | o que faz |
|---|---|
| `cliente` | `GET /api/cliente-autenticado` (diagnóstico) |
| `pendentes` | `GET /api/veiculos-zero-km-pendentes-entrada-estoque?chassi=` |
| `entrada` | `{ estoque_moto_nova_id, quilometragem_hodometro, data_entrada_estoque? }` → lê a NF-e de faturamento da montadora (`nfe_entradas` `operacao='compra'`, `xml_raw`), chama `POST /api/entradas-estoque-zero-km` (TEV), grava `renave_id_estoque / renavam / placa / numeroCrv` em `estoque_motos_novas`, e vincula a NF (`POST /api/notas-fiscais` COMPRA). |
| `saida` | `{ estoque_moto_nova_id, atendimento_id }` → exige `renave_id_estoque` e a NF-e de venda 0km autorizada em produção. Resolve o município IBGE do comprador (`GET /api/municipios`), chama `POST /api/notas-fiscais` VENDA + `POST /api/saidas-estoque-veiculo-zero-km` (gera o ATPV-e), busca o PDF (`GET /api/pdf-atpv?chassi=`) e sobe em `moto-fotos/renave/atpv/<id>.pdf`. |
| `atpv-pdf` | `{ chassi }` → rebusca o PDF/XML do ATPV-e. |

## Log/auditoria — `renave_chamadas`

Toda chamada HTTP feita ao RENAVE-WS é gravada em `renave_chamadas` (migration
`20260914150000_renave_chamadas.sql`), uma linha por chamada — uma ação da UI
pode gerar várias (ex.: `saida` chama municípios + notas-fiscais + saída de
estoque + PDF do ATPV → 4 linhas, todas com `operacao='saida'`).

Colunas: `chassi`, `estoque_moto_nova_id`, `operacao` (a ação: cliente/
pendentes/entrada/saida/atpv-pdf), `endpoint`, `metodo`, `request_body`,
`status_http`, `sucesso`, `response_body`, `erro_mensagem`, `usuario_id`,
`created_at`. RLS: leitura livre pra autenticado, escrita só via service role
(edge function) — não editável/apagável pela UI.

Implementado em `renave.ts`: cada função exportada aceita um `ctx?:
RenaveLogCtx` opcional (`{ admin, chassi, estoqueMotoNovaId, operacao,
usuarioId }`) como último parâmetro — `index.ts` monta esse `ctx` uma vez por
ação (assim que o chassi é conhecido) e passa pra cada chamada RENAVE dentro
daquele bloco. Logar é best-effort (try/catch) — uma falha ao gravar o log
nunca derruba a chamada real ao RENAVE.

Consulta rápida do histórico de um veículo: `select * from renave_chamadas
where chassi = '...' order by created_at desc;`

## Catálogo de endpoints RENAVE-WS (grupo Estabelecimento)

Tabela oficial do SERPRO (RENAVE-WS, grupo "Estabelecimento" — CE 20),
recebida do usuário em 2026-09-14, pra referência ao implementar novos
fluxos. Todos os paths abaixo são relativos a `RENAVE_BASE_URL` (default
`https://renave.estaleiro.serpro.gov.br/renave-ws`). Cruzei contra o que já
está implementado em `renave.ts` (coluna "Uso") — os demais **não foram
verificados contra a doc oficial do SERPRO nem testados**; conferir antes de
implementar (a transcrição de tabela em imagem é propensa a erro de
digitação em paths/query params).

### Entrada/saída de estoque (genérico)

| Código | Descrição | Método | Path | Uso |
|---|---|---|---|---|
| 1 | Consultar aptidão entrada/saída | GET | `/api/aptidao-veiculo-estoque?numeroCrv={numeroCrv}&placa={placa}&renavam={renavam}&tipoCrv={tipoCrv}` | — |
| 2 | Solicitar entrada de veículo em estoque | POST | `/api/solicitacoes-entrada-estoque` | — |
| 3 | Imprimir Termo de Entrada | GET | `/api/estoques/{idEstoque}/termo-entrada-estoque` | — |
| 7 | Solicitar saída de veículo de estoque | POST | `/api/solicitacoes-saida-estoque` | — |
| 8 | Solicita Termo de Saída | GET | `/api/estoques/{idEstoque}/termo-saida-estoque` | — |
| 10 | Solicitar cancelamento de entrada de estoque | POST | `/api/solicitacoes-cancelamento-entrada-estoque` | — |
| 11 | Solicitar cancelamento de saída do estoque | POST | `/api/solicitacoes-cancelamento-saida-estoque` | — |
| 20 | Consultar registro de estoque | GET | `/api/estoques?placa={placaVeiculo}` | — (hoje `consultarEstoque` usa `/api/estoques/{id}` por id) |
| 57 | Solicitar entrada de veículo próprio em estoque | POST | `/api/solicitacoes-entrada-estoque-veiculo-proprio` | — (candidato pra seminova, fora do escopo 0km atual) |
| 58 | Solicitar transferência de estoque entre estabelecimentos | POST | `/api/solicitacoes-transferencia-entre-estabelecimentos` | — |
| 59 | Solicitar transferência de estoque entre filiais | POST | `/api/solicitacoes-transferencia-entre-filiais` | — |
| 64 | Sair com veículo inacabado de estoque | POST | `/api/saidas-estoque-veiculo-inacabado` | — |
| 65 | Cancelar saída de veículo inacabado de estoque | POST | `/api/cancelamentos-saidas-estoque-veiculo-inacabado` | — |
| 66 | Consultar Veículo | GET | `/api/veiculos` | — |

### Notas fiscais / CRV / municípios

| Código | Descrição | Método | Path | Uso |
|---|---|---|---|---|
| 4 | Enviar nota fiscal de compra ou venda de veículo | POST | `/api/notas-fiscais` | ✅ `enviarNotaFiscal` |
| 5 | PDF com código de segurança do último CRV | GET | `/api/crlve/{placaVeiculo}/{renavamVeiculo}/pdf-codigo-seguranca-crv` | — |
| 6 | PDF do último CRVe do veículo | GET | `/api/crlve/{placaVeiculo}/{renavamVeiculo}` | — |
| 13 | Consultar municípios (todos) | GET | `/api/municipios` | ✅ `municipios` |
| 14 | Consultar municípios por nome/UF | GET | `/api/municipios?nome={nome}&uf={uf}` | ✅ `municipios` |
| 49 | Consultar dados do cliente autenticado | GET | `/api/cliente-autenticado` | ✅ `clienteAutenticado` |

### ATPV / transferências

| Código | Descrição | Método | Path | Uso |
|---|---|---|---|---|
| 15 | PDF do ATPV por placa/renavam | GET | `/api/pdf-atpv/{placaVeiculo}/{renavamVeiculo}` | — |
| 16 | ATPVe por id | GET | `/api/atpv/{idAtpv}` | — |
| 51 | Enviar assinatura do vendedor no ATPV | POST | `/api/atpv-assinatura-vendedor` | — (**candidato a etapa faltante** no fluxo `saida` — ver Pendências) |
| 52 | Consultar autorizações de transferência | GET | `/api/autorizacoes-transferencias` | — |
| 53 | Autorizar transferência p/ outro estabelecimento | POST | `/api/autorizacoes-transferencias` | — |
| 54 | Consultar assinaturas de ATPV | GET | `/api/atpv-assinaturas/{placa}/{renavam}/ultimo` | — |
| 55 | Cancelar autorização de transferência | POST | `/api/cancelamentos-autorizacoes-transferencias` | — |
| 56 | PDF do ATPV por chassi | GET | `/api/pdf-atpv?chassi={chassi}` | ✅ `pdfAtpvPorChassi` |
| 61 | Transferir estoque vindo de ITE | POST | `/api/transferencias-estoque-vindo-de-ite` | — |
| 62 | Autorizar transferência de estoque para ITE | POST | `/api/autorizacoes-transferencias-para-ite` | — |
| 63 | Cancelar autorização de transferência para ITE | POST | `/api/cancelamentos-autorizacoes-transferencias-para-ite` | — |

### Zero km (fluxo atual da concessionária)

| Código | Descrição | Método | Path | Uso |
|---|---|---|---|---|
| 22 | Autorizações de transferência (0km) | POST | `/api/autorizacoes-transferencias-veiculo-zero-km` | — |
| 23 | Cancelar autorização de transferência (0km) | POST | `/api/cancelamentos-autorizacoes-transferencias-veiculo-zero-km` | — |
| 24 | Cancelar saída de estoque (0km) | POST | `/api/cancelamentos-saida-estoque-zero-km` | — |
| 25 | Devolução à montadora (0km) | POST | `/api/devolucoes-montadora-veiculo-zero-km` | — |
| 26 | Entrada em estoque (0km) | POST | `/api/entradas-estoque-zero-km` | ✅ `entrarEstoqueZeroKm` |
| 27 | Rejeições (0km) | POST | `/api/rejeicoes-zero-km` | — |
| 28 | Saída de estoque (0km) | POST | `/api/saidas-estoque-veiculo-zero-km` | ✅ `sairEstoqueZeroKm` |
| 29 | Transferência entre estabelecimentos (0km) | POST | `/api/transferencias-entre-estabelecimentos-veiculo-zero-km` | — |
| 30 | Veículos 0km pendentes de entrada em estoque | GET | `/api/veiculos-zero-km-pendentes-entrada-estoque` | ✅ `pendentesEntrada` |
| 31 / 48 | Download PDF ATPVe (0km, por chassi / geral) | GET | `/api/pdf-atpv?chassi={chassi}` / `/api/pdf-atpv` | (mesmo path de `pdfAtpvPorChassi`) |
| 50 | Cancelar entrada de estoque (0km) | GET | `/api/cancelamentos-entrada-estoque-zero-km` | — |
| 60 | Cancelar rejeição (0km) | POST | `/api/cancelamentos-rejeicoes-veiculo-zero-km` | — |
| 67 | Consultar Veículo Entrega | GET | `/api/entregas-veiculo-zero-km` | — |
| 68 | Realizar Entrega Veículo | POST | `/api/entregas-veiculo-zero-km/realizacao` | — |
| 69 | Cancelar Entrega Veículo | POST | `/api/entregas-veiculo-zero-km/cancelamento` | — |
| 80 | Saída (0km) com benefício Renovar | POST | `/api/saidas-estoque-veiculo-zero-km-renovar` | — |
| 81 | Saída de inacabado com benefício Renovar | POST | `/api/saidas-estoque-inacabado-renovar` | — |

### Montadora (grupo separado — não é o nosso papel, fica pra referência)

| Código | Descrição | Método | Path |
|---|---|---|---|
| 70 | Consultar estoque Montadora | GET | `/api/montadora/estoques` |
| 71 | Download PDF ATPV-e Montadora | GET | `/api/montadora/pdf-atpv` |
| 72 | Entrada de 0km em estoque Montadora | POST | `/api/montadora/entradas-estoque-zero-km` |
| 73 | Cancelar entrada de estoque (0km) Montadora | POST | `/api/montadora/cancelamentos-entrada-estoque-zero-km` |
| 74 | Saída 0km estoque (Venda Direta) Montadora | POST | `/api/montadora/saidas-estoque-veiculo-zero-km` |
| 75 | Cancelar saída de estoque (0km) Montadora | POST | `/api/montadora/cancelamentos-saida-estoque-zero-km` |
| 76 | Veículos 0km pendentes de entrada Montadora | GET | `/api/montadora/veiculos-zero-km-pendentes-entradaestoque` |
| 77 | Cliente autenticado Montadora | GET | `/api/montadora/cliente-autenticado` |
| 78 | Municípios Montadora | GET | `/api/montadora/municipios` |
| 79 | Entregas Montadora | GET | `/api/montadora/entregas-veiculo-zero-km` |

## Pendências

- Confirmar CNPJ da 299/Ducati habilitado no RENAVE (homolog e produção).
- Certificado e-CNPJ para produção.
- `cpfOperadorResponsavel` — hoje vem do body (`cpf_operador`), opcional; `user_roles` não guarda CPF.
- A ação `saida` ainda não tem gatilho na UI — plano: etapa no `ProcessoDialog` do pós-venda, liberada após a NF-e de venda de produção autorizada.
- **Assinatura do vendedor no ATPV** (catálogo acima, código 51 — `POST /api/atpv-assinatura-vendedor`): a doc do SERPRO lista esse passo separado da geração do ATPV-e (`saidas-estoque-veiculo-zero-km`, código 28). Hoje a ação `saida` não chama esse endpoint — precisa confirmar se ele é obrigatório no fluxo (a saída pode ficar pendente de assinatura antes do ATPV-e sair definitivo) antes de considerar a `saida` completa. Só verificável com o certificado/ambiente de homolog rodando de verdade.
