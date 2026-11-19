// deno-lint-ignore-file no-explicit-any
// Motor da conversa do robô de NPS: abre a conversa, processa cada mensagem do cliente,
// fecha e grava em respostas_nps.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as uaz from './uazapi.ts';
import {
  abaixoDoNeutro, ESCALAS, type Item, montarPassos, opcoesDoPasso, type Passo, produtoDoItem,
  TEXTO_PEDIR_COMENTARIO, textoAbertura, textoFechamento, textoMotivo,
} from './roteiro.ts';
import { classificarComentarios, classificarSemIa, interpretarOpcao } from './ia.ts';

export interface LinhaFila {
  id: string; tabela: string; departamento: string; negociacao: string; loja: string; cidade: string;
  nome_exibicao: string; link_google: string | null; cliente_id: string | null; cliente: string | null; cliente_email: string | null;
  telefone_envio: string; chave_telefone: string; data_negociacao: string; ducati: boolean;
}

interface Resposta { valor: string; indice: number; motivo?: string }

const agora = () => new Date().toISOString();

async function registrar(db: SupabaseClient, conversaId: string, direcao: 'enviada' | 'recebida', conteudo: string, extra: { message_id?: string | null; tipo?: string } = {}) {
  const { error } = await db.from('nps_bot_mensagens').insert({
    conversa_id: conversaId, direcao, conteudo, message_id: extra.message_id ?? null, tipo: extra.tipo ?? null,
  });
  return error;
}

// ------------------------------------------------------------------
// Abertura
// ------------------------------------------------------------------

/** Abre a conversa para um cliente (todas as linhas da fila com o mesmo telefone). */
export async function abrirConversa(db: SupabaseClient, linhas: LinhaFila[], opts: { teste: boolean; telefoneTeste?: string }) {
  // Principal = negociação mais recente (define loja, textos e link do Google).
  const ordenadas = [...linhas].sort((a, b) => b.data_negociacao.localeCompare(a.data_negociacao));
  const itens: Item[] = ordenadas.map((l) => ({
    id: l.id, tabela: l.tabela, departamento: l.departamento, negociacao: l.negociacao, loja: l.loja,
    cidade: l.cidade, nome_exibicao: l.nome_exibicao, link_google: l.link_google, ducati: l.ducati, produto: produtoDoItem(l.departamento, l.negociacao),
  }));
  const principal = itens[0];
  const passos = montarPassos(itens, principal);
  const p0 = ordenadas[0];
  const telefone = opts.teste ? opts.telefoneTeste! : p0.telefone_envio;
  const chave = telefone.slice(2, 4) + telefone.slice(-8);

  const { data: conversa, error } = await db.from('nps_bot_conversas').insert({
    telefone, chave_telefone: chave, cliente_id: p0.cliente_id, cliente_nome: p0.cliente, cliente_email: p0.cliente_email,
    loja: principal.loja, itens, passos, status: 'enviada', teste: opts.teste,
  }).select('id').single();
  if (error) throw error;

  const texto = textoAbertura(p0.cliente, itens, principal, passos.length);
  try {
    const r = await uaz.enviarBotoes(telefone, texto, [{ texto: 'Iniciar!', id: 'iniciar' }], uaz.digitando(800, 1500));
    await db.from('nps_bot_conversas').update({ chatid: r.chatid }).eq('id', conversa.id);
    await registrar(db, conversa.id, 'enviada', texto, { message_id: r.messageId, tipo: 'abertura' });
  } catch (e) {
    await db.from('nps_bot_conversas').update({ status: 'erro', erro: String(e) }).eq('id', conversa.id);
    throw e;
  }

  if (!opts.teste) {
    // Mesmo efeito do envio manual: sai da fila e aparece como "Enviado".
    for (const it of itens) {
      const { error: e } = await db.from(it.tabela).update({ nps_status: 'enviado', nps_enviado_at: agora() }).eq('id', it.id);
      if (e) console.error('marcar enviado', it.tabela, it.id, e.message);
    }
  }
  return conversa.id as string;
}

