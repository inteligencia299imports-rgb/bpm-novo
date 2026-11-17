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

/**
 * Lojas do CRM x vendedores disponíveis para o voucher (migration
 * 20261117170000_voucher_equipamentos_loja): uma linha por loja x vendedor. Na proposta o
 * usuário escolhe a loja e depois o vendedor — os vendedores são filtrados pela loja.
 * padrao = loja sugerida (0km: a loja Ducati da venda). Vazio = venda sem voucher para o CRM.
 */
export interface LojaVendedorVoucher {
  loja_id: string;
  loja: string;
  padrao: boolean;
  user_id: string;
  nome: string;
}

export async function listarLojasVendedoresVoucher(atendimentoMotoId: string): Promise<LojaVendedorVoucher[]> {
  const { data } = await rpc<LojaVendedorVoucher[]>('voucher_lojas_vendedores', { _atendimento_moto_id: atendimentoMotoId });
  return data ?? [];
}

/** Lojas distintas da lista (ordem alfabética, a sugerida primeiro). */
export function lojasDoVoucher(linhas: LojaVendedorVoucher[]): { loja_id: string; loja: string; padrao: boolean }[] {
  const m = new Map<string, { loja_id: string; loja: string; padrao: boolean }>();
  for (const l of linhas) if (!m.has(l.loja_id)) m.set(l.loja_id, { loja_id: l.loja_id, loja: l.loja, padrao: l.padrao });
  return [...m.values()].sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.loja.localeCompare(b.loja, 'pt-BR'));
}

/** Vendedores de uma loja (vazio sem loja escolhida). */
export function vendedoresDaLoja(linhas: LojaVendedorVoucher[], lojaId: string | null | undefined): VendedorEquipamentos[] {
  if (!lojaId) return [];
  return linhas.filter((l) => l.loja_id === lojaId).map((l) => ({ user_id: l.user_id, nome: l.nome }));
}

/** @deprecated Use listarLojasVendedoresVoucher (loja > vendedor). Vendedores de equipamentos (CRM) disponíveis para o voucher. */
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
  /** Loja do CRM escolhida na proposta (loja_empresas, sistema equipamentos). */
  loja_id?: string | null;
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
