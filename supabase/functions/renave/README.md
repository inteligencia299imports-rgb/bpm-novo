# Edge function `renave` — RENAVE-WS (SERPRO)

Registro Nacional de Veículos em Estoque. Fluxo de moto **0km** da concessionária.

## Ambiente / autenticação

- **Homologação:** SERPRO oferece um "cliente padrão de teste" — basta **não enviar
  certificado**. Sem `RENAVE_CERT_PEM`/`RENAVE_KEY_PEM` a função usa `fetch` normal.
  Base default: `https://renave.estaleiro.serpro.gov.br/renave-ws`.
- **Produção:** mTLS com certificado ICP-Brasil e-CNPJ do estabelecimento.
  Setar secrets:
  - `RENAVE_BASE_URL` (host de produção)
  - `RENAVE_CERT_PEM` (certificado PEM)
  - `RENAVE_KEY_PEM` (chave privada PEM)

## Ações (body JSON `{ acao: ... }`)

| ação | o que faz |
|---|---|
| `cliente` | `GET /api/cliente-autenticado` (diagnóstico) |
| `pendentes` | `GET /api/veiculos-zero-km-pendentes-entrada-estoque?chassi=` |
| `entrada` | `{ estoque_moto_nova_id, quilometragem_hodometro, data_entrada_estoque? }` → lê a NF-e de faturamento da montadora (`nfe_entradas` `operacao='compra'`, `xml_raw`), chama `POST /api/entradas-estoque-zero-km` (TEV), grava `renave_id_estoque / renavam / placa / numeroCrv` em `estoque_motos_novas`, e vincula a NF (`POST /api/notas-fiscais` COMPRA). |
| `saida` | `{ estoque_moto_nova_id, atendimento_id }` → exige `renave_id_estoque` e a NF-e de venda 0km autorizada em produção. Resolve o município IBGE do comprador (`GET /api/municipios`), chama `POST /api/notas-fiscais` VENDA + `POST /api/saidas-estoque-veiculo-zero-km` (gera o ATPV-e), busca o PDF (`GET /api/pdf-atpv?chassi=`) e sobe em `moto-fotos/renave/atpv/<id>.pdf`. |
| `atpv-pdf` | `{ chassi }` → rebusca o PDF/XML do ATPV-e. |

## Pendências

- Confirmar CNPJ da 299/Ducati habilitado no RENAVE (homolog e produção).
- Certificado e-CNPJ para produção.
- `cpfOperadorResponsavel` — hoje vem do body (`cpf_operador`), opcional; `user_roles` não guarda CPF.
- A ação `saida` ainda não tem gatilho na UI — plano: etapa no `ProcessoDialog` do pós-venda, liberada após a NF-e de venda de produção autorizada.