// ------------------------------------------------------------------
// Mensagens do cliente
// ------------------------------------------------------------------

export interface Entrada { messageId: string | null; botaoId: string | null; texto: string | null; audio: boolean; tipo: string }

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const OPTOUT = /^(parar|pare|sair|stop|cancelar|nao quero|nao quero mais|nao me mande mais|descadastrar)$/;

async function enviarPasso(db: SupabaseClient, c: any, indice: number, prefixo?: string) {
  const passo: Passo = c.passos[indice];
  const texto = prefixo ? `${prefixo}\n\n${passo.texto}` : passo.texto;
  const r = passo.tipo === 'nps'
    ? await uaz.enviarLista(c.telefone, texto, 'Selecione uma das opções', 'Nota', opcoesDoPasso(passo, indice))
    : await uaz.enviarBotoes(c.telefone, texto, opcoesDoPasso(passo, indice));
  await registrar(db, c.id, 'enviada', texto, { message_id: r.messageId, tipo: passo.chave });
}

/** Resolve qual opção o cliente escolheu: botão, texto igual à opção, número (nota) ou IA. */
async function escolha(passo: Passo, indicePasso: number, e: Entrada): Promise<number | null> {
  if (e.botaoId) {
    const m = /^o:(\d+):(\d+)$/.exec(e.botaoId);
    // Botão de uma pergunta anterior: não vale para a atual.
    if (m) return Number(m[1]) === indicePasso ? Number(m[2]) : null;
  }
  const txt = e.texto?.trim();
  if (!txt) return null;
  const n = normalizar(txt);
  if (passo.tipo === 'nps') {
    const num = /^(\d{1,2})$/.exec(n);
    if (num && Number(num[1]) <= 10) return Number(num[1]);
  }
  if (passo.tipo === 'sim_nao') {
    if (/^(sim|s|quero|pode ser|claro)$/.test(n)) return 1;
    if (/^(nao|n|nao obrigado|nao obrigada|obrigado|obrigada|nada)$/.test(n)) return 0;
    return null; // texto longo aqui é tratado como o próprio comentário
  }
  const labels = opcoesDoPasso(passo, indicePasso).map((o) => o.texto);
  const igual = labels.findIndex((l) => normalizar(l) === n);
  if (igual >= 0) return passo.tipo === 'nps' ? Number(labels[igual]) : igual;
  const i = await interpretarOpcao(passo.texto.replace(/\*/g, ''), labels, txt);
  if (i === null) return null;
  return passo.tipo === 'nps' ? Number(labels[i]) : i;
}

async function textoDaEntrada(e: Entrada, db?: SupabaseClient, conversaId?: string): Promise<string | null> {
  if (e.texto?.trim()) return e.texto.trim();
  if (e.audio && e.messageId) {
    try { return await uaz.transcreverAudio(e.messageId); } catch (err) {
      console.error('transcrição', err);
      if (db && conversaId) await db.from('nps_bot_conversas').update({ erro: `transcrição: ${String(err).slice(0, 300)}` }).eq('id', conversaId);
    }
  }
  return null;
}

