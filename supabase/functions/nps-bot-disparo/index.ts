// deno-lint-ignore-file no-explicit-any
// Robô de NPS — disparo. Chamado pelo pg_cron a cada minuto (ver supabase/nps-bot-setup.sql).
//
// A cada chamada, no máximo UMA conversa nova, e só quando:
//   * nps_bot_config.ativo = true e modo_teste = false;
//   * horário comercial de Brasília (seg–sex 9h–18h, sáb 9h–12h);
//   * já passou o intervalo aleatório desde o último envio (intervalo_min_seg..intervalo_max_seg);
//   * não bateu o limite_diario.
// Também encerra conversas paradas.
//
// POST { "acao": "teste", "telefone": "5561999999999", "ids": ["<id da fila>", ...] }
//   abre uma conversa de TESTE para o telefone informado com os itens da fila (ou com o
//   primeiro cliente da fila, sem "ids"). Teste não grava respostas nem muda status.
//
// Autenticação: header x-nps-bot-secret = secret NPS_BOT_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { abrirConversa, classificar, finalizar, type LinhaFila } from '../_shared/nps-bot/conversa.ts';

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
  return primeiro ? fila.filter((l: any) => l.chave_telefone === primeiro.chave_telefone) : null;
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
      const id = await abrirConversa(db, linhas, { teste: true, telefoneTeste: telefone });
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

    await encerrarParadas(db);

    if (!cfg.ativo || cfg.modo_teste) return json({ ok: true, enviado: false, motivo: 'robô desligado ou em modo teste' });
    if (!horarioComercial()) return json({ ok: true, enviado: false, motivo: 'fora do horário comercial' });
    if (cfg.proximo_envio_at && new Date(cfg.proximo_envio_at) > new Date()) {
      return json({ ok: true, enviado: false, motivo: 'aguardando intervalo' });
    }

    const inicioDia = new Date(`${agoraSP().data}T00:00:00-03:00`).toISOString();
    const { count } = await db.from('nps_bot_conversas').select('id', { count: 'exact', head: true })
      .eq('teste', false).gte('enviada_at', inicioDia);
    if ((count ?? 0) >= cfg.limite_diario) return json({ ok: true, enviado: false, motivo: 'limite diário' });

    const linhas = await proximoCliente(db, undefined, cfg.enviar_desde);
    if (!linhas) return json({ ok: true, enviado: false, motivo: 'fila vazia' });

    // Reserva o próximo horário antes de enviar (evita dois envios seguidos se o cron sobrepor).
    const espera = cfg.intervalo_min_seg + Math.random() * Math.max(0, cfg.intervalo_max_seg - cfg.intervalo_min_seg);
    await db.from('nps_bot_config').update({ proximo_envio_at: new Date(Date.now() + espera * 1000).toISOString() }).eq('id', true);

    const id = await abrirConversa(db, linhas, { teste: false });
    return json({ ok: true, enviado: true, conversa: id, itens: linhas.length });
  } catch (e) {
    console.error('nps-bot-disparo', e);
    return json({ error: String(e) }, 500);
  }
});
