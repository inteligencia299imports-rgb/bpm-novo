// deno-lint-ignore-file no-explicit-any
// Robô de NPS — webhook da uazapi (evento "messages").
// URL: <SUPABASE_URL>/functions/v1/nps-bot-webhook?key=<NPS_BOT_SECRET>
// Só trata mensagens de clientes que têm uma pesquisa aberta; o resto é ignorado
// (o WhatsApp segue funcionando normalmente para o atendimento humano).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type Entrada, processarMensagem } from '../_shared/nps-bot/conversa.ts';
import { pausarPorQueda } from '../_shared/nps-bot/pausa.ts';
import { whatsappConectado } from '../_shared/nps-bot/uazapi.ts';

const ok = () => new Response('ok', { status: 200 });

/** DDD + 8 últimos dígitos — casa o JID com ou sem o 9. */
function chaveDoJid(jid: string | null | undefined): string | null {
  const d = String(jid ?? '').split('@')[0].replace(/\D/g, '');
  if (!d.startsWith('55') || d.length < 12) return null;
  return d.slice(2, 4) + d.slice(-8);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('NPS_BOT_SECRET');
  const url = new URL(req.url);
  if (!secret || url.searchParams.get('key') !== secret) return new Response('não autorizado', { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.EventType === 'connection') {
    // Mudou a conexão do WhatsApp: se caiu/foi bloqueado, pausa os envios e avisa na hora.
    const st = await whatsappConectado();
    if (!st.conectado && !st.incerto) {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await pausarPorQueda(db, st.detalhe);
    }
    return ok();
  }
  if (!body || body.EventType !== 'messages') return ok();
  const m = body.message ?? body.data?.message ?? null;
  if (!m || m.fromMe || m.wasSentByApi || m.isGroup) return ok();

  const chave = chaveDoJid(m.sender_pn) ?? chaveDoJid(m.chatid) ?? chaveDoJid(m.sender);
  if (!chave) return ok();

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: conversa } = await db.from('nps_bot_conversas').select('*')
    .eq('chave_telefone', chave).in('status', ['enviada', 'em_andamento'])
    .order('enviada_at', { ascending: false }).limit(1).maybeSingle();
  if (!conversa) return ok();

  const tipo = String(m.messageType ?? '');
  const entrada: Entrada = {
    messageId: m.messageid ?? m.id ?? null,
    botaoId: m.buttonOrListid || null,
    texto: typeof m.text === 'string' && m.text.trim() ? m.text : null,
    audio: /audio|ptt/i.test(tipo),
    tipo,
  };
  // Figurinha, reação, imagem sem legenda etc.: ignora (não responde nem conta como resposta).
  if (/sticker|reaction/i.test(tipo) || (!entrada.botaoId && !entrada.texto && !entrada.audio)) return ok();

  // Registra a mensagem; se já foi processada (reenvio do webhook), para aqui.
  const { error: dup } = await db.from('nps_bot_mensagens').insert({
    conversa_id: conversa.id, direcao: 'recebida', message_id: entrada.messageId, tipo,
    conteudo: entrada.botaoId ? `[${entrada.botaoId}] ${entrada.texto ?? ''}` : (entrada.texto ?? (entrada.audio ? '[áudio]' : `[${tipo}]`)),
  });
  if (dup) return ok();

  // Processa em segundo plano: no texto livre (motivo/comentário) o robô espera o cliente
  // terminar de mandar as mensagens antes de seguir, e a uazapi não pode ficar esperando.
  const trabalho = (async () => {
    try {
      await processarMensagem(db, conversa, entrada);
    } catch (e) {
      console.error('nps-bot-webhook', e);
      await db.from('nps_bot_conversas').update({ erro: String(e).slice(0, 500) }).eq('id', conversa.id);
    }
  })();
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
  else await trabalho;
  return ok();
});

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
