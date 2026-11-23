// deno-lint-ignore-file no-explicit-any
// Motor da conversa do robô de NPS: abre a conversa, processa cada mensagem do cliente,
// fecha e grava em respostas_nps.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as uaz from './uazapi.ts';
import {
  abaixoDoNeutro, ESCALAS, type Item, montarPassos, opcoesDoPasso, type Passo, produtoDoItem,
  TEXTO_PEDIR_COMENTARIO, textoAbertura, textoAgradeceMotivo, textoFechamento, textoMotivo,
} from './roteiro.ts';
import { classificarComentarios, classificarSemIa, interpretarOpcao } from './ia.ts';

export interface LinhaFila {
  id: string; tabela: string; departamento: string; negociacao: string; loja: string; cidade: string;
  nome_exibicao: string; link_google: string | null; cliente_id: string | null; cliente: string | null; cliente_email: string | null;
  telefone_envio: string | null; chave_telefone: string | null; data_negociacao: string; ducati: boolean;
}

interface Resposta { valor: string; indice: number; motivo?: string }

const agora = () => new Date().toISOString();

/** Número (instância da uazapi) por onde a conversa anda: sempre o mesmo do início. */
const api = (c: { instancia?: string | null }) => uaz.cliente(c.instancia);

async function registrar(db: SupabaseClient, conversaId: string, direcao: 'enviada' | 'recebida', conteudo: string, extra: { message_id?: string | null; tipo?: string } = {}) {
  const { error } = await db.from('nps_bot_mensagens').insert({
    conversa_id: conversaId, direcao, conteudo, message_id: extra.message_id ?? null, tipo: extra.tipo ?? null,
  });
  return error;
}

// ------------------------------------------------------------------
// Abertura
// ------------------------------------------------------------------

// Histórico de movimentações, como o n8n registrava (autor "Setor de Inteligência").
const AUTOR_ID = '27aee000-5081-4bea-b249-ccab7e08cf66';
const AUTOR_NOME = 'Setor de Inteligência';
const HISTORICO: Record<string, { tabela: string; entity: string; comNome: boolean }> = {
  atendimentos_motos: { tabela: 'status_history', entity: 'showroom', comNome: true },
  avaliacoes: { tabela: 'status_history', entity: 'avaliacao', comNome: true },
  atendimento_equipamentos: { tabela: 'status_history_equipamentos', entity: 'atendimento_equipamento', comNome: false },
  atendimento_servicos: { tabela: 'status_history_servicos', entity: 'atendimento_servico', comNome: false },
};

export async function registrarHistorico(db: SupabaseClient, it: { id: string; tabela: string }, status: string, obs?: string) {
  const h = HISTORICO[it.tabela];
  if (!h) return;
  const linha: Record<string, unknown> = { entity_type: h.entity, entity_id: it.id, status, changed_by: AUTOR_ID, observacoes: obs ?? null };
  if (h.comNome) linha.changed_by_name = AUTOR_NOME;
  const { error } = await db.from(h.tabela).insert(linha);
  if (error) console.error('histórico', it.tabela, it.id, status, error.message);
}

/** O WhatsApp do robô caiu (incerto = a uazapi não respondeu; pode ser só rede). */
export class WhatsappForaDoAr extends Error {
  constructor(msg: string, public incerto = false) { super(msg); }
}

/** Marca o atendimento como enviado (sai da fila) e registra no histórico. */
async function marcarEnviados(db: SupabaseClient, itens: { id: string; tabela: string }[], status: string, obs: string | undefined, conversaId: string | null) {
  for (const it of itens) {
    const { error: e } = await db.from(it.tabela).update({ nps_status: 'enviado', nps_enviado_at: agora() }).eq('id', it.id);
    if (e) {
      console.error('marcar enviado', it.tabela, it.id, e.message);
      if (conversaId) await db.from('nps_bot_conversas').update({ erro: `marcar enviado ${it.tabela} ${it.id}: ${e.message}` }).eq('id', conversaId);
    }
    await registrarHistorico(db, it, status, obs);
  }
}

/**
 * Abre a conversa para um cliente (todas as linhas da fila com o mesmo telefone).
 * Telefone inválido ou sem WhatsApp: registra "NPS NÃO ENVIADO" e tira da fila (como o n8n).
 * Se o envio falhar porque o WhatsApp do robô caiu, lança WhatsappForaDoAr e não mexe nos atendimentos.
 */
