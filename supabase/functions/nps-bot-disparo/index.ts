// deno-lint-ignore-file no-explicit-any
// Robô de NPS — disparo. Chamado pelo pg_cron a cada minuto (ver supabase/nps-bot-setup.sql).
//
// O robô envia por vários números de WhatsApp (nps_bot_instancias). A cada chamada, no máximo
// UMA conversa nova POR NÚMERO, e só quando:
//   * nps_bot_config.ativo = true e modo_teste = false (chave geral);
//   * o número está ativo (é pausado sozinho se o WhatsApp dele cair);
//   * horário comercial de Brasília (seg–sex 9h–18h, sáb 9h–12h) e dentro de um lote
//     (nps_bot_config.lotes: manhã e tarde);
//   * já passou o intervalo aleatório desde o último envio DO NÚMERO (intervalo_min_seg..intervalo_max_seg);
//   * o número não bateu o limite do lote (limite_diario do número ÷ nº de lotes) nem o do dia.
// Também encerra conversas paradas.
//
// POST { "acao": "teste", "telefone": "5561999999999", "ids": ["<id da fila>", ...], "instancia": "cerebro" }
//   abre uma conversa de TESTE para o telefone informado com os itens da fila (ou com o
//   primeiro cliente da fila, sem "ids"). Teste não grava respostas nem muda status.
//
// POST { "acao": "retomar", "conversas": [{ "id": "<conversa>", "botao": "o:0:1" }], "ids": ["<id da fila>"] }
//   clientes que tocaram em "Iniciar!" (ou responderam) enquanto o WhatsApp estava fora:
//   "conversas" reabre conversas do robô (seguindo da resposta perdida, se "botao");
//   "ids" abre a conversa de itens da fila já na 1ª pergunta (pesquisas antigas do n8n).
//
// Autenticação: header x-nps-bot-secret = secret NPS_BOT_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  abrirConversa, classificar, finalizar, type LinhaFila, retomarConversa, WhatsappForaDoAr,
} from '../_shared/nps-bot/conversa.ts';
import { pausarPorQueda } from '../_shared/nps-bot/pausa.ts';
import { cliente } from '../_shared/nps-bot/uazapi.ts';

const COLUNAS_FILA =
  'id, tabela, departamento, negociacao, loja, cidade, nome_exibicao, link_google, cliente_id, cliente, cliente_email, telefone_envio, chave_telefone, data_negociacao, enviar_a_partir, ducati';
const CARENCIA_DIAS = 7;        // não manda nova pesquisa a quem recebeu uma nos últimos 7 dias
const EXPIRA_SEM_INICIO_H = 72; // não tocou em "Iniciar!"
const EXPIRA_PARADA_H = 24;     // começou e parou de responder

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Data e hora em Brasília (America/Sao_Paulo). */
function agoraSP() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60, dia: p.weekday as string };
}

function horarioComercial() {
  const { hora, dia } = agoraSP();
  if (dia === 'Sun') return false;
  if (dia === 'Sat') return hora >= 9 && hora < 12;
  return hora >= 9 && hora < 18;
}

interface Lote { nome: string; inicio: string; fim: string }
const horas = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h + (m || 0) / 60; };

/** Lote em andamento agora (e o seu intervalo em ISO), ou null entre lotes. */
function loteAtual(lotes: Lote[]) {
  const { data, hora } = agoraSP();
  const l = (lotes ?? []).find((x) => hora >= horas(x.inicio) && hora < horas(x.fim));
  if (!l) return null;
  const iso = (hhmm: string) => new Date(`${data}T${hhmm}:00-03:00`).toISOString();
  return { ...l, de: iso(l.inicio), ate: iso(l.fim), inicioDia: iso('00:00') };
}

async function encerrarParadas(db: any) {
  const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
  await db.from('nps_bot_conversas').update({ status: 'expirada' })
    .eq('status', 'enviada').lt('enviada_at', h(EXPIRA_SEM_INICIO_H));
  const { data: paradas } = await db.from('nps_bot_conversas').select('*')
    .eq('status', 'em_andamento').lt('ultima_interacao_at', h(EXPIRA_PARADA_H)).limit(20);
  for (const c of paradas ?? []) {
    // Respondeu até a nota: grava o que tem. Senão, expira (o atendimento fica "Enviado").
    if (c.respostas?.nps) await finalizar(db, c, { silencioso: true });
    else await db.from('nps_bot_conversas').update({ status: 'expirada' }).eq('id', c.id);
  }

  // Concluída mas a gravação em respostas_nps falhou: tenta de novo (sem reenviar nada ao cliente).
  const { data: falhas } = await db.from('nps_bot_conversas').select('*')
    .eq('status', 'concluida').eq('teste', false).like('erro', 'respostas_nps:%').limit(10);
  for (const c of falhas ?? []) {
    const ids = (c.itens ?? []).map((i: any) => i.id);
    const { count } = await db.from('respostas_nps').select('id', { count: 'exact', head: true }).in('atendimento_id', ids);
    if ((count ?? 0) > 0) { await db.from('nps_bot_conversas').update({ erro: null }).eq('id', c.id); continue; }
    await db.from('nps_bot_conversas').update({ erro: null }).eq('id', c.id);
    await finalizar(db, { ...c, erro: null }, { silencioso: true });
  }
}

