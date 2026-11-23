// Cliente mínimo da uazapi (https://docs.uazapi.com). Header `token` = token da instância.
// Secrets: UAZAPI_URL (ex.: https://<servidor>.uazapi.com) e um token por número:
//   comunicacao → UAZAPI_TOKEN, cerebro → UAZAPI_ALERTA_TOKEN, outros → UAZAPI_TOKEN_<ID>.

const baseUrl = () => (Deno.env.get('UAZAPI_URL') ?? '').replace(/\/+$/, '');

export const INSTANCIA_PADRAO = 'comunicacao';
const SECRET_DO_TOKEN: Record<string, string> = { comunicacao: 'UAZAPI_TOKEN', cerebro: 'UAZAPI_ALERTA_TOKEN' };

/** Token da instância (número) do robô. */
export const tokenDe = (instancia: string | null | undefined = INSTANCIA_PADRAO) => {
  const id = instancia || INSTANCIA_PADRAO;
  return Deno.env.get(SECRET_DO_TOKEN[id] ?? `UAZAPI_TOKEN_${id.toUpperCase()}`) ?? '';
};

export interface Enviado {
  messageId: string | null;
  chatid: string | null;
}

async function post(path: string, body: Record<string, unknown>, tokenInstancia: string): Promise<any> {
  if (!baseUrl() || !tokenInstancia) throw new Error('UAZAPI_URL/token da instância não configurados');
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

/** Atraso aleatório (ms) que a uazapi mostra como "digitando..." antes de enviar. */
export const digitando = (min = 1200, max = 2800) => Math.floor(min + Math.random() * (max - min));

/** Operações de um número (instância) do robô. */
export function cliente(instancia: string | null | undefined = INSTANCIA_PADRAO) {
  const tok = tokenDe(instancia);
  return {
    instancia: instancia || INSTANCIA_PADRAO,

    /**
     * O WhatsApp da instância está conectado?
     *  - conectado false + incerto false: a uazapi RESPONDEU que o WhatsApp caiu/desconectou/bloqueou;
     *  - incerto true: não deu para falar com a uazapi (rede/servidor) ou o WhatsApp está reconectando
     *    ('connecting') — NÃO quer dizer que o WhatsApp caiu.
     * Tenta 3 vezes antes de concluir que a uazapi não responde.
     */
    async whatsappConectado(): Promise<{ conectado: boolean; incerto: boolean; detalhe: string }> {
      let ultimoErro = '';
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        if (tentativa) await new Promise((ok) => setTimeout(ok, 4000));
        try {
          const res = await fetch(`${baseUrl()}/instance/status`, { headers: { token: tok }, signal: AbortSignal.timeout(10000) });
          if (res.status >= 500) { ultimoErro = `uazapi HTTP ${res.status}`; continue; }
          const j = await res.json().catch(() => null);
          if (!res.ok || !j) return { conectado: false, incerto: false, detalhe: `uazapi HTTP ${res.status}` };
          const st = j?.status ?? {};
          const situacao = j?.instance?.status ?? (typeof j?.status === 'string' ? j.status : '');
          const conectado = situacao === 'connected' && st.connected !== false && st.loggedIn !== false;
          // 'connecting' = reconectando (passageiro, costuma voltar em segundos): conta como incerto,
          // para só pausar se durar vários ciclos seguidos — não na primeira leitura.
          const reconectando = !conectado && situacao === 'connecting';
          return { conectado, incerto: reconectando, detalhe: `instância: ${situacao || 'desconhecida'}` };
        } catch (e) {
          ultimoErro = `sem resposta da uazapi: ${String(e).slice(0, 120)}`;
        }
      }
      return { conectado: false, incerto: true, detalhe: ultimoErro };
    },

    /** O número tem WhatsApp? */
    async temWhatsapp(number: string): Promise<boolean> {
      const r = await post('/chat/check', { numbers: [number] }, tok);
      return Array.isArray(r) && r[0]?.isInWhatsapp === true;
    },

    async enviarTexto(number: string, text: string, opts: { delay?: number; linkPreview?: boolean } = {}) {
      return enviado(await post('/send/text', {
        number, text, delay: opts.delay ?? digitando(), linkPreview: opts.linkPreview ?? false,
      }, tok));
    },

    /** Botões de resposta. `opcoes` = [{texto, id}]. */
    async enviarBotoes(number: string, text: string, opcoes: { texto: string; id: string }[], delay?: number) {
      return enviado(await post('/send/menu', {
        number,
        type: 'button',
        text,
        choices: opcoes.map((o) => `${o.texto}|${o.id}`),
        delay: delay ?? digitando(),
      }, tok));
    },

    /** Lista (usada na nota de 0 a 10, que passa do limite de botões). */
    async enviarLista(
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
      }, tok));
    },

    /**
     * Transcreve um áudio recebido: baixa o MP3 pela uazapi e transcreve na OpenAI (OPENAI_API_KEY).
     * (A transcrição da própria uazapi não volta quando o arquivo já está em cache.)
     * Lança erro com o motivo, para ficar registrado na conversa.
     */
    async transcreverAudio(messageId: string): Promise<string | null> {
      const openai = Deno.env.get('OPENAI_API_KEY');
      if (!openai) throw new Error('OPENAI_API_KEY não configurada');
      const r = await post('/message/download', { id: messageId, generate_mp3: true }, tok);
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
    },
  };
}

export type ClienteUazapi = ReturnType<typeof cliente>;

/**
 * Mensagem para a equipe (alertas e avisos aos gerentes). Tenta os números do robô em ordem,
 * pulando `evitar` (o número que caiu), até um conseguir enviar.
 */
export async function enviarAviso(number: string, text: string, evitar?: string) {
  const ordem = ['comunicacao', 'cerebro'].filter((i) => i !== evitar);
  if (evitar) ordem.push(evitar);
  let erro: unknown = null;
  for (const inst of ordem) {
    if (!tokenDe(inst)) continue;
    try { return await cliente(inst).enviarTexto(number, text, { delay: 0 }); } catch (e) {
      console.error(`aviso pelo número ${inst} falhou`, e);
      erro = e;
    }
  }
  throw erro ?? new Error('nenhum número do robô configurado');
}