export async function processarMensagem(db: SupabaseClient, c: any, e: Entrada) {
  const n = normalizar(e.texto ?? '');
  if (n && OPTOUT.test(n)) {
    await db.from('nps_bot_optout').upsert({ chave_telefone: c.chave_telefone, telefone: c.telefone });
    await db.from('nps_bot_conversas').update({ status: 'optout', ultima_interacao_at: agora() }).eq('id', c.id);
    const t = 'Tudo bem, não enviaremos mais pesquisas para este número. Obrigado!';
    const r = await uaz.enviarTexto(c.telefone, t);
    await registrar(db, c.id, 'enviada', t, { message_id: r.messageId });
    return;
  }

  // Ainda não tocou em "Iniciar!": qualquer resposta começa a pesquisa.
  if (c.status === 'enviada') {
    await db.from('nps_bot_conversas').update({ status: 'em_andamento', passo_atual: 0, aguardando: 'opcao', ultima_interacao_at: agora() }).eq('id', c.id);
    await enviarPasso(db, { ...c, status: 'em_andamento' }, 0);
    return;
  }

  const passos: Passo[] = c.passos;
  const i: number = c.passo_atual;
  const passo = passos[i];
  const respostas: Record<string, Resposta | any> = { ...(c.respostas ?? {}) };

  if (c.aguardando === 'motivo' || c.aguardando === 'comentario') {
    const texto = await textoDaEntrada(e, db, c.id);
    if (!texto) {
      const t = e.audio
        ? 'Não consegui ouvir o seu áudio 😕 Pode escrever em uma mensagem, por favor?'
        : 'Pode escrever em uma mensagem, por favor?';
      const r = await uaz.enviarTexto(c.telefone, t);
      await registrar(db, c.id, 'enviada', t, { message_id: r.messageId });
      return;
    }
    if (c.aguardando === 'motivo') {
      respostas[passo.chave] = { ...respostas[passo.chave], motivo: texto };
      await avancar(db, c, respostas, i + 1);
    } else {
      respostas.comentario = { ...(respostas.comentario ?? {}), texto };
      await finalizar(db, { ...c, respostas });
    }
    return;
  }

  // aguardando opção
  const valor = await escolha(passo, i, e);
  if (valor === null) {
    // No "quer deixar comentário?", um texto longo já é o comentário.
    if (passo.tipo === 'sim_nao') {
      const texto = await textoDaEntrada(e, db, c.id);
      if (texto && texto.split(/\s+/).length >= 3) {
        respostas.comentario = { valor: 'Sim', indice: 1, texto };
        await finalizar(db, { ...c, respostas });
        return;
      }
    }
    await db.from('nps_bot_conversas').update({ ultima_interacao_at: agora() }).eq('id', c.id);
    await enviarPasso(db, c, i, 'Para continuar, é só tocar em uma das opções abaixo 👇');
    return;
  }

  if (passo.tipo === 'sim_nao') {
    respostas.comentario = { valor: valor === 1 ? 'Sim' : 'Não', indice: valor };
    if (valor === 1) {
      await db.from('nps_bot_conversas').update({ respostas, aguardando: 'comentario', ultima_interacao_at: agora() }).eq('id', c.id);
      const r = await uaz.enviarTexto(c.telefone, TEXTO_PEDIR_COMENTARIO);
      await registrar(db, c.id, 'enviada', TEXTO_PEDIR_COMENTARIO, { message_id: r.messageId });
    } else {
      await finalizar(db, { ...c, respostas });
    }
    return;
  }

  const label = passo.tipo === 'nps' ? String(valor) : ESCALAS[passo.escala!][valor];
  respostas[passo.chave] = { valor: label, indice: valor };
  if (abaixoDoNeutro(passo, valor)) {
    await db.from('nps_bot_conversas').update({ respostas, aguardando: 'motivo', ultima_interacao_at: agora() }).eq('id', c.id);
    const t = textoMotivo(passo);
    const r = await uaz.enviarTexto(c.telefone, t);
    await registrar(db, c.id, 'enviada', t, { message_id: r.messageId });
    return;
  }
  await avancar(db, c, respostas, i + 1);
}

async function avancar(db: SupabaseClient, c: any, respostas: Record<string, any>, proximo: number) {
  await db.from('nps_bot_conversas').update({ respostas, passo_atual: proximo, aguardando: 'opcao', ultima_interacao_at: agora() }).eq('id', c.id);
  await enviarPasso(db, { ...c, respostas, passo_atual: proximo }, proximo);
}

// ------------------------------------------------------------------
// Fechamento e gravação
// ------------------------------------------------------------------