/**
 * WhatsApp de um número fora: se a uazapi respondeu que caiu, pausa o número e avisa na hora.
 * Se a uazapi só não respondeu (rede), pula o ciclo e só pausa após FALHAS_PARA_PAUSAR ciclos seguidos.
 */
const FALHAS_PARA_PAUSAR = 5;
async function tratarQueda(db: any, inst: any, detalhe: string, incerto: boolean) {
  if (incerto) {
    const falhas = (inst.falhas_conexao ?? 0) + 1;
    await db.from('nps_bot_instancias').update({ falhas_conexao: falhas }).eq('id', inst.id);
    if (falhas < FALHAS_PARA_PAUSAR) return `uazapi sem resposta (${falhas}/${FALHAS_PARA_PAUSAR}): ${detalhe}`;
    detalhe = `uazapi sem resposta há ${falhas} minutos: ${detalhe}`;
  }
  await pausarPorQueda(db, inst.id, detalhe);
  return `pausado: ${detalhe}`;
}

/** Próximo cliente da fila: todas as linhas prontas do mesmo telefone. */
async function proximoCliente(db: any, ids?: string[], enviarDesde?: string | null): Promise<LinhaFila[] | null> {
  let q = db.from('vw_nps_bot_fila').select(COLUNAS_FILA);
  if (ids?.length) q = q.in('id', ids);
  else q = q.lte('enviar_a_partir', agoraSP().data);
  if (!ids?.length && enviarDesde) q = q.gte('data_negociacao', enviarDesde);
  const { data: fila, error } = await q.order('enviar_a_partir').order('data_negociacao').limit(500);
  if (error) throw error;
  if (!fila?.length) return null;
  if (ids?.length) return fila;

  const desde = new Date(Date.now() - CARENCIA_DIAS * 86400_000).toISOString();
  const { data: recentes } = await db.from('nps_bot_conversas').select('chave_telefone')
    .eq('teste', false).or(`status.in.(enviada,em_andamento),enviada_at.gte.${desde}`);
  const bloqueadas = new Set((recentes ?? []).map((r: any) => r.chave_telefone));
  const primeiro = fila.find((l: any) => !bloqueadas.has(l.chave_telefone));
  if (!primeiro) return null;
  if (!primeiro.chave_telefone) return [primeiro]; // telefone inválido: vai sozinho (registra não enviado)
  return fila.filter((l: any) => l.chave_telefone === primeiro.chave_telefone);
}

const contar = async (db: any, instancia: string, de: string, ate?: string) => {
  let q = db.from('nps_bot_conversas').select('id', { count: 'exact', head: true })
    .eq('teste', false).eq('instancia', instancia).gte('enviada_at', de);
  if (ate) q = q.lt('enviada_at', ate);
  const { count } = await q;
  return count ?? 0;
};

