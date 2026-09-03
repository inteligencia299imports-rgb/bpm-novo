import { supabase } from '@/lib/supabase';
import { generateContratoCompraPdf } from '@/lib/generateContratoCompraPdf';
import { flattenMarcaModelo } from '@/lib/marcaModelo';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlOrDash = (n: number | null | undefined) => (n ? brl(n) : '-');

const fmtTelefone = (v: string | null | undefined) => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
};

const fmtCpfCnpj = (v: string | null | undefined) => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v || '-';
};

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
};

/**
 * Monta os dados do contrato de compra a partir do que está gravado no banco
 * (avaliação + atendimento/cliente + contrato + custos) e gera o PDF.
 * Usado para Visualizar / Baixar um contrato já gerado.
 */
export async function gerarPdfContratoCompra(avaliacaoId: string, modo: 'download' | 'view'): Promise<boolean> {
  const { data: avalRaw } = await supabase
    .from('avaliacoes')
    .select(`
      id, marca:marca_id(nome), modelo:modelo_id(nome), ano_fabricacao, ano_modelo, placa, km,
      valor_fechamento, valor_quitacao, atendimento_id,
      atendimentos_motos ( id, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(nome_razao_social, telefone, cpf_cnpj) )
    `)
    .eq('id', avaliacaoId)
    .maybeSingle();

  if (!avalRaw) return false;
  const aval = flattenMarcaModelo(avalRaw as any);
  const am = (aval as any).atendimentos_motos;
  const cliente = am?.cliente;

  const [{ data: contrato }, { data: custos }] = await Promise.all([
    supabase.from('contratos').select('*').eq('atendimento_id', (aval as any).atendimento_id).eq('ipva_tipo', 'COMPRA').maybeSingle(),
    supabase.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacaoId),
  ]);

  const abatimentos = (custos || [])
    .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((s: number, c: any) => s + (c.valor_executado || c.valor_previsto || 0), 0);

  const fechamento = (contrato as any)?.valor_fechamento ?? (aval as any).valor_fechamento ?? 0;
  const quitacao = (contrato as any)?.valor_quitacao ?? (aval as any).valor_quitacao ?? 0;
  const ano = [(aval as any).ano_fabricacao, (aval as any).ano_modelo].filter(Boolean).join('/');

  await generateContratoCompraPdf({
    loja: am?.loja_empresas?.loja || null,
    nomeCliente: cliente?.nome_razao_social || '',
    telefone: fmtTelefone(cliente?.telefone),
    cpfCnpj: fmtCpfCnpj((contrato as any)?.cpf_cnpj || cliente?.cpf_cnpj),
    marca: (aval as any).marca || '',
    modelo: (aval as any).modelo || '',
    anoFabMod: ano || '-',
    placa: (aval as any).placa?.replace(/-/g, '') || '-',
    km: (aval as any).km || '-',
    valorQuitacao: brlOrDash(quitacao),
    valorFechamento: brlOrDash(fechamento),
    abatimentos: brl(abatimentos),
    repasseCliente: brl(fechamento - abatimentos - quitacao),
    observacoes: (contrato as any)?.observacoes_contrato || '',
    dataContrato: fmtData((contrato as any)?.data_sinal),
  }, modo);

  return true;
}
