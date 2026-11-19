// Cliente mínimo da uazapi (https://docs.uazapi.com). Header `token` = token da instância.
// Secrets: UAZAPI_URL (ex.: https://<servidor>.uazapi.com) e UAZAPI_TOKEN.

const baseUrl = () => (Deno.env.get('UAZAPI_URL') ?? '').replace(/\/+$/, '');
const token = () => Deno.env.get('UAZAPI_TOKEN') ?? '';

export interface Enviado {
  messageId: string | null;
  chatid: string | null;
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  if (!baseUrl() || !token()) throw new Error('UAZAPI_URL/UAZAPI_TOKEN não configurados');
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: token() },
    body: JSON.stringify(body),
  });
  const texto = await res.text();
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) throw new Error(`uazapi ${path} ${res.status}: ${texto.slice(0, 300)}`);
  return json;
}

const enviado = (r: any): Enviado => ({
  messageId: r?.messageid ?? r?.id ?? r?.message?.messageid ?? null,
  chatid: r?.chatid ?? r?.message?.chatid ?? null,
});

/** Atraso aleatório (ms) que a uazapi mostra como "digitando..." antes de enviar. */
export const digitando = (min = 1200, max = 2800) => Math.floor(min + Math.random() * (max - min));

export async function enviarTexto(number: string, text: string, opts: { delay?: number; linkPreview?: boolean } = {}) {
  return enviado(await post('/send/text', {
    number, text, delay: opts.delay ?? digitando(), linkPreview: opts.linkPreview ?? false,
  }));
}

/** Botões de resposta. `opcoes` = [{texto, id}]. */
export async function enviarBotoes(number: string, text: string, opcoes: { texto: string; id: string }[], delay?: number) {
  return enviado(await post('/send/menu', {
    number,
    type: 'button',
    text,
    choices: opcoes.map((o) => `${o.texto}|${o.id}`),
    delay: delay ?? digitando(),
  }));
}

/** Lista (usada na nota de 0 a 10, que passa do limite de botões). */
export async function enviarLista(
  number: string, text: string, botao: string, secao: string,
  opcoes: { texto: string; id: string }[], delay?: number,
) {
  return enviado(await post('/send/menu', {
    number,
    type: 'list',
    text,
    listButton: botao,
    choices: [`[${secao}]`, ...opcoes.map((o) => `${o.texto}|${o.id}`)],
    delay: delay ?? digitando(),
  }));
}

/** Transcreve um áudio recebido. Usa OPENAI_API_KEY se existir (senão, a chave configurada na instância). */
export async function transcreverAudio(messageId: string): Promise<string | null> {
  const body: Record<string, unknown> = { id: messageId, transcribe: true, generate_mp3: true };
  const openai = Deno.env.get('OPENAI_API_KEY');
  if (openai) body.openai_apikey = openai;
  const r = await post('/message/download', body);
  const t = (r?.transcription ?? '').trim();
  return t || null;
}
