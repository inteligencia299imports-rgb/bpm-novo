import { supabase } from '@/integrations/supabase/client';

/**
 * Voucher Equipamentos -> CRM (migration 20261018120000_voucher_equipamentos_crm).
 * As RPCs não estão nos tipos gerados do Supabase; o cast fica isolado aqui.
 */

export interface VendedorEquipamentos {
  user_id: string;
  nome: string;
}

/** Agregado de voucher que pode virar atendimento no CRM. */
export const ehVoucherEquipamentos = (descricao: string | null | undefined) =>
  String(descricao ?? '').trim().toLowerCase() === 'voucher equipamentos';

type RpcResult<T> = { data: T | null; error: { message: string } | null };
const rpc = <T>(fn: string, args: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never) as unknown as Promise<RpcResult<T>>;

export interface VoucherCrmStatus {
  id: string;
  status: string;
  vendedor_id: string;
  vendedor_nome: string | null;
  voucher_valor: number | null;
}

/** Vendedores de equipamentos (CRM) da loja do atendimento. Vazio fora de Ducati BSB/FLN/POA. */
export async function listarVendedoresEquipamentos(atendimentoMotoId: string): Promise<VendedorEquipamentos[]> {
  const { data } = await rpc<VendedorEquipamentos[]>('voucher_vendedores_equipamentos', { _atendimento_moto_id: atendimentoMotoId });
  return (data ?? []).map((v) => ({ user_id: v.user_id, nome: v.nome }));
}

/** Atendimento de equipamentos vinculado ao atendimento de moto, ou null. */
export async function statusVoucherEquipamentos(atendimentoMotoId: string): Promise<VoucherCrmStatus | null> {
  const { data } = await rpc<VoucherCrmStatus>('voucher_equipamentos_status', { _atendimento_moto_id: atendimentoMotoId });
  return data ?? null;
}

/**
 * Cria/atualiza o atendimento do voucher no CRM (vendedorId preenchido) ou
 * encerra o que estiver em aberto (vendedorId null). Erro = mensagem do banco.
 */
export async function sincronizarVoucherEquipamentos(
  atendimentoMotoId: string,
  vendedorId: string | null,
  valor: number | null,
): Promise<RpcResult<{ id: string; status: string }>> {
  return rpc('sincronizar_voucher_equipamentos', {
    _atendimento_moto_id: atendimentoMotoId,
    _vendedor_id: vendedorId,
    _valor: valor,
  });
}
