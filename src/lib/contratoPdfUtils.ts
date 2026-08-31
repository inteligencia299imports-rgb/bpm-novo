/** Utilidades comuns aos PDFs de contrato (compra, consignação, consignante). */

/** Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). Aceita valor já
 *  mascarado, só dígitos, ou "-"/vazio (retorna "-"). */
export function formatCpfCnpjPdf(v: string | null | undefined): string {
  const raw = (v ?? '').trim();
  const d = raw.replace(/\D/g, '');
  if (!d) return raw || '-';
  if (d.length <= 11) {
    return d
      .slice(0, 11)
      .replace(/^(\d{3})(\d{3})?(\d{3})?(\d{0,2})?.*/, (_, a, b, c, e) =>
        [a, b && `.${b}`, c && `.${c}`, e && `-${e}`].filter(Boolean).join(''),
      );
  }
  return d
    .slice(0, 14)
    .replace(/^(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{0,2})?.*/, (_, a, b, c, e, f) =>
      [a, b && `.${b}`, c && `.${c}`, e && `/${e}`, f && `-${f}`].filter(Boolean).join(''),
    );
}

/** Km com separador de milhares: "12345" -> "12.345 km". "-"/vazio -> "-". */
export function formatKmPdf(v: string | number | null | undefined): string {
  const raw = String(v ?? '').trim();
  if (!raw || raw === '-') return '-';
  const d = raw.replace(/\D/g, '');
  if (!d) return raw;
  return `${Number(d).toLocaleString('pt-BR')} km`;
}

export interface BancoClientePdf {
  banco?: string | null;
  tipoConta?: string | null;
  agencia?: string | null;
  conta?: string | null;
  chavePix?: string | null;
  favorecido?: string | null;
  cpfCnpjFavorecido?: string | null;
}

/** Linhas de "Dados bancários do VENDEDOR para repasse" — mesmo formato do contrato de compra. */
export function bancoClienteLinhas(bc?: BancoClientePdf | null): string[] {
  const linhas: string[] = [];
  if (!bc) return linhas;
  if (bc.banco) linhas.push(`Banco: ${bc.banco}`);
  const contaParts: string[] = [];
  if (bc.tipoConta) contaParts.push(`Tipo: ${bc.tipoConta}`);
  if (bc.agencia) contaParts.push(`Agência: ${bc.agencia}`);
  if (bc.conta) contaParts.push(`Conta: ${bc.conta}`);
  if (contaParts.length) linhas.push(contaParts.join('   '));
  if (bc.chavePix) linhas.push(`Chave PIX: ${bc.chavePix}`);
  if (bc.favorecido) linhas.push(`Favorecido: ${bc.favorecido}`);
  if (bc.cpfCnpjFavorecido) linhas.push(`CPF/CNPJ do favorecido: ${formatCpfCnpjPdf(bc.cpfCnpjFavorecido)}`);
  return linhas;
}
