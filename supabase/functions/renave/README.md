# Edge function `renave` — RENAVE-WS (SERPRO)

Registro Nacional de Veículos em Estoque. Fluxo de moto **0km** da concessionária.

## Ambiente / autenticação

**⚠️ "estaleiro" é o nome da plataforma do SERPRO, não é sinônimo de
homologação — os dois ambientes vivem sob esse domínio.** O que diferencia é
o prefixo `hom.`. Confirmado em 2026-09-14 batendo em `/api/cliente-autenticado`
sem certificado:
- `https://hom.renave.estaleiro.serpro.gov.br/renave-ws` → **200 OK**,
  `"nome":"Estabelecimento padrão de teste"` → **isso é homologação**.
- `https://renave.estaleiro.serpro.gov.br/renave-ws` (sem `hom.`) → **401
  Unauthorized** (exige mTLS) → **isso é produção**.

O código teve isso **invertido** desde a implementação original —
`DEFAULT_BASE` apontava pro host de produção (sem `hom.`), tratado como se
fosse o default de homologação. Corrigido: `DEFAULT_BASE` agora é o host
`hom.` de verdade. Sem dano até aqui — produção sempre exigiu certificado
(401 sem ele), e nenhum certificado esteve configurado até 2026-09-14.

- **Homologação (default):** SERPRO oferece um "cliente padrão de teste" —
  basta **não enviar certificado**. Base:
  `https://hom.renave.estaleiro.serpro.gov.br/renave-ws`. Aceita chassi
  fictício/de exemplo apenas — um chassi real de moto comprada de verdade
  é rejeitado com "Chassi informado não está cadastrado" (confirmado
  2026-09-14; a base nacional de veículos só existe em produção).
- **Produção:** mTLS com certificado ICP-Brasil e-CNPJ do estabelecimento.
  Setar `RENAVE_BASE_URL` = `https://renave.estaleiro.serpro.gov.br/renave-ws`
  (sem `hom.` — é o host de produção, apesar do nome "estaleiro") — **em
  produção desde 2026-09-14**.

### Múltiplos estabelecimentos (CNPJs)

A SERPRO identifica o "estabelecimento solicitante" pelo **CNPJ do
certificado mTLS** usado na chamada — não por um campo no payload. Usar o
certificado de um CNPJ pra operar uma moto de outro CNPJ gera a rejeição
real *"CNPJ do estabelecimento solicitante é divergente do CNPJ informado
pela montadora no pré-cadastro"* (achado 2026-09-14). Como o grupo opera
com vários CNPJs (cada um com seu próprio e-CNPJ), cada um precisa do
**próprio trio de secrets**:

| Slot | CNPJ (texto, não sensível) | Certificado (PEM) | Chave (PEM) |
|---|---|---|---|
| Principal (1º CNPJ, já configurado) | `RENAVE_CNPJ` | `RENAVE_CERT_PEM` | `RENAVE_KEY_PEM` |
| 2º CNPJ | `RENAVE_CNPJ_2` | `RENAVE_CERT_PEM_2` | `RENAVE_KEY_PEM_2` |
| 3º CNPJ | `RENAVE_CNPJ_3` | `RENAVE_CERT_PEM_3` | `RENAVE_KEY_PEM_3` |
| 4º CNPJ | `RENAVE_CNPJ_4` | `RENAVE_CERT_PEM_4` | `RENAVE_KEY_PEM_4` |

(suporta até 20 slots — ver `MAX_CNPJ_SLOTS` em `renave.ts`.) `index.ts`
resolve o CNPJ certo automaticamente a partir de
`estoque_motos_novas.empresa_id` → `empresas.cnpj`, e `buildClient()` (em
`renave.ts`) escolhe o par de certificado que bate com esse CNPJ. **Um
CNPJ sem par configurado faz a chamada sair sem certificado** — a SERPRO
rejeita com 401 em produção (falha segura: nunca usa por engano o
certificado de outro CNPJ).

Slots configurados hoje:

| Slot | Empresa | CNPJ | Validade | Status em produção |
|---|---|---|---|---|
| 1 (principal) | FAG | 49.580.035/0001-36 | 18/03/2027 | ✅ funcionando |
| 2 | Florianópolis (Intercontinental Motorsport) | 05.564.902/0001-74 | — | ❌ 401 "No message available" — CNPJ provavelmente não credenciado na SERPRO pro RENAVE-WS (ver Pendências) |
| 3 | Porto Alegre (Intercontinental Motorsport) | 05.564.902/0002-55 | 26/11/2026 | não testado ainda contra a SERPRO — o secret levou 2 tentativas até gravar um PEM válido (ver achado abaixo), corrigido em 2026-09-15 |

**Pra adicionar um novo CNPJ:** conseguir o certificado e-CNPJ A1 (.pfx +
senha de importação) daquele estabelecimento, converter pra PEM
(cert+chave separados, sem as linhas "Bag Attributes" que o `openssl
pkcs12` adiciona — só o bloco `-----BEGIN...-----`/`-----END...-----`) e
setar os 3 secrets do próximo slot livre (`RENAVE_CNPJ_N` só o CNPJ em
dígitos; `RENAVE_CERT_PEM_N`/`RENAVE_KEY_PEM_N` os PEMs). O certificado
`.pfx` e a senha de importação **nunca** vão pro código nem pra este
repositório — só os secrets já convertidos, e nenhum arquivo temporário
fica no disco depois da conversão.

