// deno-lint-ignore-file no-explicit-any
// Robô de NPS — aviso aos gerentes/responsáveis. Chamado pelo gatilho da respostas_nps
// (migration 20261119180000_nps_bot_notificacoes.sql).
//
// POST { "resposta_id": "<uuid>" }  → avisa os destinatários da loja/departamento.
// POST { "acao": "teste", "conversa": "<id de conversa de teste>", "telefone": "55...", "nome": "Fulano" }
//   → manda o aviso dessa conversa de teste só para o telefone informado (nada é registrado).
//
// Autenticação: header x-nps-bot-secret = secret NPS_BOT_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { carregarResposta, destinatarios, juntarComAtendimento, notificar } from '../_shared/nps-bot/notificacao.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('NPS_BOT_SECRET');
  if (!secret || req.headers.get('x-nps-bot-secret') !== secret) return json({ error: 'não autorizado' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));

  try {
    if (body.acao === 'teste') {
      const { data: c } = await db.from('nps_bot_conversas').select('*').eq('id', body.conversa).eq('teste', true).maybeSingle();
      if (!c) return json({ error: 'conversa de teste não encontrada' }, 404);
      const telefone = String(body.telefone ?? '').replace(/\D/g, '');
      if (telefone.length < 12 || !body.nome) return json({ error: 'informe telefone (55+DDD) e nome' }, 400);
      const r = c.respostas ?? {};
      const it = c.itens[0];
      const cl = (r._classificacao ?? []).find((x: any) => x.id === it.id) ?? {};
      const d = await juntarComAtendimento(db, it.id, {
        respostaId: c.id,
        atendimento: r.atendimento?.valor, outros_setores: r.outros_setores?.valor,
        produto: it.produto ? r[`produto:${it.produto}`]?.valor : null,
        experiencia: r.experiencia?.valor, nps: r.nps?.valor, melhorias: cl.melhorias, comentario: cl.comentario,
      });
      if (!d) return json({ error: 'atendimento não encontrado na vw_nps' }, 404);
      const enviados = await notificar(db, d, [{ nome: body.nome, telefone }], { registrar: false });
      return json({ ok: true, enviados });
    }

    if (!body.resposta_id) return json({ error: 'resposta_id obrigatório' }, 400);
    const d = await carregarResposta(db, body.resposta_id);
    if (!d) return json({ ok: true, enviados: [], motivo: 'resposta/atendimento não encontrado' });
    const lista = await destinatarios(db, d);
    const enviados = await notificar(db, d, lista, { registrar: true });
    return json({ ok: true, enviados });
  } catch (e) {
    console.error('nps-bot-notificar', e);
    return json({ error: String(e) }, 500);
  }
});
