// deno-lint-ignore-file no-explicit-any
// Alertas do agente para quem tem agente_dados_usuarios.alertas = true (WhatsApp do próprio agente):
//   - custo do agente no mês passou de cada múltiplo de passo_custo_usd (US$ 10, 20, 30...);
//   - tamanho do banco passou do limite de atenção (lembrete semanal enquanto continuar acima).
// A chave em agente_dados_alertas impede repetir o mesmo alerta.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { conversaCom } from './whatsapp.ts';

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Registra o alerta; devolve true só na primeira vez (quem deve enviar). */
async function primeiraVez(db: SupabaseClient, chave: string, detalhe: string) {
  const { data } = await db.from('agente_dados_alertas').upsert({ chave, detalhe }, { onConflict: 'chave', ignoreDuplicates: true }).select('chave');
  return !!data?.length;
}

async function avisar(db: SupabaseClient, texto: string) {
  const { data: dest } = await db.from('agente_dados_usuarios').select('telefone').eq('ativo', true).eq('alertas', true);
  for (const d of dest ?? []) {
    try { await conversaCom(d.telefone).texto(texto); } catch (e) { console.error('alerta não enviado', e); }
  }
}

/** Semana ISO (AAAA-Www), para o lembrete semanal do banco. */
function semanaIso(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ano = t.getUTCFullYear();
  const semana = Math.ceil(((t.getTime() - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

export async function verificarAlertas(db: SupabaseClient, opts: { banco?: boolean } = {}) {
  const { data: cfg } = await db.from('agente_dados_config').select('*').maybeSingle();
  const passo = Number(cfg?.passo_custo_usd ?? 10);
  const limiteMb = Number(cfg?.limite_banco_mb ?? 400);
  const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const mes = `${agoraSP.getFullYear()}-${String(agoraSP.getMonth() + 1).padStart(2, '0')}`;

  // Custo do mês (Brasília).
  if (passo > 0) {
    const { data } = await db.from('agente_dados_log').select('custo_usd').gte('created_at', new Date(`${mes}-01T00:00:00-03:00`).toISOString()).limit(50000);
    const total = (data ?? []).reduce((t: number, x: any) => t + Number(x.custo_usd ?? 0), 0);
    const degrau = Math.floor(total / passo) * passo;
    if (degrau >= passo && await primeiraVez(db, `custo:${mes}:${degrau}`, `US$ ${total.toFixed(2)}`)) {
      await avisar(db, `*Aviso do Cérebro 299*\nO consumo do agente neste mês ultrapassou *US$ ${brl(degrau)}*. Total até agora: US$ ${brl(total)}.`);
    }
  }

  // Tamanho do banco (na verificação diária).
  if (opts.banco) {
    const { data: mb, error } = await db.rpc('agente_dados_tamanho_banco_mb');
    if (error) throw new Error(`tamanho do banco: ${error.message}`);
    const tamanho = Number(mb ?? 0);
    if (tamanho >= limiteMb && await primeiraVez(db, `banco:${limiteMb}:${semanaIso(agoraSP)}`, `${tamanho} MB`)) {
      await avisar(db, `*Aviso do Cérebro 299*\nO banco de dados atingiu o volume de atenção: *${brl(tamanho).replace(',00', '')} MB* (limite de atenção: ${limiteMb} MB). Vale avaliar limpeza de dados antigos ou ampliação do plano.`);
    }
  }
}
