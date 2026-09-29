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
    .select('id, estoque_moto_id, estoque_tipo')
    .eq('atendimento_id', atendimentoId);

  const promises: PromiseLike<unknown>[] = [];
  for (const mi of motosInt || []) {
    if (mi.estoque_moto_id) {
      const tabela = (mi as any).estoque_tipo === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
      promises.push(
        supabase
          .from(tabela)
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
    // Além da situação geral, os status dos processos em andamento (pós-compra/
    // consignação/preparação) também viram "perdido" — sem isso ficavam presos
    // em 'em_aberto'/'aprovada'/etc. pra sempre, mesmo com o negócio morto.
    supabase.from('avaliacoes').update({
      situacao: 'perdido',
      pos_compra_status: 'perdido',
      consignacao_status: 'perdido',
      preparacao_status: 'perdido',
    } as never).eq('atendimento_id', atendimentoId).then((r) => r),
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

/**
 * Pedido do usuário, 2026-09-29: "Marcar como Perdido" dentro do Processo de
 * Pós-Compra/Consignação (moto própria ou consignada) — pra quando a
 * aquisição é abandonada ANTES da NF de entrada ser emitida. Diferente de
 * `marcarAtendimentoPerdido` (showroom, pré-venda): aqui a moto não é
 * revertida pra "disponível" nem apagada do estoque — ela já é a própria
 * aquisição em andamento, então vira "retirada" (mesmo efeito e mesma tela
 * que RetiradaDialog.tsx já usa no fluxo manual do Estoque), com o
 * atendimento e a avaliação marcados como perdidos e os processos em aberto
 * fechados. Tudo registrado em status_history.
 */
export const marcarAquisicaoRetirada = async (params: {
  avaliacaoId: string;
  atendimentoId: string;
  processoTable: 'consignacao_processos' | 'pos_compra_processos';
  statusField: 'consignacao_status' | 'pos_compra_status';
  motivo: string;
  user: UserLike | null | undefined;
  userName?: string | null;
}) => {
  const { avaliacaoId, atendimentoId, processoTable, statusField, motivo, user, userName } = params;
  const changed_by = user?.id ?? null;
  const changed_by_name = userName || user?.email || null;
  const obs = motivo?.trim() || null;

  const { data: estoqueItem } = await supabase.from('estoque_motos').select('id').eq('avaliacao_id', avaliacaoId).maybeSingle();
  if (estoqueItem?.id) {
    await supabase.from('estoque_motos').update({ status: 'retirada', observacoes: obs } as never).eq('id', estoqueItem.id);
    await supabase.from('status_history').insert({
      entity_type: 'estoque', entity_id: estoqueItem.id, status: 'RETIRADA',
      changed_by, changed_by_name, observacoes: obs,
    } as never);
  }

  await supabase.from('avaliacoes').update({ situacao: 'perdido', [statusField]: 'concluido' } as never).eq('id', avaliacaoId);
  await supabase.from('status_history').insert({
    entity_type: 'avaliacao', entity_id: avaliacaoId, status: 'RETIRADA',
    changed_by, changed_by_name, observacoes: obs,
  } as never);

  const { data: processos } = await supabase.from(processoTable).select('id').eq('avaliacao_id', avaliacaoId).eq('concluida', false);
  const now = new Date().toISOString();
  await Promise.all(((processos || []) as any[]).map((p) =>
    supabase.from(processoTable).update({ concluida: true, data_conclusao: now } as never).eq('id', p.id).then((r) => r),
  ));

  await supabase.from('atendimentos_motos').update({ situacao: 'perdido' } as never).eq('id', atendimentoId);
  await supabase.from('status_history').insert({
    entity_type: 'showroom', entity_id: atendimentoId, status: 'perdido',
    changed_by, changed_by_name, observacoes: obs,
  } as never);
};