/** Um ciclo de envio de um número. Devolve o que aconteceu (para o log do cron). */
async function cicloDoNumero(db: any, cfg: any, inst: any, lote: NonNullable<ReturnType<typeof loteAtual>>, nLotes: number) {
  if (inst.proximo_envio_at && new Date(inst.proximo_envio_at) > new Date()) return { motivo: 'aguardando intervalo' };

  const limiteLote = Math.ceil(inst.limite_diario / Math.max(1, nLotes));
  if (await contar(db, inst.id, lote.de, lote.ate) >= limiteLote) return { motivo: `limite do lote da ${lote.nome}` };
  if (await contar(db, inst.id, lote.inicioDia) >= inst.limite_diario) return { motivo: 'limite diário' };

  // WhatsApp caiu ou foi bloqueado: pausa o número na hora e avisa pelo outro.
  const st = await cliente(inst.id).whatsappConectado();
  if (!st.conectado) return { motivo: await tratarQueda(db, inst, st.detalhe, st.incerto) };
  if (inst.falhas_conexao) await db.from('nps_bot_instancias').update({ falhas_conexao: 0 }).eq('id', inst.id);

  const linhas = await proximoCliente(db, undefined, cfg.enviar_desde);
  if (!linhas) return { motivo: 'fila vazia' };

  // Reserva o próximo horário do número antes de enviar (se o cron sobrepor, só um envia).
  const espera = cfg.intervalo_min_seg + Math.random() * Math.max(0, cfg.intervalo_max_seg - cfg.intervalo_min_seg);
  const agora = new Date().toISOString();
  const { data: reservou } = await db.from('nps_bot_instancias')
    .update({ proximo_envio_at: new Date(Date.now() + espera * 1000).toISOString() })
    .eq('id', inst.id).or(`proximo_envio_at.is.null,proximo_envio_at.lte.${agora}`).select('id');
  if (!reservou?.length) return { motivo: 'outro ciclo já está enviando' };

  try {
    const id = await abrirConversa(db, linhas, { teste: false, instancia: inst.id });
    // Não enviou (sem WhatsApp/telefone inválido): não precisa esperar o intervalo.
    if (!id) await db.from('nps_bot_instancias').update({ proximo_envio_at: null }).eq('id', inst.id);
    return { enviado: !!id, conversa: id, itens: linhas.length, motivo: id ? undefined : 'NPS NÃO ENVIADO' };
  } catch (e) {
    if (e instanceof WhatsappForaDoAr) {
      // Libera o intervalo: o atendimento não saiu e continua na fila.
      await db.from('nps_bot_instancias').update({ proximo_envio_at: null }).eq('id', inst.id);
      return { motivo: await tratarQueda(db, inst, e.message, e.incerto) };
    }
    throw e;
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('NPS_BOT_SECRET');
  if (!secret || req.headers.get('x-nps-bot-secret') !== secret) return json({ error: 'não autorizado' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const { data: cfg, error: cfgErr } = await db.from('nps_bot_config').select('*').maybeSingle();
  if (cfgErr || !cfg) return json({ error: 'nps_bot_config ausente' }, 500);

  try {
    if (body.acao === 'teste') {
      const telefone = String(body.telefone ?? cfg.telefone_teste ?? '').replace(/\D/g, '');
      if (telefone.length < 12) return json({ error: 'informe o telefone com 55 + DDD' }, 400);
      const linhas = await proximoCliente(db, body.ids);
      if (!linhas) return json({ error: 'nada na fila para testar' }, 404);
      const id = await abrirConversa(db, linhas, { teste: true, telefoneTeste: telefone, instancia: body.instancia });
      return json({ ok: true, conversa: id, itens: linhas.map((l) => `${l.departamento} ${l.negociacao} ${l.loja}`) });
    }

    // Reclassifica uma conversa de TESTE já concluída (conferir a separação melhorias/comentário).
    if (body.acao === 'reclassificar') {
      const { data: c } = await db.from('nps_bot_conversas').select('*').eq('id', body.conversa).eq('teste', true).maybeSingle();
      if (!c) return json({ error: 'conversa de teste não encontrada' }, 404);
      const classif = await classificar(c, { lancarErro: true });
      await db.from('nps_bot_conversas').update({ respostas: { ...c.respostas, _classificacao: classif } }).eq('id', c.id);
      return json({ ok: true, classificacao: classif });
    }

    // Clientes que responderam enquanto o WhatsApp estava fora: seguem com prioridade.
    if (body.acao === 'retomar') {
      const resultado: unknown[] = [];
      for (const r of body.conversas ?? []) {
        const { data: c } = await db.from('nps_bot_conversas').select('*').eq('id', r.id).maybeSingle();
        if (!c) { resultado.push({ id: r.id, erro: 'conversa não encontrada' }); continue; }
        try {
          await retomarConversa(db, c, r.botao ?? null);
          resultado.push({ id: c.id, cliente: c.cliente_nome, ok: true });
        } catch (e) { resultado.push({ id: c.id, cliente: c.cliente_nome, erro: String(e).slice(0, 300) }); }
      }
      for (const id of body.ids ?? []) {
        try {
          const linhas = await proximoCliente(db, [id]);
          if (!linhas) { resultado.push({ id, erro: 'não está na fila (nps_status em_aberto?)' }); continue; }
          const conversa = await abrirConversa(db, linhas, { teste: false, instancia: body.instancia, retomada: true });
          resultado.push({ id, cliente: linhas[0].cliente, conversa, ok: !!conversa });
        } catch (e) { resultado.push({ id, erro: String(e).slice(0, 300) }); }
      }
      return json({ ok: true, resultado });
    }

    await encerrarParadas(db);

    if (!cfg.ativo || cfg.modo_teste) return json({ ok: true, enviado: false, motivo: 'robô desligado ou em modo teste' });
    if (!horarioComercial()) return json({ ok: true, enviado: false, motivo: 'fora do horário comercial' });
    const lote = loteAtual(cfg.lotes);
    if (!lote) return json({ ok: true, enviado: false, motivo: 'entre lotes' });

    const { data: instancias } = await db.from('nps_bot_instancias').select('*').eq('ativo', true).order('ordem');
    if (!instancias?.length) return json({ ok: true, enviado: false, motivo: 'nenhum número ativo' });

    const numeros: Record<string, unknown> = {};
    for (const inst of instancias) {
      try {
        numeros[inst.id] = await cicloDoNumero(db, cfg, inst, lote, (cfg.lotes ?? []).length);
      } catch (e) {
        console.error('nps-bot-disparo', inst.id, e);
        numeros[inst.id] = { erro: String(e).slice(0, 300) };
      }
    }
    return json({ ok: true, lote: lote.nome, numeros });
  } catch (e) {
    console.error('nps-bot-disparo', e);
    return json({ error: String(e) }, 500);
  }
});
