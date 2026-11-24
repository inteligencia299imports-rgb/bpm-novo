// deno-lint-ignore-file no-explicit-any
// WhatsApp do agente de dados (número do Cérebro, instância "cerebro" da uazapi).
// Só fala com o número de quem perguntou: o destino nunca vem do modelo de IA.

const baseUrl = () => (Deno.env.get('UAZAPI_URL') ?? '').replace(/\/+$/, '');
const token = () => Deno.env.get('AGENTE_UAZAPI_TOKEN') ?? Deno.env.get('UAZAPI_ALERTA_TOKEN') ?? '';

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  if (!baseUrl() || !token()) throw new Error('UAZAPI_URL/token do agente não configurados');
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

/** Limite prático de uma mensagem de WhatsApp: textos maiores vão em partes. */
const MAX_TEXTO = 3800;

function partes(texto: string): string[] {
  const out: string[] = [];
  let resto = texto.trim();
  while (resto.length > MAX_TEXTO) {
    let corte = resto.lastIndexOf('\n', MAX_TEXTO);
    if (corte < MAX_TEXTO * 0.5) corte = resto.lastIndexOf(' ', MAX_TEXTO);
    if (corte < 1) corte = MAX_TEXTO;
    out.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) out.push(resto);
  return out;
}

/** Cliente preso ao número de quem perguntou. */
export function conversaCom(numero: string) {
  return {
    numero,
    async texto(t: string) {
      for (const p of partes(t)) await post('/send/text', { number: numero, text: p, delay: 800, linkPreview: false });
    },
    /** Até 3 botões de resposta rápida. */
    async botoes(t: string, opcoes: string[]) {
      const ops = opcoes.map((o) => o.trim()).filter(Boolean).slice(0, 3);
      if (!ops.length) return this.texto(t);
      // Texto longo: as primeiras partes vão como texto e a última leva os botões.
      const ps = partes(t);
      const corpo = ps.pop() ?? '';
      for (const p of ps) await this.texto(p);
      await post('/send/menu', {
        number: numero,
        type: 'button',
        text: corpo,
        choices: ops.map((o, i) => `${o.slice(0, 20)}|op${i + 1}`),
        delay: 800,
      });
    },
    /** Documento (PDF ou Excel) em base64. */
    async documento(nome: string, mimetype: string, base64: string, legenda?: string) {
      await post('/send/media', {
        number: numero,
        type: 'document',
        file: `data:${mimetype};base64,${base64}`,
        docName: nome,
        text: legenda ?? '',
      });
    },
    async digitando() {
      try { await post('/message/presence', { number: numero, presence: 'composing', delay: 3000 }); } catch { /* opcional */ }
    },
  };
}

export type Conversa = ReturnType<typeof conversaCom>;

/** Baixa a mídia de uma mensagem recebida (imagem, documento, áudio). */
export async function baixarMidia(messageId: string, mp3 = false): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimetype: string }> {
  const r = await post('/message/download', { id: messageId, generate_mp3: mp3 });
  if (!r?.fileURL) throw new Error('a uazapi não devolveu o arquivo');
  const res = await fetch(r.fileURL);
  if (!res.ok) throw new Error(`download da mídia ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimetype: r.mimetype ?? res.headers.get('content-type') ?? 'application/octet-stream' };
}

/** Transcreve um áudio recebido (OpenAI), como no robô de NPS. */
export async function transcrever(messageId: string): Promise<string | null> {
  const chave = Deno.env.get('AGENTE_OPENAI_API_KEY') ?? Deno.env.get('OPENAI_API_KEY');
  if (!chave) throw new Error('OPENAI_API_KEY não configurada');
  const { bytes, mimetype } = await baixarMidia(messageId, true);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimetype || 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');
  const t = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form,
  });
  const j = await t.json().catch(() => null);
  if (!t.ok) throw new Error(`OpenAI ${t.status}: ${j?.error?.code ?? j?.error?.message ?? 'erro'}`);
  return (j?.text ?? '').trim() || null;
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}
