// Cliente minimo da API REST v2 da Focus-NFe para NF-e.
// Auth: HTTP Basic com o token como usuario e senha em branco.

export type FocusAmbiente = 'homologacao' | 'producao';

export function focusBaseUrl(ambiente: FocusAmbiente): string {
  return ambiente === 'producao'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
}

function authHeader(token: string): string {
  return 'Basic ' + btoa(`${token}:`);
}

export interface FocusResposta {
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function emitirNfe(
  base: string,
  token: string,
  ref: string,
  payload: Record<string, unknown>,
): Promise<FocusResposta> {
  const res = await fetch(`${base}/v2/nfe?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { Authorization: authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { httpStatus: res.status, body };
}

export async function consultarNfe(
  base: string,
  token: string,
  ref: string,
): Promise<FocusResposta> {
  const res = await fetch(`${base}/v2/nfe/${encodeURIComponent(ref)}`, {
    method: 'GET',
    headers: { Authorization: authHeader(token) },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { httpStatus: res.status, body };
}

/** Mensagem de erro legivel a partir de uma resposta de erro da Focus. */
export function mensagemErroFocus(body: Record<string, unknown>): string {
  // Rejeicao da SEFAZ (status 'erro_autorizacao'): traz o cStat + motivo.
  const msgSefaz = body.mensagem_sefaz;
  if (typeof msgSefaz === 'string' && msgSefaz) {
    const cStat = body.status_sefaz;
    return (cStat ? `[${cStat}] ` : '') + msgSefaz;
  }
  if (typeof body.mensagem === 'string' && body.mensagem) return body.mensagem;
  const erros = body.erros;
  if (Array.isArray(erros) && erros.length) {
    return erros
      .map((e) => {
        if (typeof e === 'string') return e;
        const o = e as Record<string, unknown>;
        return [o.campo, o.mensagem].filter(Boolean).join(': ');
      })
      .join(' | ');
  }
  if (typeof body.raw === 'string' && body.raw) return body.raw.slice(0, 500);
  return 'Falha desconhecida na emissao da NF-e';
}
