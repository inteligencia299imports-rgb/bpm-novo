import { supabase } from '@/lib/supabase';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';

/** Avaliação no formato que o PreparacaoProcessoDialog espera (avaliacaoData). */
export async function carregarItemPreparacao(avaliacaoId: string): Promise<any | null> {
  const { data: raw } = await supabase.from('avaliacoes')
    .select(`*, ${MARCA_MODELO_SELECT}, atendimentos_motos!avaliacoes_atendimento_id_fkey!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, tipo_pessoa, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro)))`)
    .eq('id', avaliacaoId).single();
  const data = raw ? flattenMarcaModelo(raw as any) : null;
  if (!data) return null;
  const am = (data as any).atendimentos_motos;
  return { ...data, atendimento: { ...am, loja: am?.loja_empresas?.loja }, moto: data };
}
