// deno-lint-ignore-file no-explicit-any
// Aviso aos gerentes/responsáveis a cada resposta de NPS (layout do aviso antigo do n8n).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as uaz from './uazapi.ts';
import { ESCALAS } from './roteiro.ts';

export interface DadosResposta {
  respostaId: string;
  loja: string;
  departamento: string;      // como vem da vw_nps (DUCATI = showroom Ducati)
  status: string | null;     // vendido | perdido | adquirido ...
  cliente: string | null;
  telefone: string | null;
  modelo: string | null;
  responsavel: string | null;
  atendimento: string | null;
  outros_setores: string | null;
  produto: string | null;
  experiencia: string | null;
  nps: string | null;
  melhorias: string | null;
  comentario: string | null;
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);
/** "Vitor de Souza Abreu" → "Vitor Souza" (primeiro nome + primeiro sobrenome, sem de/da/do). */
export function nomeCurto(nome: string | null): string | null {
  const p = (nome ?? '').trim().split(/\s+/).filter((x) => x && !PARTICULAS.has(x.toLowerCase()));
  if (!p.length) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return p.slice(0, 2).map(cap).join(' ');
}

/** Departamento da regra de destinatários (a vw_nps chama o showroom Ducati de DUCATI). */
export const departamentoBase = (d: string) => (d === 'DUCATI' ? 'SHOWROOM' : d);

// vw_nps: SHOWROOM = seminovas; DUCATI = Ducati 0km.
const ROTULO_DEPTO: Record<string, string> = {
  SHOWROOM: 'Seminovas', DUCATI: 'Ducati 0km', AVALIAÇÃO: 'Avaliação', EQUIPAMENTOS: 'Equipamentos', OFICINA: 'Oficina',
};

/**
 * "Ducati 0km (FLN)", "Seminovas (299i)", "Oficina (Ducati BSB)": departamento + loja.
 * Se o rótulo já diz "Ducati", a loja sai sem o "Ducati " repetido.
 */
export function rotuloDepartamento(d: Pick<DadosResposta, 'departamento' | 'loja'>): string {
  const rotulo = ROTULO_DEPTO[d.departamento] ?? ROTULO_DEPTO[departamentoBase(d.departamento)] ?? d.departamento;
  if (!d.loja) return rotulo;
  const loja = rotulo.includes('Ducati') ? d.loja.replace(/^Ducati\s+/i, '') : d.loja;
  return `${rotulo} (${loja})`;
}

