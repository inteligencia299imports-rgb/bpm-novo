// deno-lint-ignore-file no-explicit-any
// Webhook do agente de dados (WhatsApp do número do Cérebro, via uazapi).
// Só responde aos números autorizados (agente_dados_usuarios). Só consulta: ver agente.ts e a
// migration 20261124170000_agente_dados.sql (papel somente leitura no banco).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Anthropic from 'npm:@anthropic-ai/sdk@^0.121.0';
import { conversaCom, baixarMidia, transcrever, base64 } from './whatsapp.ts';
import { rodarAgente, PRECO_AUDIO_SEG } from './agente.ts';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const ok = () => new Response('ok');
const MAX_AUDIO_SEG = 120;
const MAX_TEXTO_ENTRADA = 4000;
const MAX_ARQUIVO_BYTES = 10 * 1024 * 1024;
const HISTORICO_MSGS = 12;
const HISTORICO_HORAS = 6;

/** DDD + 8 últimos dígitos (mesma chave do robô de NPS: com ou sem o 9). */
function chaveDoJid(jid: unknown): string | null {
  const d = String(jid ?? '').split('@')[0].replace(/\D/g, '');
  if (d.length < 10) return null;
  const sem55 = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  return sem55.slice(0, 2) + sem55.slice(-8);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('AGENTE_WEBHOOK_SECRET');
  const url = new URL(req.url);
  if (!secret || url.searchParams.get('key') !== secret) return new Response('não autorizado', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || body.EventType !== 'messages') return ok();
  const m = body.message ?? body.data?.message ?? null;
  if (!m || m.fromMe || m.wasSentByApi || m.isGroup || String(m.chatid ?? '').includes('@g.us')) return ok();

  const chave = chaveDoJid(m.sender_pn) ?? chaveDoJid(m.chatid) ?? chaveDoJid(m.sender);
  if (!chave) return ok();

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: usuario } = await db.from('agente_dados_usuarios').select('*').eq('chave_telefone', chave).eq('ativo', true).maybeSingle();
  // Número não autorizado: silêncio total (nem confirma que o agente existe).
  if (!usuario) return ok();

  const msgId: string | null = m.messageid ?? m.id ?? null;
  const tipo = String(m.messageType ?? '');
  if (/sticker|reaction|poll|location|contact/i.test(tipo)) return ok();

  // Registro já na chegada; mensagem repetida (reenvio do webhook) para aqui.
  const { data: log, error: dup } = await db.from('agente_dados_log')
    .insert({ msg_id: msgId, chave_telefone: chave, nome: usuario.nome, tipo_entrada: tipo || 'texto' })
    .select('id').single();
  if (dup || !log) return ok();

  const trabalho = (async () => {
    const conversa = conversaCom(usuario.telefone);
    const inicio = Date.now();
    let pergunta = '';
    let audioSeg = 0;
    try {
      // ---------- entrada: texto, botão, áudio, imagem, documento
      const entrada: Anthropic.ContentBlockParam[] = [];
      const textoMsg = typeof m.text === 'string' ? m.text.trim() : '';
      const conteudo = typeof m.content === 'object' && m.content ? m.content : {};
      if (/audio|ptt/i.test(tipo)) {
        const seg = Number(conteudo.seconds ?? conteudo.duration ?? 0);
        if (seg > MAX_AUDIO_SEG) {
          await conversa.texto('Para áudios, o limite é de 2 minutos. Poderia enviar um áudio mais curto ou escrever a pergunta?');
          await db.from('agente_dados_log').update({ pergunta: `[áudio de ${seg}s]`, erro: 'áudio acima de 2 min' }).eq('id', log.id);
          return;
        }
        audioSeg = seg;
        const t = msgId ? await transcrever(msgId) : null;
        if (!t) { await conversa.texto('Não consegui entender o áudio. Poderia repetir ou escrever a pergunta?'); return; }
        pergunta = `[áudio] ${t}`;
        entrada.push({ type: 'text', text: t.slice(0, MAX_TEXTO_ENTRADA) });
      } else if (/image/i.test(tipo) && msgId) {
        const { bytes, mimetype } = await baixarMidia(msgId);
        if (bytes.length > MAX_ARQUIVO_BYTES) { await conversa.texto('A imagem é grande demais para análise (limite de 10 MB).'); return; }
        const tipoImg = /png|gif|webp/.test(mimetype) ? mimetype : 'image/jpeg';
        entrada.push({ type: 'image', source: { type: 'base64', media_type: tipoImg as any, data: base64(bytes) } });
        pergunta = `[imagem] ${textoMsg}`;
        entrada.push({ type: 'text', text: textoMsg ? textoMsg.slice(0, MAX_TEXTO_ENTRADA) : '(imagem enviada sem pergunta)' });
      } else if (/document/i.test(tipo) && msgId) {
        const { bytes, mimetype } = await baixarMidia(msgId);
        const nomeArq = String(conteudo.fileName ?? conteudo.title ?? 'documento');
        pergunta = `[documento: ${nomeArq}] ${textoMsg}`;
        if (bytes.length > MAX_ARQUIVO_BYTES) { await conversa.texto('O documento é grande demais para análise (limite de 10 MB).'); return; }
        if (/pdf/i.test(mimetype) || /\.pdf$/i.test(nomeArq)) {
          // 1º: texto do próprio PDF (sem IA). Só se não houver texto (escaneado), vai como documento para a IA.
          let textoPdf = '';
          try {
            const pdf = await getDocumentProxy(bytes);
            const { text } = await extractText(pdf, { mergePages: true });
            textoPdf = String(text ?? '').trim();
          } catch { /* PDF sem camada de texto ou protegido */ }
          if (textoPdf.length > 200) {
            entrada.push({ type: 'text', text: `<documento nome="${nomeArq.replace(/"/g, '')}">\n${textoPdf.slice(0, 60_000)}\n</documento>` });
          } else {
            entrada.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } });
          }
        } else if (/text|csv/i.test(mimetype)) {
          entrada.push({ type: 'text', text: `<documento nome="${nomeArq.replace(/"/g, '')}">\n${new TextDecoder().decode(bytes).slice(0, 60_000)}\n</documento>` });
        } else {
          await conversa.texto('No momento consigo analisar documentos em PDF, imagens e textos. Poderia enviar nesse formato?');
          return;
        }
        entrada.push({ type: 'text', text: textoMsg ? textoMsg.slice(0, MAX_TEXTO_ENTRADA) : '(documento enviado sem pergunta)' });
      } else if (textoMsg) {
        pergunta = textoMsg;
        entrada.push({ type: 'text', text: textoMsg.slice(0, MAX_TEXTO_ENTRADA) });
      } else {
        return;
      }

      // ---------- histórico curto (só texto das últimas trocas)
      const desde = new Date(Date.now() - HISTORICO_HORAS * 3600_000).toISOString();
      const { data: hist } = await db.from('agente_dados_mensagens').select('papel, conteudo')
        .eq('chave_telefone', chave).gte('created_at', desde).order('id', { ascending: false }).limit(HISTORICO_MSGS);
      const historico: Anthropic.MessageParam[] = [];
      for (const h of (hist ?? []).reverse()) {
        const texto = String((h.conteudo as any)?.texto ?? '').trim();
        if (!texto) continue;
        const papel = h.papel as 'user' | 'assistant';
        // Mantém a alternância user/assistant exigida pela API.
        if (historico.length && historico[historico.length - 1].role === papel) {
          (historico[historico.length - 1] as any).content += `\n${texto}`;
        } else {
          historico.push({ role: papel, content: texto });
        }
      }
      while (historico.length && historico[0].role !== 'user') historico.shift();
      if (historico.length && historico[historico.length - 1].role === 'user') historico.pop();

      await conversa.digitando();
      const r = await rodarAgente({ db, conversa, nome: usuario.nome, rh: !!usuario.rh, historico, entrada });

      await db.from('agente_dados_mensagens').insert([
        { chave_telefone: chave, papel: 'user', conteudo: { texto: pergunta.slice(0, 4000) } },
        { chave_telefone: chave, papel: 'assistant', conteudo: { texto: (r.respostaFinal || (r.arquivos.length ? `[arquivo enviado: ${r.arquivos.map((a) => a.titulo).join(', ')}]` : '')).slice(0, 4000) } },
      ]);
      await db.from('agente_dados_log').update({
        pergunta: pergunta.slice(0, 4000),
        resposta: r.respostaFinal.slice(0, 8000),
        consultas: r.consultas,
        arquivos: r.arquivos,
        tokens_entrada: r.tokensEntrada,
        tokens_saida: r.tokensSaida,
        tokens_cache_leitura: r.tokensCacheLeitura,
        tokens_cache_escrita: r.tokensCacheEscrita,
        audio_segundos: audioSeg || null,
        custo_usd: Math.round((r.custoUsd + audioSeg * PRECO_AUDIO_SEG) * 1e6) / 1e6,
        duracao_ms: Date.now() - inicio,
      }).eq('id', log.id);
    } catch (e) {
      console.error('agente-dados', e);
      await db.from('agente_dados_log').update({ pergunta: pergunta.slice(0, 4000), erro: String(e).slice(0, 1000), duracao_ms: Date.now() - inicio }).eq('id', log.id);
      try { await conversa.texto('Tive uma instabilidade ao processar sua solicitação. Poderia tentar novamente em instantes?'); } catch { /* sem envio */ }
    }
  })();
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(trabalho);
  else await trabalho;
  return ok();
});
