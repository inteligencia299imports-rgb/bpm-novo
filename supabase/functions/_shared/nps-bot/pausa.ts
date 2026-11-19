// deno-lint-ignore-file no-explicit-any
// Pausa automática do robô quando o WhatsApp cai (desconexão ou bloqueio) + alerta para a equipe.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as uaz from './uazapi.ts';

/** Pausa os envios (ativo = false) e avisa telefone_alerta. Só avisa na primeira vez. */
export async function pausarPorQueda(db: SupabaseClient, detalhe: string) {
  const { data: pausou } = await db.from('nps_bot_config')
    .update({ ativo: false, pausado_motivo: `WhatsApp fora do ar (${detalhe})`, pausado_at: new Date().toISOString(), falhas_conexao: 0 })
    .eq('id', true).eq('ativo', true).select('telefone_alerta');
  if (!pausou?.length) return false; // já estava pausado: não repete o alerta

  const telefone = pausou[0].telefone_alerta;
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const texto =
    `⚠️ *Robô de NPS pausado*\n\nO WhatsApp usado nas pesquisas caiu ou foi bloqueado (${detalhe}), em ${hora}.\n\n` +
    'Os envios foram *pausados automaticamente*. Depois de reconectar o número, para retomar:\n' +
    '`update nps_bot_config set ativo = true, pausado_motivo = null;`';
  if (telefone) {
    try { await uaz.enviarAlerta(telefone, texto); } catch (e) {
      console.error('alerta de queda não enviado', e);
      await db.from('nps_bot_config').update({ pausado_motivo: `WhatsApp fora do ar (${detalhe}) — alerta não enviado: ${String(e).slice(0, 150)}` }).eq('id', true);
    }
  }
  return true;
}