/** (61) 99108-8509 / (51) 8026-5285 — aceita com ou sem o 55. */
export function mascaraTelefone(tel: string | null): string {
  let d = (tel ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '-';
}

const abaixoNeutro = (v: string | null) => {
  if (!v) return false;
  return Object.values(ESCALAS).some((esc) => esc.indexOf(v) >= 3);
};

/** Precisa de atenção: nota 0–6, alguma resposta abaixo de "Neutro" ou texto em melhorias. */
export function precisaAtencao(d: DadosResposta): boolean {
  const nota = d.nps != null && d.nps !== '' ? Number(d.nps) : null;
  return (nota != null && nota <= 6)
    || [d.atendimento, d.outros_setores, d.produto, d.experiencia].some(abaixoNeutro)
    || !!d.melhorias?.trim();
}

export function montarMensagem(nomeDestinatario: string, d: DadosResposta): string {
  const depto = departamentoBase(d.departamento);
  const perdido = (d.status ?? '').toLowerCase() === 'perdido';
  const nota = d.nps != null && d.nps !== '' ? Number(d.nps) : null;
  const atencao = precisaAtencao(d);

  // Perdido: a chamada diz que é venda/atendimento perdido (oficina e avaliação = atendimento).
  const tipoPerdido = depto === 'OFICINA' || depto === 'AVALIAÇÃO' ? 'atendimento perdido' : 'venda perdida';
  let chamada: string;
  if (perdido && atencao) chamada = `Um feedback de *${tipoPerdido}* para *${d.loja}* precisa da sua atenção:`;
  else if (perdido) chamada = `Chegou um feedback de *${tipoPerdido}* para *${d.loja}*:`;
  else if (atencao) chamada = `Um feedback para *${d.loja}* precisa da sua atenção:`;
  else if (nota != null && nota >= 9) chamada = `Um cliente *promotor* deixou um feedback para *${d.loja}*!`;
  else chamada = `Chegou um novo feedback para *${d.loja}*:`;

  const linhas = [
    `Olá, *${nomeDestinatario}*!`,
    '',
    chamada,
    '',
    `*Cliente:* ${d.cliente ?? '-'}`,
    `*Telefone:* ${mascaraTelefone(d.telefone)}`,
    `*Departamento:* ${rotuloDepartamento(d)}`,
  ];
  // Moto só em showroom e avaliação (equipamentos e oficina não levam produto).
  if ((depto === 'SHOWROOM' || depto === 'AVALIAÇÃO') && d.modelo) linhas.push(`*Moto:* ${d.modelo.toUpperCase()}`);
  const resp = nomeCurto(d.responsavel);
  if (resp) linhas.push(`*Responsável:* ${resp}`);

  linhas.push('', `*NPS:* ${d.nps ?? '-'}`);
  const baixas = ([
    ['Atendimento', d.atendimento], ['Outros setores', d.outros_setores], ['Produto/serviço', d.produto], ['Experiência', d.experiencia],
  ] as const).filter(([, v]) => abaixoNeutro(v)).map(([k, v]) => `${k}: ${v}`);
  if (baixas.length) linhas.push(`*Respostas negativas:* ${baixas.join('; ')}`);
  if (d.melhorias?.trim()) linhas.push(`*Melhorias:* ${d.melhorias.trim()}`);
  if (d.comentario?.trim()) linhas.push(`*Comentário:* ${d.comentario.trim()}`);
  return linhas.join('\n');
}

/** Destinatários de uma resposta (um por telefone). */
export async function destinatarios(db: SupabaseClient, d: DadosResposta) {
  const { data } = await db.from('nps_bot_destinatarios').select('*').eq('ativo', true);
  const depto = departamentoBase(d.departamento);
  const atencao = precisaAtencao(d);
  const porTelefone = new Map<string, { nome: string; telefone: string }>();
  for (const r of data ?? []) {
    if (r.lojas?.length && !r.lojas.includes(d.loja)) continue;
    if (r.departamentos?.length && !r.departamentos.includes(depto)) continue;
    if (r.so_atencao && !atencao) continue;
    if (!porTelefone.has(r.telefone)) porTelefone.set(r.telefone, { nome: r.nome, telefone: r.telefone });
  }
  return [...porTelefone.values()];
}

/** Dados de uma resposta gravada (respostas_nps + vw_nps). */
export async function carregarResposta(db: SupabaseClient, respostaId: string): Promise<DadosResposta | null> {
  const { data: r } = await db.from('respostas_nps').select('*').eq('id', respostaId).maybeSingle();
  if (!r) return null;
  return await juntarComAtendimento(db, r.atendimento_id, { ...r, comentario: r.espaco_livre, respostaId: r.id });
}

export async function juntarComAtendimento(db: SupabaseClient, atendimentoId: string, r: any): Promise<DadosResposta | null> {
  const { data: v } = await db.from('vw_nps')
    .select('status, loja, nome_cliente, telefone, vendedor, modelo, departamento')
    .eq('id_atendimento', atendimentoId).limit(1).maybeSingle();
  if (!v) return null;
  return {
    respostaId: r.respostaId,
    loja: v.loja, departamento: v.departamento, status: v.status, cliente: v.nome_cliente, telefone: v.telefone,
    modelo: v.modelo, responsavel: v.vendedor,
    atendimento: r.atendimento ?? null, outros_setores: r.outros_setores ?? null, produto: r.produto ?? null,
    experiencia: r.experiencia ?? null, nps: r.nps ?? null, melhorias: r.melhorias ?? null, comentario: r.comentario ?? null,
  };
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Envia para cada destinatário, uma vez por telefone (registro em nps_bot_notificacoes). */
export async function notificar(db: SupabaseClient, d: DadosResposta, lista: { nome: string; telefone: string }[], opts: { registrar: boolean }) {
  const atencao = precisaAtencao(d);
  const enviados: string[] = [];
  for (const [i, p] of lista.entries()) {
    if (opts.registrar) {
      const { error } = await db.from('nps_bot_notificacoes').insert({ resposta_id: d.respostaId, telefone: p.telefone, nome: p.nome, atencao });
      if (error) continue; // já avisado
    }
    try {
      if (i > 0) await espera(3000 + Math.random() * 4000);
      await uaz.enviarTexto(p.telefone, montarMensagem(p.nome, d));
      enviados.push(p.nome);
    } catch (e) {
      console.error('notificar', p.telefone, e);
      if (opts.registrar) await db.from('nps_bot_notificacoes').update({ erro: String(e).slice(0, 300) }).eq('resposta_id', d.respostaId).eq('telefone', p.telefone);
    }
  }
  return enviados;
}