export async function abrirConversa(
  db: SupabaseClient, linhas: LinhaFila[],
  opts: { teste: boolean; telefoneTeste?: string; instancia?: string; retomada?: boolean },
) {
  const wa = uaz.cliente(opts.instancia);
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

  if (!telefone) {
    if (!opts.teste) await marcarEnviados(db, itens, 'NPS NÃO ENVIADO', 'Telefone inválido no cadastro', null);
    return null;
  }
  let existe: boolean;
  try {
    existe = await wa.temWhatsapp(telefone);
  } catch (e) {
    const st = await wa.whatsappConectado();
    if (!st.conectado) throw new WhatsappForaDoAr(st.detalhe, st.incerto);
    throw e;
  }
  if (!existe) {
    if (!opts.teste) await marcarEnviados(db, itens, 'NPS NÃO ENVIADO', 'Número sem WhatsApp', null);
    return null;
  }

  const chave = telefone.slice(2, 4) + telefone.slice(-8);
  const { data: conversa, error } = await db.from('nps_bot_conversas').insert({
    telefone, chave_telefone: chave, cliente_id: p0.cliente_id, cliente_nome: p0.cliente, cliente_email: p0.cliente_email,
    loja: principal.loja, itens, passos, status: 'enviada', teste: opts.teste, instancia: wa.instancia,
  }).select('*').single();
  if (error) throw error;

  // Cliente que já tinha tocado em "Iniciar!" numa pesquisa que travou: vai direto à 1ª pergunta.
  if (opts.retomada) {
    try {
      await retomarConversa(db, conversa);
    } catch (e) {
      await db.from('nps_bot_conversas').delete().eq('id', conversa.id);
      throw e;
    }
    if (!opts.teste) await marcarEnviados(db, itens, 'NPS ENVIADO', 'Pesquisa retomada pelo robô de NPS', conversa.id);
    return conversa.id as string;
  }

  const texto = textoAbertura(p0.cliente, itens, principal, passos.length);
  try {
    const r = await wa.enviarBotoes(telefone, texto, [{ texto: 'Iniciar!', id: 'iniciar' }], uaz.digitando(800, 1500));
    await db.from('nps_bot_conversas').update({ chatid: r.chatid }).eq('id', conversa.id);
    await registrar(db, conversa.id, 'enviada', texto, { message_id: r.messageId, tipo: 'abertura' });
  } catch (e) {
    const st = await wa.whatsappConectado();
    if (!st.conectado) {
      // Caiu: apaga a conversa e deixa os atendimentos na fila para quando voltar.
      await db.from('nps_bot_conversas').delete().eq('id', conversa.id);
      throw new WhatsappForaDoAr(st.detalhe, st.incerto);
    }
    await db.from('nps_bot_conversas').update({ status: 'erro', erro: String(e).slice(0, 500) }).eq('id', conversa.id);
    if (!opts.teste) await marcarEnviados(db, itens, 'NPS NÃO ENVIADO', 'Falha no envio pelo WhatsApp', conversa.id);
    return null;
  }

  if (!opts.teste) await marcarEnviados(db, itens, 'NPS ENVIADO', undefined, conversa.id);
  return conversa.id as string;
}

/**
 * Retoma uma pesquisa em que o cliente já tocou em "Iniciar!" (ou já respondeu alguma pergunta)
 * mas o robô não recebeu, porque o WhatsApp estava fora. Pede desculpas e segue de onde parou:
 * sem botaoId, manda a 1ª pergunta; com botaoId (resposta que se perdeu), aplica a resposta e segue.
 */
