/**
 * marca / modelo agora são FK (avaliacoes.marca_id -> marcas_motos,
 * avaliacoes.modelo_id -> modelos_motos; idem motos_interesse). As colunas
 * de texto `marca` / `modelo` não existem mais no banco.
 *
 * Padrão de leitura: nos `.select(...)` de `avaliacoes` / `motos_interesse`
 * (inclusive quando embutidos em `atendimentos_motos`) inclua
 * `MARCA_MODELO_SELECT` e passe o resultado por `flattenMarcaModelo`, que
 * devolve `marca` / `modelo` como string — o resto da UI continua lendo
 * `.marca` / `.modelo` sem mudança.
 */

/** Fragmento de select que traz os nomes do catálogo junto da linha. */
export const MARCA_MODELO_SELECT = "marca:marca_id(nome), modelo:modelo_id(nome)";

/** Igual ao anterior, mas garantindo os ids na projeção (telas de edição). */
export const MARCA_MODELO_SELECT_COM_ID = `marca_id, modelo_id, ${MARCA_MODELO_SELECT}`;

type NomeRef = { nome?: string | null } | string | null | undefined;

/** `{ nome }` (embed), string (já achatado) ou null -> string. */
export const nomeMarcaModelo = (v: NomeRef): string =>
  (v && typeof v === "object" ? v.nome ?? "" : v ?? "") as string;

const NESTED_KEYS = [
  "avaliacoes",
  "avaliacao",
  "motos_interesse",
  "moto",
  "moto_avaliacao",
  "avaliacao_venda",
] as const;

/**
 * Achata `marca` / `modelo` (embed `{nome}`) para string, preservando
 * `marca_id` / `modelo_id`. Desce recursivamente em chaves aninhadas comuns
 * (`avaliacoes`, `motos_interesse`, …) e em arrays. Idempotente e null-safe.
 */
export function flattenMarcaModelo<T>(row: T): T {
  if (row == null || typeof row !== "object") return row;
  if (Array.isArray(row)) return row.map((r) => flattenMarcaModelo(r)) as unknown as T;

  const r = { ...(row as Record<string, unknown>) };
  if ("marca" in r || "marca_id" in r) r.marca = nomeMarcaModelo(r.marca as NomeRef);
  if ("modelo" in r || "modelo_id" in r) r.modelo = nomeMarcaModelo(r.modelo as NomeRef);

  for (const k of NESTED_KEYS) {
    if (k in r && r[k] != null && typeof r[k] === "object") {
      r[k] = flattenMarcaModelo(r[k]);
    }
  }
  return r as T;
}

/** Conveniência: `flattenMarcaModelo` sobre um array (ou null). */
export const flattenMarcaModeloList = <T>(rows: T[] | null | undefined): T[] =>
  (rows ?? []).map((r) => flattenMarcaModelo(r));
