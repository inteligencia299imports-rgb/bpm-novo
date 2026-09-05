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
  opts?: { exigirBancarios?: boolean },
): boolean {
  const exigirBancarios = opts?.exigirBancarios ?? true;
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

  if (exigirBancarios) {
    if (![cliente.banco, cliente.tipo_conta, cliente.chave_pix, cliente.favorecido, cliente.cpf_cnpj_favorecido].every(preenchido)) return false;
    const agDig = soDigitos(cliente.agencia);
    const ccDig = soDigitos(cliente.conta);
    if (agDig.length < 3 || agDig.length > 6) return false;
    if (ccDig.length < 4 || ccDig.length > 12) return false;
    if (!/^[0-9X]$/i.test(String(cliente.digito_conta ?? "").trim())) return false;
  }

  return true;
}

export interface PendenciasCadastro {
  /** campos do card "Dados do Cliente" que faltam / estão inválidos */
  cliente: string[];
  /** campos do card "Endereço" que faltam */
  endereco: string[];
  /** campos do card "Dados Bancários" que faltam (só quando exigirBancarios) */
  bancario: string[];
}

/**
 * Mesmas regras de `cadastroClienteCompleto`, mas devolve **quais** campos
 * faltam, agrupados por card — para exibir as pendências na tela de emissão de NF.
 * `bancario` só é avaliado quando `exigirBancarios` (default true).
 */
export function pendenciasCadastroCliente(
  cliente: ClienteCadastro | null | undefined,
  endereco: EnderecoCadastro | null | undefined,
  opts?: { exigirBancarios?: boolean },
): PendenciasCadastro {
  const exigirBancarios = opts?.exigirBancarios ?? true;
  const out: PendenciasCadastro = { cliente: [], endereco: [], bancario: [] };

  const pf = (cliente?.tipo_pessoa ?? "fisica") === "fisica";

  const cpf = soDigitos(cliente?.cpf_cnpj);
  if (cpf.length !== 11 && cpf.length !== 14) out.cliente.push("CPF/CNPJ");
  if (!preenchido(cliente?.nome_razao_social)) out.cliente.push("Nome");
  if (pf) {
    if (!preenchido(cliente?.sexo)) out.cliente.push("Sexo");
    if (!preenchido(cliente?.data_nascimento)) out.cliente.push("Data de nascimento");
  } else if (!preenchido(cliente?.ramo)) {
    out.cliente.push("Ramo");
  }
  if (!emailOk(cliente?.email)) out.cliente.push("E-mail");
  if (!emailOk(cliente?.email_nf)) out.cliente.push("E-mail para NF");
  if (!preenchido(cliente?.telefone)) out.cliente.push("Telefone");
  if (!preenchido(cliente?.telefone_comercial)) out.cliente.push("Telefone comercial");
  if (cliente?.aceite_politica_privacidade !== true) out.cliente.push("Aceite da política de privacidade");
  if (cliente?.autoriza_contato !== true) out.cliente.push("Autorização de contato");

  const e = endereco;
  if (!preenchido(e?.cep)) out.endereco.push("CEP");
  if (!preenchido(e?.logradouro)) out.endereco.push("Logradouro");
  if (!preenchido(e?.numero)) out.endereco.push("Número");
  if (!preenchido(e?.bairro)) out.endereco.push("Bairro");
  if (!preenchido(e?.cidade)) out.endereco.push("Cidade");
  if (!preenchido(e?.uf)) out.endereco.push("UF");

  if (exigirBancarios) {
    if (!preenchido(cliente?.banco)) out.bancario.push("Banco");
    if (!preenchido(cliente?.tipo_conta)) out.bancario.push("Tipo de conta");
    if (!preenchido(cliente?.chave_pix)) out.bancario.push("Chave PIX");
    if (!preenchido(cliente?.favorecido)) out.bancario.push("Favorecido");
    if (!preenchido(cliente?.cpf_cnpj_favorecido)) out.bancario.push("CPF/CNPJ do favorecido");
    const agDig = soDigitos(cliente?.agencia);
    if (agDig.length < 3 || agDig.length > 6) out.bancario.push("Agência");
    const ccDig = soDigitos(cliente?.conta);
    if (ccDig.length < 4 || ccDig.length > 12) out.bancario.push("Conta");
    if (!/^[0-9X]$/i.test(String(cliente?.digito_conta ?? "").trim())) out.bancario.push("Dígito da conta");
  }

  return out;
}

/** `true` se não há nenhuma pendência em nenhum dos cards. */
export function semPendencias(p: PendenciasCadastro): boolean {
  return p.cliente.length === 0 && p.endereco.length === 0 && p.bancario.length === 0;
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