export async function retomarConversa(db: SupabaseClient, c: any, botaoId?: string | null) {
  const nome = String(c.cliente_nome ?? '').trim().split(/\s+/)[0] ?? '';
  const primeiro = nome ? nome[0].toUpperCase() + nome.slice(1).toLowerCase() : '';
  const desculpa = `Olá${primeiro ? `, ${primeiro}` : ''}! Desculpe a demora: tivemos uma instabilidade no nosso WhatsApp e não recebemos a sua resposta. Vamos continuar de onde paramos? 🙏`;
  const base = { ...c, status: 'em_andamento', passo_atual: 0, aguardando: 'opcao', respostas: c.respostas ?? {}, erro: null };
  await db.from('nps_bot_conversas').update({
    status: 'em_andamento', passo_atual: 0, aguardando: 'opcao', erro: null, ultima_interacao_at: agora(),
  }).eq('id', c.id);
  if (!botaoId) {
    await enviarPasso(db, base, 0, desculpa);
    return;
  }
  const t = await api(c).enviarTexto(c.telefone, desculpa);
  await registrar(db, c.id, 'enviada', desculpa, { message_id: t.messageId });
  await processarMensagem(db, base, { messageId: null, botaoId, texto: null, audio: false, tipo: 'retomada' });
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
    ? await api(c).enviarLista(c.telefone, texto, 'Selecione uma das opções', 'Nota', opcoesDoPasso(passo, indice))
    : await api(c).enviarBotoes(c.telefone, texto, opcoesDoPasso(passo, indice));
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

async function textoDaEntrada(e: Entrada, db?: SupabaseClient, conversaId?: string, instancia?: string | null): Promise<string | null> {
  if (e.texto?.trim()) return e.texto.trim();
  if (e.audio && e.messageId) {
    try {
      const t = await uaz.cliente(instancia).transcreverAudio(e.messageId);
      // Guarda a transcrição no registro da mensagem (auditoria).
      if (t && db) await db.from('nps_bot_mensagens').update({ conteudo: `[áudio] ${t}` }).eq('message_id', e.messageId).eq('direcao', 'recebida');
      return t;
    } catch (err) {
      console.error('transcrição', err);
      if (db && conversaId) await db.from('nps_bot_conversas').update({ erro: `transcrição: ${String(err).slice(0, 300)}` }).eq('id', conversaId);
    }
  }
  return null;
}

/** Espera (ms) depois da última mensagem do cliente antes de seguir, no texto livre. */
const AGRUPAR_MS = 20_000;

/**
 * Junta as mensagens que o cliente mandou desde a última pergunta do robô (textos e áudios
 * transcritos). Devolve null se esta não é a mensagem mais recente — a mais nova é que processa.
 */
async function textoAgrupado(db: SupabaseClient, conversaId: string, meuId: string | null): Promise<string | null> {
  const { data: ultima } = await db.from('nps_bot_mensagens').select('message_id')
    .eq('conversa_id', conversaId).eq('direcao', 'recebida').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (meuId && ultima?.message_id && ultima.message_id !== meuId) return null;
  const { data: pergunta } = await db.from('nps_bot_mensagens').select('created_at')
    .eq('conversa_id', conversaId).eq('direcao', 'enviada').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let q = db.from('nps_bot_mensagens').select('conteudo').eq('conversa_id', conversaId).eq('direcao', 'recebida');
  if (pergunta?.created_at) q = q.gt('created_at', pergunta.created_at);
  const { data: msgs } = await q.order('created_at');
  return (msgs ?? [])
    .map((m: any) => String(m.conteudo ?? '').trim())
    .map((t) => (t.startsWith('[áudio] ') ? t.slice(8).trim() : t))
    .filter((t) => t && !t.startsWith('['))
    .join(' ');
}

export async function processarMensagem(db: SupabaseClient, c: any, e: Entrada) {
  const n = normalizar(e.texto ?? '');
  if (n && OPTOUT.test(n)) {
    await db.from('nps_bot_optout').upsert({ chave_telefone: c.chave_telefone, telefone: c.telefone });
    await db.from('nps_bot_conversas').update({ status: 'optout', ultima_interacao_at: agora() }).eq('id', c.id);
    const t = 'Tudo bem, não enviaremos mais pesquisas para este número. Obrigado!';
    const r = await api(c).enviarTexto(c.telefone, t);
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
    const proprio = await textoDaEntrada(e, db, c.id, c.instancia);
    if (!proprio) {
      const t = e.audio
        ? 'Não consegui ouvir o seu áudio 😕 Pode escrever em uma mensagem, por favor?'
        : 'Pode escrever em uma mensagem, por favor?';
      const r = await api(c).enviarTexto(c.telefone, t);
      await registrar(db, c.id, 'enviada', t, { message_id: r.messageId });
      return;
    }
    // O cliente pode mandar o relato em várias mensagens: espera ele terminar e junta tudo.
    await new Promise((ok) => setTimeout(ok, AGRUPAR_MS));
    const juntado = await textoAgrupado(db, c.id, e.messageId);
    if (juntado === null) return; // chegou mensagem mais nova: ela é quem segue a conversa
    const { data: atual } = await db.from('nps_bot_conversas').select('status, aguardando, passo_atual').eq('id', c.id).single();
    if (!atual || atual.status !== 'em_andamento' || atual.aguardando !== c.aguardando || atual.passo_atual !== c.passo_atual) return;
    const texto = juntado || proprio;
    if (c.aguardando === 'motivo') {
      respostas[passo.chave] = { ...respostas[passo.chave], motivo: texto };
      // Agradece o relato antes da próxima pergunta.
      await avancar(db, c, respostas, i + 1, textoAgradeceMotivo());
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
      const texto = await textoDaEntrada(e, db, c.id, c.instancia);
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
      const pedido = passo.textoPedido ?? TEXTO_PEDIR_COMENTARIO;
      const r = await api(c).enviarTexto(c.telefone, pedido);
      await registrar(db, c.id, 'enviada', pedido, { message_id: r.messageId });
    } else {
      await finalizar(db, { ...c, respostas });
    }
    return;
  }

  const label = passo.tipo === 'nps' ? String(valor) : ESCALAS[passo.escala!][valor];
  respostas[passo.chave] = { valor: label, indice: valor };
  // Pergunta o motivo só na PRIMEIRA resposta abaixo de "Neutro" da conversa.
  const jaPerguntouMotivo = Object.values(respostas).some((r: any) => r && typeof r === 'object' && 'motivo' in r);
  if (abaixoDoNeutro(passo, valor) && !jaPerguntouMotivo) {
    await db.from('nps_bot_conversas').update({ respostas, aguardando: 'motivo', ultima_interacao_at: agora() }).eq('id', c.id);
    const t = textoMotivo(passo);
    const r = await api(c).enviarTexto(c.telefone, t);
    await registrar(db, c.id, 'enviada', t, { message_id: r.messageId });
    return;
  }
  await avancar(db, c, respostas, i + 1);
}

async function avancar(db: SupabaseClient, c: any, respostas: Record<string, any>, proximo: number, prefixo?: string) {
  await db.from('nps_bot_conversas').update({ respostas, passo_atual: proximo, aguardando: 'opcao', ultima_interacao_at: agora() }).eq('id', c.id);
  await enviarPasso(db, { ...c, respostas, passo_atual: proximo }, proximo, prefixo);
}

// ------------------------------------------------------------------
// Fechamento e gravação
// ------------------------------------------------------------------

const DESCR_PRODUTO: Record<string, string> = { moto: 'compra de moto', equipamento: 'compra de equipamento', servico: 'serviço da oficina' };
const descricaoItem = (it: Item) =>
  it.negociacao === 'PERDIDO'
    ? `negociação não concluída (${it.departamento.toLowerCase()})`
    : it.produto ? DESCR_PRODUTO[it.produto] : `avaliação/compra da moto do cliente (${it.negociacao.toLowerCase()})`;

/** Separa os textos abertos do cliente (motivos de nota baixa e comentário final) por atendimento. */
export async function classificar(c: any, opts: { lancarErro?: boolean } = {}) {
  const itens: Item[] = c.itens;
  const passos: Passo[] = c.passos;
  const respostas: Record<string, any> = c.respostas ?? {};
  const trechos = passos.flatMap((p) => {
    const r = respostas[p.chave];
    if (!r) return [];
    const txt = p.chave === 'comentario' ? r.texto : r.motivo;
    return txt ? [{ pergunta: p.texto.replace(/\*/g, ''), resposta: p.chave === 'comentario' ? undefined : r.valor, texto: txt, itens: p.itens, motivo: p.chave !== 'comentario' }] : [];
  });
  const resumo = itens.map((it) => ({ id: it.id, descricao: descricaoItem(it) }));
  try {
    return await classificarComentarios(resumo, trechos); // sem trechos, não chama a IA
  } catch (e) {
    console.error('classificação IA', e);
    if (opts.lancarErro) throw e;
    return classificarSemIa(resumo, trechos);
  }
}

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
    const [{ data: cfg }, { data: loja }] = await Promise.all([
      db.from('nps_bot_config').select('link_portal_ducati').maybeSingle(),
      db.from('nps_bot_lojas').select('instagram').eq('loja', principal.loja).maybeSingle(),
    ]);
    const f = textoFechamento(nota, itens, principal, {
      google: principal.link_google ?? null, portalDucati: cfg?.link_portal_ducati ?? '', instagram: loja?.instagram ?? null,
    }, c.cliente_email);
    try {
      const r = await api(c).enviarTexto(c.telefone, f.texto, { linkPreview: f.linkPreview });
      await registrar(db, c.id, 'enviada', f.texto, { message_id: r.messageId, tipo: 'fechamento' });
    } catch (e) { console.error('fechamento', e); }
  }

  const classif = await classificar(c);

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
  for (const it of itens) await registrarHistorico(db, it, 'NPS RESPONDIDO', 'Respondido pelo robô de NPS (WhatsApp)');
  // O gatilho da respostas_nps já marca motos, avaliações e equipamentos; a oficina, não.
  for (const it of itens.filter((x) => x.tabela === 'atendimento_servicos')) {
    await db.from('atendimento_servicos').update({ nps_status: 'respondido' }).eq('id', it.id);
  }
}