**Achado 2026-09-15 (slot 3, Porto Alegre) — como gravar o PEM sem
quebrar:**
1. **Sempre remover as linhas "Bag Attributes"/`subject=`/`issuer=` que o
   `openssl pkcs12` imprime antes do bloco PEM** — `Deno.createHttpClient`
   falha com `"No certificates found in certificate data"` se sobrar
   qualquer coisa antes de `-----BEGIN CERTIFICATE-----`. Extrair assim
   evita isso desde o início: `openssl pkcs12 -in cert.pfx -legacy
   -clcerts -nokeys -passin env:PFX_PASS | sed -n
   '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' >
   cert.pem` (idem `-nocerts -nodes` + `PRIVATE KEY` pra `key.pem`). O
   `-legacy` é necessário pra certificados ICP-Brasil mais antigos, que
   usam RC2-40-CBC (OpenSSL 3.x não decodifica sem ele — erro *"digital
   envelope routines: unsupported"*).
2. **Nunca gravar o PEM via `--env-file` com quebras de linha escapadas
   como `\n` literal** (ex.: `awk 'BEGIN{ORS="\\n"}1'` num arquivo
   `.env`) — o secret grava o texto `\n` ao pé da letra em vez de quebra
   de linha real, e o parser de certificado do Deno falha com `"Unable
   to decode certificate"` (acha o `-----BEGIN...-----` mas não
   consegue decodificar o base64 do meio, cheio de `\n` literais no
   lugar das quebras). **O jeito que funciona**: passar o valor direto
   como argumento `NAME=VALUE` do próprio `supabase secrets set`, usando
   `$(cat arquivo.pem)` pra preservar as quebras de linha reais do
   arquivo — ex.: `supabase secrets set --project-ref <ref>
   "RENAVE_CERT_PEM_N=$(cat cert.pem)" "RENAVE_KEY_PEM_N=$(cat
   key.pem)"` (sem `--env-file`).

## Ações (body JSON `{ acao: ... }`)

| ação | o que faz |
|---|---|
| `cliente` | `GET /api/cliente-autenticado` (diagnóstico) |
| `pendentes` | `GET /api/veiculos-zero-km-pendentes-entrada-estoque?chassi=` |
| `entrada` | `{ estoque_moto_nova_id, quilometragem_hodometro, data_entrada_estoque? }` → lê a NF-e de faturamento da montadora (`nfe_entradas` `operacao='compra'`, `xml_raw`), chama `POST /api/entradas-estoque-zero-km` (TEV), grava `renave_id_estoque / renavam / placa / numeroCrv` em `estoque_motos_novas`, e vincula a NF (`POST /api/notas-fiscais` COMPRA). |
| `saida` | `{ estoque_moto_nova_id, atendimento_id }` → exige `renave_id_estoque` e a NF-e de venda 0km autorizada em produção. Resolve o município IBGE do comprador (`GET /api/municipios`), chama `POST /api/notas-fiscais` VENDA + `POST /api/saidas-estoque-veiculo-zero-km` (gera o ATPV-e), busca o PDF (`GET /api/pdf-atpv?chassi=`) e sobe em `moto-fotos/renave/atpv/ATPVE - <chassi>.pdf`. |
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
fluxos. As URLs completas da tabela usam o host **de produção**
(`https://renave.estaleiro.serpro.gov.br/renave-ws`, sem `hom.` — ver
"Ambiente/autenticação" acima) — os paths abaixo, porém, são os mesmos nos
dois ambientes; só o host muda (`hom.` pra homologação). Cruzei contra o que
já está implementado em `renave.ts` (coluna "Uso") — os demais **não foram
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

- **Pré-cadastro da Ducati com CNPJ divergente** (achado real 2026-09-14,
  produção): tentativa de entrada rejeitada com "CNPJ do estabelecimento
  solicitante é divergente do CNPJ informado pela montadora no
  pré-cadastro" — a NF-e de compra da Ducati já cita a FAG corretamente
  como destinatária, então o problema é externo (pré-cadastro da Ducati no
  RENAVE, não nosso código/dado). Resolução depende de contato
  FAG↔Ducati/suporte SERPRO pra corrigir o CNPJ pré-cadastrado daquele
  chassi.
- Endpoints de **cancelamento** (entrada/saída 0km — códigos 24 e 50 no
  catálogo acima) ainda não implementados em `renave.ts`/`index.ts`. Se uma
  entrada ou saída for aceita com dado errado, hoje não há como desfazer
  pelo nosso sistema — só via canal direto com a SERPRO/despachante.
- **Assinatura do vendedor no ATPV** (catálogo acima, código 51 — `POST /api/atpv-assinatura-vendedor`): a doc do SERPRO lista esse passo separado da geração do ATPV-e (`saidas-estoque-veiculo-zero-km`, código 28). Hoje a ação `saida` não chama esse endpoint — precisa confirmar se ele é obrigatório no fluxo (a saída pode ficar pendente de assinatura antes do ATPV-e sair definitivo) antes de considerar a `saida` completa.
- **Certificado do CNPJ 05.564.902/0001-74 (Florianópolis/Intercontinental
  Motorsport, slot 2) recebe 401 "No message available" em produção**
  (achado real 2026-09-15, chassi `95V1X00AASM000382`, endpoint
  `/api/entradas-estoque-zero-km`) — cert/key conferidos (par bate,
  configurados como `RENAVE_CERT_PEM_2`/`RENAVE_KEY_PEM_2`/`RENAVE_CNPJ_2`),
  a chamada sai com mTLS (não é fallback sem certificado). 401 genérico sem
  corpo de erro é característico de CNPJ ainda não credenciado pra esse
  serviço no lado da SERPRO (diferente do cert do FAG, slot 1, que já
  funciona). Resolução depende de confirmar com a SERPRO se esse e-CNPJ está
  habilitado pro RENAVE-WS em produção. Adicionada a ação `cliente` com
  `empresa_id` opcional (`GET /api/cliente-autenticado` testando o cert de
  uma empresa específica) pra isolar esse tipo de problema sem depender do
  payload real de entrada/saída.
