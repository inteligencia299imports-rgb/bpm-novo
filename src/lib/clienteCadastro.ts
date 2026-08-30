/** Regras de "cadastro completo" de cliente/fornecedor — espelham as obrigatoriedades do ClienteForm. */

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const emailOk = (v: unknown) => {
  const t = String(v ?? "").trim();
  return !!t && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(t);
};

const preenchido = (v: unknown) => !!String(v ?? "").trim();

export interface ClienteCadastro {
  tipo_pessoa?: string | null;
  tipo_cadastro?: string | null;
  cpf_cnpj?: string | null;
  nome_razao_social?: string | null;
  sexo?: string | null;
  data_nascimento?: string | null;
  ramo?: string | null;
  email?: string | null;
  email_nf?: string | null;
  telefone?: string | null;
  telefone_comercial?: string | null;
  aceite_politica_privacidade?: boolean | null;
  autoriza_contato?: boolean | null;
  banco?: string | null;
  tipo_conta?: string | null;
  agencia?: string | null;
  conta?: string | null;
  digito_conta?: string | null;
  chave_pix?: string | null;
  favorecido?: string | null;
  cpf_cnpj_favorecido?: string | null;
}

export interface EnderecoCadastro {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export function cadastroClienteCompleto(
  cliente: ClienteCadastro | null | undefined,
  endereco: EnderecoCadastro | null | undefined,
): boolean {
  if (!cliente) return false;
  const pf = cliente.tipo_pessoa === "fisica";

  const cpf = soDigitos(cliente.cpf_cnpj);
  if (cpf.length !== 11 && cpf.length !== 14) return false;
  if (!preenchido(cliente.nome_razao_social)) return false;

  if (pf) {
    if (!preenchido(cliente.sexo)) return false;
    if (!preenchido(cliente.data_nascimento)) return false;
  } else {
    if (!preenchido(cliente.ramo)) return false;
  }

  if (!emailOk(cliente.email) || !emailOk(cliente.email_nf)) return false;
  if (!preenchido(cliente.telefone) || !preenchido(cliente.telefone_comercial)) return false;
  if (cliente.aceite_politica_privacidade !== true || cliente.autoriza_contato !== true) return false;

  const e = endereco;
  if (!e) return false;
  if (![e.cep, e.logradouro, e.numero, e.bairro, e.cidade, e.uf].every(preenchido)) return false;

  if (![cliente.banco, cliente.tipo_conta, cliente.chave_pix, cliente.favorecido, cliente.cpf_cnpj_favorecido].every(preenchido)) return false;
  const agDig = soDigitos(cliente.agencia);
  const ccDig = soDigitos(cliente.conta);
  if (agDig.length < 3 || agDig.length > 6) return false;
  if (ccDig.length < 4 || ccDig.length > 12) return false;
  if (!/^[0-9X]$/i.test(String(cliente.digito_conta ?? "").trim())) return false;

  return true;
}

/** "NOME - 00.000.000/0000-00" para o modo compacto. */
export function rotuloClienteCompacto(cliente: ClienteCadastro | null | undefined): string {
  if (!cliente) return "";
  const nome = String(cliente.nome_razao_social ?? "").trim();
  const d = soDigitos(cliente.cpf_cnpj);
  let doc = d;
  if (d.length === 11) doc = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  else if (d.length === 14) doc = d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ? `${nome} - ${doc}` : nome;
}
