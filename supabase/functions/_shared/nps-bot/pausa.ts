// deno-lint-ignore-file no-explicit-any
// Pausa automática de um número do robô quando o WhatsApp dele cai (desconexão ou bloqueio)
// + alerta para a equipe pelo outro número. Os outros números seguem enviando.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as uaz from './uazapi.ts';

/** Pausa o número (instância) e avisa telefone_alerta. Só avisa na primeira vez. */
export async function pausarPorQueda(db: SupabaseClient, instancia: string, detalhe: string) {
  const { data: pausou } = await db.from('nps_bot_instancias')
    .update({ ativo: false, pausado_motivo: `WhatsApp fora do ar (${detalhe})`, pausado_at: new Date().toISOString(), falhas_conexao: 0, updated_at: new Date().toISOString() })
    .eq('id', instancia).eq('ativo', true).select('nome, telefone');
  if (!pausou?.length) return false; // já estava pausado: não repete o alerta

  const { data: cfg } = await db.from('nps_bot_config').select('telefone_alerta').maybeSingle();
  const telefone = cfg?.telefone_alerta;
  const { nome, telefone: numero } = pausou[0] as any;
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const texto =
    `⚠️ *Robô de NPS: número ${nome} pausado*\n\nO WhatsApp ${numero ?? ''} usado nas pesquisas caiu ou foi bloqueado (${detalhe}), em ${hora}.\n\n` +
    'Os envios por esse número foram *pausados automaticamente*; os outros números seguem enviando. Depois de reconectar, para retomar:\n' +
    `\`update nps_bot_instancias set ativo = true, pausado_motivo = null where id = '${instancia}';\``;
  if (telefone) {
    try { await uaz.enviarAviso(telefone, texto, instancia); } catch (e) {
      console.error('alerta de queda não enviado', e);
      await db.from('nps_bot_instancias').update({ pausado_motivo: `WhatsApp fora do ar (${detalhe}) — alerta não enviado: ${String(e).slice(0, 150)}` }).eq('id', instancia);
    }
  }
  return true;
}