const DESCR_PRODUTO: Record<string, string> = { moto: 'compra de moto', equipamento: 'compra de equipamento', servico: 'serviço da oficina' };
const descricaoItem = (it: Item) =>
  it.negociacao === 'PERDIDO'
    ? `negociação não concluída (${it.departamento.toLowerCase()})`
    : it.produto ? DESCR_PRODUTO[it.produto] : `avaliação/compra da moto do cliente (${it.negociacao.toLowerCase()})`;

/** Encerra: mensagem final (antes, para o cliente não esperar) e gravação das respostas. */
export async function finalizar(db: SupabaseClient, c: any, opts: { silencioso?: boolean } = {}) {
  const itens: Item[] = c.itens;
  const passos: Passo[] = c.passos;
  const respostas: Record<string, any> = c.respostas ?? {};
  const principal = itens.find((i) => i.loja === c.loja) ?? itens[0];
  const nota = respostas.nps ? Number(respostas.nps.valor) : null;

  await db.from('nps_bot_conversas').update({
    respostas, status: 'concluida', aguardando: null, concluida_at: agora(), ultima_interacao_at: agora(),
  }).eq('id', c.id);

  if (!opts.silencioso) {
    const { data: cfg } = await db.from('nps_bot_config').select('link_portal_ducati').maybeSingle();
    const f = textoFechamento(nota, itens, principal, {
      google: principal.link_google ?? null, portalDucati: cfg?.link_portal_ducati ?? '',
    }, c.cliente_email);
    try {
      const r = await uaz.enviarTexto(c.telefone, f.texto, { linkPreview: f.linkPreview });
      await registrar(db, c.id, 'enviada', f.texto, { message_id: r.messageId, tipo: 'fechamento' });
    } catch (e) { console.error('fechamento', e); }
  }

  // Textos abertos do cliente: motivos (nota baixa) e comentário final.
  const trechos = passos.flatMap((p) => {
    const r = respostas[p.chave];
    if (!r) return [];
    const txt = p.chave === 'comentario' ? r.texto : r.motivo;
    return txt ? [{ pergunta: p.texto.replace(/\*/g, ''), resposta: p.chave === 'comentario' ? undefined : r.valor, texto: txt, itens: p.itens, motivo: p.chave !== 'comentario' }] : [];
  });
  const resumo = itens.map((it) => ({ id: it.id, descricao: descricaoItem(it) }));
  let classif;
  try {
    classif = await classificarComentarios(resumo, trechos); // sem trechos, não chama a IA
  } catch (e) {
    console.error('classificação IA', e);
    classif = classificarSemIa(resumo, trechos);
  }

  if (c.teste) {
    await db.from('nps_bot_conversas').update({ respostas: { ...respostas, _classificacao: classif } }).eq('id', c.id);
    return;
  }

  const produtoDe = (it: Item) => (it.produto ? respostas[`produto:${it.produto}`]?.valor ?? null : null);
  const linhas = itens.map((it) => {
    const cl = classif.find((x) => x.id === it.id);
    return {
      atendimento_id: it.id,
      data_resposta: agora(),
      atendimento: respostas.atendimento?.valor ?? null,
      outros_setores: respostas.outros_setores?.valor ?? null,
      produto: produtoDe(it),
      experiencia: respostas.experiencia?.valor ?? null,
      nps: respostas.nps?.valor ?? null,
      melhorias: cl?.melhorias || null,
      espaco_livre: cl?.comentario || null,
      origem: 'chatbot',
    };
  });
  const { error } = await db.from('respostas_nps').insert(linhas);
  if (error) {
    console.error('respostas_nps', error.message);
    await db.from('nps_bot_conversas').update({ erro: `respostas_nps: ${error.message}` }).eq('id', c.id);
    return;
  }
  // O gatilho da respostas_nps já marca motos, avaliações e equipamentos; a oficina, não.
  for (const it of itens.filter((x) => x.tabela === 'atendimento_servicos')) {
    await db.from('atendimento_servicos').update({ nps_status: 'respondido' }).eq('id', it.id);
  }
}
