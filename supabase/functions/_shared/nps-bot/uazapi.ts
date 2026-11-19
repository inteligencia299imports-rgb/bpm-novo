// Cliente mínimo da uazapi (https://docs.uazapi.com). Header `token` = token da instância.
// Secrets: UAZAPI_URL (ex.: https://<servidor>.uazapi.com) e UAZAPI_TOKEN.

const baseUrl = () => (Deno.env.get('UAZAPI_URL') ?? '').replace(/\/+$/, '');
const token = () => Deno.env.get('UAZAPI_TOKEN') ?? '';

export interface Enviado {
  messageId: string | null;
  chatid: string | null;
}

async function post(path: string, body: Record<string, unknown>, tokenInstancia = token()): Promise<any> {
  if (!baseUrl() || !tokenInstancia) throw new Error('UAZAPI_URL/UAZAPI_TOKEN não configurados');
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: tokenInstancia },
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

/** O WhatsApp da instância está conectado? (false = caiu, foi desconectado ou bloqueado) */
export async function whatsappConectado(): Promise<{ conectado: boolean; detalhe: string }> {
  try {
    const res = await fetch(`${baseUrl()}/instance/status`, { headers: { token: token() } });
    const j = await res.json().catch(() => null);
    if (!res.ok) return { conectado: false, detalhe: `status HTTP ${res.status}` };
    const st = j?.status ?? {};
    const situacao = j?.instance?.status ?? (typeof j?.status === 'string' ? j.status : '');
    const conectado = situacao === 'connected' && st.connected !== false && st.loggedIn !== false;
    return { conectado, detalhe: `instância: ${situacao || 'desconhecida'}` };
  } catch (e) {
    return { conectado: false, detalhe: `sem resposta da uazapi: ${String(e).slice(0, 150)}` };
  }
}

/** O número tem WhatsApp? */
export async function temWhatsapp(number: string): Promise<boolean> {
  const r = await post('/chat/check', { numbers: [number] });
  return Array.isArray(r) && r[0]?.isInWhatsapp === true;
}

/**
 * Alerta para a equipe. Se UAZAPI_ALERTA_TOKEN existir (outra instância/número), usa ela —
 * necessário quando o número do robô caiu ou foi bloqueado.
 */
export async function enviarAlerta(number: string, text: string) {
  const alt = Deno.env.get('UAZAPI_ALERTA_TOKEN');
  return enviado(await post('/send/text', { number, text, delay: 0 }, alt || token()));
}

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

/**
 * Transcreve um áudio recebido: baixa o MP3 pela uazapi e transcreve na OpenAI (OPENAI_API_KEY).
 * (A transcrição da própria uazapi não volta quando o arquivo já está em cache.)
 * Lança erro com o motivo, para ficar registrado na conversa.
 */
export async function transcreverAudio(messageId: string): Promise<string | null> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  if (!openai) throw new Error('OPENAI_API_KEY não configurada');
  const r = await post('/message/download', { id: messageId, generate_mp3: true });
  if (!r?.fileURL) throw new Error('uazapi não devolveu o arquivo do áudio');
  const audio = await fetch(r.fileURL);
  if (!audio.ok) throw new Error(`download do áudio ${audio.status}`);

  const form = new FormData();
  form.append('file', new Blob([await audio.arrayBuffer()], { type: r.mimetype ?? 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');
  const t = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${openai}` }, body: form,
  });
  const j = await t.json().catch(() => null);
  if (!t.ok) throw new Error(`OpenAI ${t.status}: ${j?.error?.code ?? j?.error?.message ?? 'erro'}`);
  return (j?.text ?? '').trim() || null;
}
