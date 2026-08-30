import { supabase } from '@/lib/supabase';

interface UserLike {
  id?: string;
  email?: string | null;
}

/**
 * Reverte para "disponível" as motos de estoque que estavam vinculadas à venda
 * deste atendimento (mesma lógica inline de AtendimentoDetail no branch "perdido").
 */
export const reverterEstoqueDoAtendimento = async (atendimentoId: string) => {
  const { data: motosInt } = await supabase
    .from('motos_interesse')
    .select('id, estoque_moto_id')
    .eq('atendimento_id', atendimentoId);

  const promises: PromiseLike<unknown>[] = [];
  for (const mi of motosInt || []) {
    if (mi.estoque_moto_id) {
      promises.push(
        supabase
          .from('estoque_motos')
          .update({
            status: 'disponivel',
            atendimento_venda_id: null,
            data_venda: null,
            valor_venda: null,
            valor_sinal: null,
          })
          .eq('id', mi.estoque_moto_id)
          .eq('atendimento_venda_id', atendimentoId)
          .then((r) => r),
      );
    }
  }
  await Promise.all(promises);
};

/**
 * Marca o atendimento e todas as suas avaliações como "perdido", registra no
 * histórico (avaliação + showroom) e reverte o estoque vinculado.
 * Segue a mesma estrutura de "marcar como perdido" do showroom.
 */
export const marcarAtendimentoPerdido = async (params: {
  atendimentoId: string;
  motivo: string;
  user: UserLike | null | undefined;
  userName?: string | null;
}) => {
  const { atendimentoId, motivo, user, userName } = params;
  const changed_by = user?.id ?? null;
  const changed_by_name = userName || user?.email || null;
  const obs = motivo?.trim() || null;

  const { data: avaliacoesData } = await supabase
    .from('avaliacoes')
    .select('id')
    .eq('atendimento_id', atendimentoId);

  const promises: PromiseLike<unknown>[] = [
    supabase.from('atendimentos_motos').update({ situacao: 'perdido' }).eq('id', atendimentoId).then((r) => r),
    supabase.from('avaliacoes').update({ situacao: 'perdido' }).eq('atendimento_id', atendimentoId).then((r) => r),
    // Remove do estoque eventuais motos de troca que entraram por este atendimento.
    ...(avaliacoesData || []).map((av) =>
      supabase.from('estoque_motos').delete().eq('avaliacao_id', av.id).then((r) => r),
    ),
    supabase.from('status_history').insert({
      entity_type: 'showroom',
      entity_id: atendimentoId,
      status: 'perdido',
      changed_by,
      changed_by_name,
      observacoes: obs,
    } as never).then((r) => r),
  ];

  for (const av of avaliacoesData || []) {
    promises.push(
      supabase.from('status_history').insert({
        entity_type: 'avaliacao',
        entity_id: av.id,
        status: 'perdido',
        changed_by,
        changed_by_name,
        observacoes: obs,
      } as never).then((r) => r),
    );
  }

  await Promise.all(promises);
  await reverterEstoqueDoAtendimento(atendimentoId);
};
