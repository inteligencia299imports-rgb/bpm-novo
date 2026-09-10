/** Utilitários de rótulo/máscara de CPF x CNPJ. */

/** true quando os dígitos correspondem a um CNPJ (> 11 dígitos). */
export const ehCnpj = (valor?: string | null): boolean =>
  (valor ?? '').replace(/\D/g, '').length > 11;

type ClienteDoc = { tipo_pessoa?: string | null; cpf_cnpj?: string | null };

/**
 * Rótulo do documento conforme o tipo de pessoa / valor.
 * Passe o cliente (usa `tipo_pessoa` quando houver) ou uma string de CPF/CNPJ.
 */
export const rotuloDocumento = (
  ref?: string | ClienteDoc | null,
): 'CNPJ' | 'CPF' => {
  if (ref && typeof ref === 'object') {
    if (ref.tipo_pessoa === 'juridica') return 'CNPJ';
    if (ref.tipo_pessoa === 'fisica') return 'CPF';
    return ehCnpj(ref.cpf_cnpj) ? 'CNPJ' : 'CPF';
  }
  return ehCnpj(typeof ref === 'string' ? ref : null) ? 'CNPJ' : 'CPF';
};

/** Placeholder de input conforme o rótulo. */
export const placeholderDocumento = (label: 'CNPJ' | 'CPF'): string =>
  label === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00';
