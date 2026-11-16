import { supabase } from '@/integrations/supabase/client';

/**
 * Voucher Equipamentos -> CRM (migrations 20261018120000_voucher_equipamentos_crm e
 * 20261116120000_voucher_equipamentos_multiplos: N vouchers por proposta, um
 * atendimento no CRM para cada).
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

/** Vendedores de equipamentos (CRM) disponíveis para o voucher. Vazio = loja sem voucher para o CRM. */
export async function listarVendedoresEquipamentos(atendimentoMotoId: string): Promise<VendedorEquipamentos[]> {
  const { data } = await rpc<VendedorEquipamentos[]>('voucher_vendedores_equipamentos', { _atendimento_moto_id: atendimentoMotoId });
  return (data ?? []).map((v) => ({ user_id: v.user_id, nome: v.nome }));
}

/** Atendimentos de equipamentos (um por voucher) vinculados ao atendimento de moto. */
export async function statusVouchersEquipamentos(atendimentoMotoId: string): Promise<VoucherCrmStatus[]> {
  const { data } = await rpc<VoucherCrmStatus[]>('vouchers_equipamentos_status', { _atendimento_moto_id: atendimentoMotoId });
  return data ?? [];
}

export interface VoucherDirecionado {
  vendedor_id: string;
  valor: number;
}

/**
 * Sincroniza os vouchers da proposta com o CRM: um atendimento por voucher
 * (cria/atualiza); os que saíram da proposta e ainda estão em aberto viram
 * perdido. Lista vazia encerra todos. Erro = mensagem do banco.
 */
export async function sincronizarVouchersEquipamentos(
  atendimentoMotoId: string,
  vouchers: VoucherDirecionado[],
): Promise<RpcResult<{ id: string; status: string }[]>> {
  return rpc('sincronizar_vouchers_equipamentos', {
    _atendimento_moto_id: atendimentoMotoId,
    _vouchers: vouchers,
  });
}
