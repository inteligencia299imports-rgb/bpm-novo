import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { Loader2, ArrowRight, Save, ArrowRightLeft, Search, AlertCircle, Import } from "lucide-react";
import { BANCOS_COMPE, rotuloBanco, normalizarBanco } from "@/lib/bancosCompe";

function mapRegimeTributario(forma?: string): string {
  if (!forma) return "";
  const s = forma.toUpperCase();
  if (s.includes("SIMPLES")) return "simples";
  if (s.includes("MEI") || s.includes("MICROEMPRESÁRIO") || s.includes("MICROEMPRESARIO")) return "mei";
  if (s.includes("PRESUMIDO")) return "lucro_presumido";
  if (s.includes("REAL")) return "lucro_real";
  return "";
}

type Endereco = {
  id?: string;
  tipo: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  pais: string;
};

const emptyEndereco: Endereco = {
  tipo: "fiscal", cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", pais: "Brasil",
};

const emptyForm = {
  tipo_cadastro: "ambos",
  tipo_pessoa: "fisica",
  cpf_cnpj: "",
  nome_razao_social: "",
  nome_fantasia: "",
  data_nascimento: "",
  ramo: "",
  email: "",
  email_nf: "",
  telefone: "",
  telefone_comercial: "",
  sexo: "",
  inscricao_estadual: "",
  inscricao_municipal: "",
  isento_inscricao_estadual: "",
  regime_tributario: "",
  contribuinte_icms: "",
  consumidor_final: "sim",
  cnae_principal: "",
  banco: "",
  agencia: "",
  conta: "",
  digito_conta: "",
  tipo_conta: "corrente",
  chave_pix: "",
  favorecido: "",
  cpf_cnpj_favorecido: "",
  origem_cadastro: "manual",
  aceite_politica_privacidade: true,
  autoriza_contato: true,
  status: "ativo",
  motivo_bloqueio: "",
  observacoes_internas: "",
};

const ALL_TABS = ["principais", "fiscais", "contatos", "endereco", "bancario", "obs"] as const;
type TabKey = typeof ALL_TABS[number];

function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function maskCpfCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function isValidCPF(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: number) => {
    let sum = 0;
    for (let i = 0; i < base; i++) sum += parseInt(d[i], 10) * (base + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(d[9], 10) && calc(10) === parseInt(d[10], 10);
}

function isValidCNPJ(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: number) => {
    const weights = base === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < base; i++) sum += parseInt(d[i], 10) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12], 10) && calc(13) === parseInt(d[13], 10);
}

/** Normaliza o sexo vindo do banco ("Masculino"/"M"/"masculino"...) para o valor do toggle. */
function normalizeSexo(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("m")) return "masculino";
  if (s.startsWith("f")) return "feminino";
  return "";
}

/** Formato canônico usado no restante do CRM. */
function sexoParaBanco(v: string): string | null {
  if (v === "masculino") return "Masculino";
  if (v === "feminino") return "Feminino";
  return null;
}

/** Máscara de data no formato dd/mm/aaaa. */
function maskDataBr(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "AAAA-MM-DD" (banco) -> "dd/mm/aaaa" (form). */
function isoParaBr(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function parseDataBr(v: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v || "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (dt.getFullYear() !== Number(yyyy) || dt.getMonth() !== Number(mm) - 1 || dt.getDate() !== Number(dd)) return null;
  return dt;
}

function idadeEmAnos(d: Date): number {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const mo = now.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** "dd/mm/aaaa" (form) -> "AAAA-MM-DD" (banco), ou null se inválida. */
function dataBrParaIso(v: string): string | null {
  const dt = parseDataBr(v);
  if (!dt) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const IDADE_MIN = 18;
const IDADE_MAX = 120;

function toTitleCase(v: string) {
  return v.toLowerCase().replace(/(^|\s|['-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function maskPhoneBR(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function isValidEmail(v: string) {
  const t = (v || "").trim();
  if (!t) return true; // vazio é tratado pela regra de obrigatoriedade
  // local@dominio.tld — sem espaços, com pelo menos um ponto no domínio e TLD de 2+ letras
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(t);
}

function maskPhoneIntl(v: string) {
  const d = onlyDigits(v).slice(0, 15);
  if (!d) return "";
  return d.replace(/^(\d{1,4})(\d{0,4})(\d{0,4})(\d{0,4})$/, (_, a, b, c, e) =>
    [a, b, c, e].filter(Boolean).join(" "),
  );
}

function maskCEP(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const DDI_OPTIONS: { code: string; abbr: string; country: string }[] = [
  { code: "+49", abbr: "DE", country: "Alemanha" },
  { code: "+54", abbr: "AR", country: "Argentina" },
  { code: "+55", abbr: "BR", country: "Brasil" },
  { code: "+56", abbr: "CL", country: "Chile" },
  { code: "+86", abbr: "CN", country: "China" },
  { code: "+34", abbr: "ES", country: "Espanha" },
  { code: "+1", abbr: "US", country: "EUA/Canadá" },
  { code: "+33", abbr: "FR", country: "França" },
  { code: "+39", abbr: "IT", country: "Itália" },
  { code: "+81", abbr: "JP", country: "Japão" },
  { code: "+595", abbr: "PY", country: "Paraguai" },
  { code: "+351", abbr: "PT", country: "Portugal" },
  { code: "+44", abbr: "GB", country: "Reino Unido" },
  { code: "+598", abbr: "UY", country: "Uruguai" },
];

function ddiShortLabel(code: string) {
  const o = DDI_OPTIONS.find((x) => x.code === code);
  return o ? `${o.abbr} (${o.code})` : code;
}

function ddiDropdownLabel(code: string) {
  const o = DDI_OPTIONS.find((x) => x.code === code);
  return o ? `${o.country} (${o.code})` : code;
}

export function ClienteForm({
  id, embedded, onSaved, onCancel,
}: { id?: string; embedded?: boolean; onSaved?: (id: string) => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!id;

  const [form, setForm] = useState<any>(emptyForm);
  const [endereco, setEndereco] = useState<Endereco>(emptyEndereco);
  const [loading, setLoading] = useState(isEdit);
  const [tab, setTab] = useState<TabKey>("principais");
  const [ddi, setDdi] = useState("+55");
  const [ddiComercial, setDdiComercial] = useState("+55");
  const [cnpjConsultado, setCnpjConsultado] = useState("");
  const [cepConsultado, setCepConsultado] = useState("");

  const { data: ramos = [] } = useQuery({
    queryKey: ["ramos-atividade-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ramos_atividade")
        .select("id,nome")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const cepApi = useMutation({
    mutationFn: async () => {
      const cep = onlyDigits(endereco.cep);
      if (cep.length !== 8) throw new Error("Informe um CEP válido (8 dígitos)");
      const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("CEP não encontrado");
        throw new Error("Erro ao consultar CEP");
      }
      return (await res.json()) as any;
    },
    onSuccess: (api) => {
      setEndereco((e) => ({
        ...e,
        logradouro: api.street ?? e.logradouro,
        bairro: api.neighborhood ?? e.bairro,
        cidade: api.city ?? e.cidade,
        uf: (api.state ?? e.uf).toString().toUpperCase(),
      }));
      setCepConsultado(onlyDigits(endereco.cep));
      toast.success("Endereço preenchido a partir do CEP");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao consultar CEP"),
  });

  const { data: existing } = useQuery({
    queryKey: ["cliente", id],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_fornecedores")
        .select("*, clientes_fornecedores_enderecos(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // CPF/CNPJ só é editável enquanto o cliente não tiver um cadastrado.
  // Telefone e tipo de pessoa (quando já há CPF/CNPJ) são imutáveis na edição.
  const cpfBloqueado = isEdit && !!onlyDigits((existing as any)?.cpf_cnpj ?? "");
  // Data de nascimento segue a mesma regra do CPF/CNPJ: só editável enquanto vazia.
  const nascimentoBloqueado = isEdit && !!String((existing as any)?.data_nascimento ?? "").trim();

  useEffect(() => {
    if (existing === undefined) return;
    if (existing) {
      const { clientes_fornecedores_enderecos: ends, ...rest } = existing as any;
      setForm({
        ...emptyForm,
        ...Object.fromEntries(
          Object.entries(rest).map(([k, v]) => {
            if (k === "sexo") return [k, normalizeSexo(v)];
            if (k === "data_nascimento") return [k, isoParaBr(v)];
            if (k === "telefone" || k === "telefone_comercial") return [k, maskPhoneBR(String(v ?? ""))];
            if (k === "cpf_cnpj" || k === "cpf_cnpj_favorecido") return [k, maskCpfCnpj(String(v ?? ""))];
            return [k, v ?? (typeof (emptyForm as any)[k] === "boolean" ? false : "")];
          }),
        ),
      });
      if (ends?.[0]) {
        const e0: any = ends[0];
        setEndereco({
          ...emptyEndereco,
          ...Object.fromEntries(
            Object.entries(e0).map(([k, v]) => {
              if (k === "cep") return [k, maskCEP(String(v ?? ""))];
              return [k, v ?? (k === "pais" ? "Brasil" : "")];
            }),
          ),
          id: e0.id,
        } as Endereco);
      }
    }
    setLoading(false);
  }, [existing]);

  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setE = (k: keyof Endereco) => (v: any) => setEndereco((e) => ({ ...e, [k]: v }));

  const prevTipoCadastro = useRef<string>(form.tipo_cadastro);
  useEffect(() => {
    if ((form.tipo_cadastro === "cliente" || form.tipo_cadastro === "colaborador") && prevTipoCadastro.current !== "cliente" && prevTipoCadastro.current !== "colaborador") {
      setForm((f: any) => ({ ...f, tipo_pessoa: "fisica" }));
    }
    prevTipoCadastro.current = form.tipo_cadastro;
  }, [form.tipo_cadastro]);

  // Pessoa física: origem sempre manual; sair da aba "fiscais" se selecionada
  useEffect(() => {
    if (form.tipo_pessoa === "fisica") {
      if (form.origem_cadastro !== "manual") setForm((f: any) => ({ ...f, origem_cadastro: "manual" }));
      // CPF tem no máximo 11 dígitos — trunca valor de CNPJ herdado
      if (onlyDigits(form.cpf_cnpj).length > 11) {
        setForm((f: any) => ({ ...f, cpf_cnpj: maskCpfCnpj(onlyDigits(f.cpf_cnpj).slice(0, 11)) }));
      }
    }
    if ((form.tipo_pessoa === "fisica" || form.tipo_cadastro === "cliente" || form.tipo_cadastro === "colaborador") && tab === "fiscais") {
      setTab("principais");
    }
  }, [form.tipo_pessoa, form.origem_cadastro, tab, form.tipo_cadastro]);

  // Pessoa jurídica sempre é contribuinte de ICMS
  useEffect(() => {
    if (form.tipo_pessoa === "juridica") {
      setForm((f: any) => ({ ...f, contribuinte_icms: true }));
    }
  }, [form.tipo_pessoa]);

  // Validação de CPF/CNPJ (dígitos verificadores) — de acordo com o tipo de pessoa
  const pessoaFisica = form.tipo_pessoa === "fisica";
  const cpfDigits = onlyDigits(form.cpf_cnpj);
  const cpfCompleto = pessoaFisica ? cpfDigits.length === 11 : cpfDigits.length === 14;
  const cpfCnpjValido = pessoaFisica ? isValidCPF(form.cpf_cnpj) : isValidCNPJ(form.cpf_cnpj);
  const cpfValid = cpfCompleto && cpfCnpjValido;
  const { data: dupRow } = useQuery({
    queryKey: ["cpf-cnpj-dup", form.cpf_cnpj, id ?? null],
    enabled: cpfValid,
    queryFn: async () => {
      let q = supabase
        .from("clientes_fornecedores")
        .select("id")
        .in("cpf_cnpj", [cpfDigits, form.cpf_cnpj])
        .limit(1);
      if (id) q = q.neq("id", id);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isDuplicate = !!dupRow;

  const brasilApi = useMutation({
    mutationFn: async () => {
      const cnpj = onlyDigits(form.cpf_cnpj);
      if (cnpj.length !== 14) throw new Error("Informe um CNPJ válido (14 dígitos)");
      if (!isValidCNPJ(cnpj)) throw new Error("CNPJ inválido (dígitos verificadores não conferem)");
      let q = supabase
        .from("clientes_fornecedores")
        .select("id, nome_razao_social")
        .in("cpf_cnpj", [cnpj, form.cpf_cnpj])
        .limit(1);
      if (id) q = q.neq("id", id);
      const { data: dup, error: dupErr } = await q.maybeSingle();
      if (dupErr) throw dupErr;
      if (dup) {
        throw new Error(`CNPJ já cadastrado${dup.nome_razao_social ? `: ${dup.nome_razao_social}` : ""}`);
      }
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal");
        throw new Error("Erro ao consultar BrasilAPI");
      }
      return (await res.json()) as any;
    },
    onSuccess: (api) => {
      const regimeArr: any[] = Array.isArray(api.regime_tributario) ? api.regime_tributario : [];
      const regimeMaisRecente = regimeArr.length
        ? regimeArr.reduce((a, b) => (Number(a?.ano) >= Number(b?.ano) ? a : b))
        : null;
      const situacao = (api.descricao_situacao_cadastral ?? "").toString();
      const tel1 = api.ddd_telefone_1 ? maskPhoneBR(String(api.ddd_telefone_1)) : "";
      const tel2 = api.ddd_telefone_2 ? maskPhoneBR(String(api.ddd_telefone_2)) : "";
      const email = (api.email ?? "").toString().toLowerCase();

      setForm((f: any) => ({
        ...f,
        tipo_pessoa: "juridica",
        nome_razao_social: (api.razao_social ?? "").toString().toUpperCase(),
        nome_fantasia: (api.nome_fantasia ?? "").toString().toUpperCase(),
        email: email || f.email,
        email_nf: email || f.email_nf,
        telefone: tel1 || f.telefone,
        telefone_comercial: tel2 || f.telefone_comercial,
        cnae_principal:
          api.cnae_fiscal && api.cnae_fiscal_descricao
            ? `${api.cnae_fiscal} - ${api.cnae_fiscal_descricao}`
            : f.cnae_principal,
        regime_tributario: mapRegimeTributario(regimeMaisRecente?.forma_de_tributacao) || f.regime_tributario,
        validado_receita: true,
        data_validacao_receita: new Date().toISOString(),
        origem_cadastro: "consulta_brasilapi",
        status: situacao.toUpperCase() === "ATIVA" ? "ativo" : "inativo",
      }));
      if (tel1) setDdi("+55");
      if (tel2) setDdiComercial("+55");

      setEndereco((e) => ({
        ...e,
        tipo: "fiscal",
        cep: maskCEP((api.cep ?? "").toString()),
        logradouro: api.logradouro ?? "",
        numero: api.numero ?? "",
        complemento: api.complemento ?? "",
        bairro: api.bairro ?? "",
        cidade: api.municipio ?? "",
        uf: (api.uf ?? "").toString().toUpperCase(),
        pais: api.pais || "BRASIL",
      }));

      setCnpjConsultado(onlyDigits(form.cpf_cnpj));
      toast.success("Dados preenchidos a partir da BrasilAPI");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao consultar CNPJ"),
  });

  const isFisica = form.tipo_pessoa === "fisica";
  const isJuridica = form.tipo_pessoa === "juridica";

  const isCliente = form.tipo_cadastro === "cliente" || form.tipo_cadastro === "colaborador";
  const TABS = useMemo<TabKey[]>(
    () => (isFisica || isCliente
      ? ["principais", "contatos", "endereco", "bancario", "obs"]
      : ["principais", "fiscais", "contatos", "endereco", "bancario", "obs"]),
    [isFisica, isCliente],
  );

  const s = (v: unknown) => (typeof v === "string" ? v : "").trim();

  // Data de nascimento — obrigatória para pessoa física; valida idade (18–120 anos).
  const dataNascObj = parseDataBr(form.data_nascimento);
  const idadeCliente = dataNascObj ? idadeEmAnos(dataNascObj) : null;
  const dataNascCompleta = onlyDigits(form.data_nascimento || "").length === 8;
  const dataNascValida =
    !!dataNascObj && idadeCliente !== null && idadeCliente >= IDADE_MIN && idadeCliente <= IDADE_MAX && dataNascObj <= new Date();
  const dataNascObrigatoria = isFisica;
  const dataNascOk = dataNascObrigatoria ? dataNascValida : (!s(form.data_nascimento) || dataNascValida);
  const dataNascErro = !!s(form.data_nascimento) && dataNascCompleta && !dataNascValida;

  const enderecoCompleto =
    !!s(endereco.cep) && !!s(endereco.logradouro) && !!s(endereco.numero) &&
    !!s(endereco.bairro) && !!s(endereco.cidade) && !!s(endereco.uf);

  const contatosOk =
    !!s(form.email) && isValidEmail(form.email) &&
    !!s(form.email_nf) && isValidEmail(form.email_nf) &&
    !!s(form.telefone) && !!s(form.telefone_comercial) &&
    !!form.autoriza_contato && !!form.aceite_politica_privacidade;

  const principaisOk = () => {
    if (!s(form.cpf_cnpj) || !s(form.nome_razao_social) || isDuplicate || !cpfCnpjValido) return false;
    if (isJuridica && !s(form.ramo)) return false;
    if (!dataNascOk) return false;
    if (isFisica) return !!s(form.sexo);
    if (isJuridica && form.tipo_cadastro !== "fornecedor" && !form.consumidor_final) return false;
    return true;
  };

  const fiscaisOk = typeof form.contribuinte_icms === "boolean";

  const agenciaDig = onlyDigits(form.agencia);
  const contaDig = onlyDigits(form.conta);
  const agenciaValida = agenciaDig.length >= 3 && agenciaDig.length <= 6;
  const contaValida = contaDig.length >= 4 && contaDig.length <= 12;
  const digitoValido = /^[0-9X]$/.test(s(form.digito_conta));
  const bancarioOk =
    !!s(form.banco) && !!s(form.tipo_conta) && agenciaValida && contaValida && digitoValido &&
    !!s(form.favorecido) && !!s(form.cpf_cnpj_favorecido) && !!s(form.chave_pix);

  const tabMissing = (t: TabKey): boolean => {
    if (t === "principais") return !principaisOk();
    if (t === "fiscais") return isJuridica && !isCliente && !fiscaisOk;
    if (t === "contatos") return !contatosOk;
    if (t === "endereco") return !enderecoCompleto;
    if (t === "bancario") return !bancarioOk;
    return false;
  };

  const nextMissingTab = useMemo<TabKey | null>(() => {
    const idx = TABS.indexOf(tab);
    for (let i = idx + 1; i < TABS.length; i++) if (tabMissing(TABS[i])) return TABS[i];
    for (let i = 0; i < TABS.length; i++) if (tabMissing(TABS[i])) return TABS[i];
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, form, endereco, isDuplicate, isFisica, isJuridica]);

  const save = useMutation({
    mutationFn: async () => {
      if (!s(form.cpf_cnpj)) throw new Error(`${isFisica ? "CPF" : "CNPJ"} obrigatório`);
      if (!cpfCnpjValido) throw new Error(`${isFisica ? "CPF" : "CNPJ"} inválido (dígitos verificadores não conferem)`);
      if (!s(form.nome_razao_social)) throw new Error(`${isFisica ? "Nome" : "Razão Social"} obrigatório`);
      if (isJuridica && !s(form.ramo)) throw new Error("Ramo de atividade obrigatório");
      if (isFisica && !s(form.sexo)) throw new Error("Sexo obrigatório");
      if (dataNascObrigatoria && !s(form.data_nascimento)) throw new Error("Data de nascimento obrigatória");
      if (!dataNascOk) throw new Error(`Data de nascimento inválida (idade entre ${IDADE_MIN} e ${IDADE_MAX} anos)`);
      if (isJuridica && form.tipo_cadastro !== "fornecedor" && !form.consumidor_final) throw new Error("Consumidor final obrigatório");
      if (isDuplicate) throw new Error("Este CPF/CNPJ já possui cadastro");
      if (isJuridica && !isCliente && !fiscaisOk) throw new Error("Selecione se é contribuinte de ICMS");
      if (s(form.email) && !isValidEmail(form.email)) throw new Error("E-mail para contato inválido");
      if (s(form.email_nf) && !isValidEmail(form.email_nf)) throw new Error("E-mail para NF inválido");
      if (!contatosOk) throw new Error("Preencha e-mails, telefones e aceites obrigatórios");
      if (!enderecoCompleto) throw new Error("Endereço obrigatório (CEP, logradouro, número, bairro, cidade, UF)");
      if (!bancarioOk) throw new Error("Preencha todos os dados bancários");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      const payload: any = { ...form };
      payload.cpf_cnpj = onlyDigits(payload.cpf_cnpj ?? "");
      payload.telefone = onlyDigits(payload.telefone ?? "");
      payload.telefone_comercial = onlyDigits(payload.telefone_comercial ?? "");
      payload.cpf_cnpj_favorecido = onlyDigits(payload.cpf_cnpj_favorecido ?? "") || null;
      payload.banco = normalizarBanco(payload.banco) || null;
      Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
      const toBool = (v: any) => typeof v === "boolean" ? v : v === "sim" ? true : v === "nao" ? false : null;
      payload.isento_inscricao_estadual = toBool(payload.isento_inscricao_estadual);
      payload.contribuinte_icms = toBool(payload.contribuinte_icms) ?? false;
      payload.consumidor_final = true; // sempre consumidor final
      payload.aceite_politica_privacidade = payload.aceite_politica_privacidade === true;
      payload.autoriza_contato = payload.autoriza_contato === true;
      payload.sexo = sexoParaBanco(form.sexo);
      payload.data_nascimento = dataBrParaIso(form.data_nascimento);
      if (payload.aceite_politica_privacidade && !payload.data_aceite_politica_privacidade) {
        payload.data_aceite_politica_privacidade = new Date().toISOString();
      }
      payload.status = "ativo";
      if (!isEdit) payload.created_by = uid;
      payload.updated_by = uid;
      // Colunas geridas pelo banco — nunca enviar no payload.
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.deleted_at;
      delete payload.clientes_fornecedores_enderecos;

      let cfId = id;
      if (isEdit) {
        // Telefone é imutável. CPF/CNPJ, tipo de pessoa e data de nascimento
        // só podem mudar se o campo ainda não estava preenchido.
        delete payload.telefone;
        if (cpfBloqueado) {
          delete payload.cpf_cnpj;
          delete payload.tipo_pessoa;
        }
        if (nascimentoBloqueado) delete payload.data_nascimento;
        const { error } = await supabase.from("clientes_fornecedores").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("clientes_fornecedores").insert(payload).select("id").single();
        if (error) throw error;
        cfId = data.id;
      }

      const hasEndereco = endereco.cep || endereco.logradouro || endereco.numero || endereco.complemento || endereco.bairro || endereco.cidade || endereco.uf;
      if (hasEndereco) {
        const epayload: any = { ...endereco, cliente_fornecedor_id: cfId };
        Object.keys(epayload).forEach((k) => { if (epayload[k] === "") epayload[k] = null; });
        delete epayload.created_at;
        delete epayload.updated_at;
        if (endereco.id) {
          const { error } = await supabase.from("clientes_fornecedores_enderecos").update(epayload).eq("id", endereco.id);
          if (error) throw error;
        } else {
          delete epayload.id;
          const { error } = await supabase.from("clientes_fornecedores_enderecos").insert(epayload);
          if (error) throw error;
        }
      }
      return cfId as string;
    },
    onSuccess: (cfId) => {
      toast.success("Cadastro salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cf-options"] });
      qc.invalidateQueries({ queryKey: ["cliente", cfId] });
      onSaved?.(cfId);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const allComplete = nextMissingTab === null;

  const TAB_LABEL: Record<TabKey, string> = {
    principais: "Principais",
    fiscais: "Fiscais",
    contatos: "Contatos",
    endereco: "Endereço",
    bancario: "Bancário",
    obs: "Observações",
  };

  const handlePrimary = () => {
    if (allComplete) {
      save.mutate();
      return;
    }
    if (nextMissingTab) {
      setTab(nextMissingTab);
      toast.error(`Preencha os campos obrigatórios da aba "${TAB_LABEL[nextMissingTab]}"`);
    }
  };

  // Vermelho é reservado para valor DIGITADO inválido (CPF/CNPJ, e-mail, data,
  // agência/conta...). Campo obrigatório apenas vazio NÃO fica vermelho — a
  // obrigatoriedade é sinalizada só pelo "*" ao lado do rótulo.
  const ERR_CLS = "border-destructive ring-1 ring-destructive bg-destructive/5 focus-visible:ring-destructive";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const errCls = (_invalido: boolean) => "";

  const TabTrigger = ({ value, children }: { value: TabKey; children: ReactNode }) => (
    <TabsTrigger value={value}>{children}</TabsTrigger>
  );

  const formBody = (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex-wrap h-auto">
          <TabTrigger value="principais">Principais</TabTrigger>
          {isJuridica && !isCliente && <TabTrigger value="fiscais">Fiscais</TabTrigger>}
          <TabTrigger value="contatos">Contatos</TabTrigger>
          <TabTrigger value="endereco">Endereço</TabTrigger>
          <TabTrigger value="bancario">Bancário</TabTrigger>
          <TabTrigger value="obs">Observações</TabTrigger>
        </TabsList>

        <TabsContent value="principais" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="block">Tipo de pessoa <span className="text-red-500">*</span></Label>
              <ToggleGroup
                type="single"
                value={form.tipo_pessoa}
                onValueChange={(v) => v && set("tipo_pessoa")(v)}
                variant="outline"
                className="w-max"
                disabled={cpfBloqueado}
              >
                <ToggleGroupItem value="fisica" className="min-w-[5.5rem]">Física</ToggleGroupItem>
                <ToggleGroupItem value="juridica" className="min-w-[5.5rem]">Jurídica</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div>
              <Label>{form.tipo_pessoa === "fisica" ? <>CPF <span className="text-red-500">*</span></> : <>CNPJ <span className="text-red-500">*</span></>}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    inputMode="numeric"
                    disabled={cpfBloqueado}
                    value={form.cpf_cnpj}
                    onChange={(e) => set("cpf_cnpj")(maskCpfCnpj(onlyDigits(e.target.value).slice(0, pessoaFisica ? 11 : 14)))}
                    onBlur={() => {
                      if (cpfCompleto && !cpfCnpjValido) {
                        toast.error(`${form.tipo_pessoa === "fisica" ? "CPF" : "CNPJ"} inválido`, {
                          description: "Os dígitos verificadores não conferem. Confira o número digitado.",
                        });
                      }
                    }}
                    placeholder={form.tipo_pessoa === "fisica" ? "000.000.000-00" : "00.000.000/0000-00"}
                    aria-invalid={isDuplicate || (cpfCompleto && !cpfCnpjValido)}
                    className={(isDuplicate || (cpfCompleto && !cpfCnpjValido)) ? `${ERR_CLS} pr-9` : ""}
                  />
                  {cpfCompleto && !cpfCnpjValido && (
                    <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {!cpfBloqueado && form.tipo_pessoa === "juridica" && onlyDigits(form.cpf_cnpj).length === 14 && onlyDigits(form.cpf_cnpj) !== cnpjConsultado && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => brasilApi.mutate()}
                    disabled={brasilApi.isPending || onlyDigits(form.cpf_cnpj).length !== 14 || isDuplicate || !cpfCnpjValido}
                    title="Consultar CNPJ na BrasilAPI"
                  >
                    {brasilApi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {cpfCompleto && !cpfCnpjValido && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {form.tipo_pessoa === "fisica" ? "CPF" : "CNPJ"} inválido — os dígitos verificadores não conferem.
                </p>
              )}
              {isDuplicate && (
                <p className="text-xs text-destructive mt-1">Este {form.tipo_pessoa === "fisica" ? "CPF" : "CNPJ"} já possui cadastro.</p>
              )}
            </div>
            <div>
              <Label>{form.tipo_pessoa === "fisica" ? <>Nome completo <span className="text-red-500">*</span></> : <>Razão social <span className="text-red-500">*</span></>}</Label>
              <Input
                value={form.nome_razao_social}
                className={errCls(!s(form.nome_razao_social))}
                onChange={(e) =>
                  set("nome_razao_social")(
                    form.tipo_pessoa === "fisica"
                      ? toTitleCase(e.target.value)
                      : e.target.value.toUpperCase(),
                  )
                }
              />
            </div>
            {form.tipo_pessoa === "juridica" && (
              <div>
                <Label>Nome fantasia</Label>
                <Input
                  value={form.nome_fantasia}
                  onChange={(e) => set("nome_fantasia")(e.target.value.toUpperCase())}
                />
              </div>
            )}
            {form.tipo_pessoa === "juridica" && (
              <div>
                <Label>Ramo de atividade <span className="text-red-500">*</span></Label>
                <Select value={form.ramo || ""} onValueChange={set("ramo")}>
                  <SelectTrigger className={errCls(!s(form.ramo))}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {ramos.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isFisica && (
              <>
                <div className="space-y-1.5">
                  <Label className="block">Sexo <span className="text-red-500">*</span></Label>
                  <ToggleGroup
                    type="single"
                    value={form.sexo || ""}
                    onValueChange={(v) => v && set("sexo")(v)}
                    variant="outline"
                    className="w-max"
                  >
                    <ToggleGroupItem value="masculino">Masculino</ToggleGroupItem>
                    <ToggleGroupItem value="feminino">Feminino</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="block">Data de Nascimento <span className="text-red-500">*</span></Label>
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="dd/mm/aaaa"
                    disabled={nascimentoBloqueado}
                    title={nascimentoBloqueado ? "Data de nascimento já cadastrada não pode ser alterada" : undefined}
                    value={form.data_nascimento || ""}
                    onChange={(e) => set("data_nascimento")(maskDataBr(e.target.value))}
                    aria-invalid={dataNascErro}
                    className={dataNascErro ? ERR_CLS : ""}
                  />
                  {dataNascErro && (
                    <p className="text-xs text-destructive">
                      {parseDataBr(form.data_nascimento)
                        ? `Idade deve estar entre ${IDADE_MIN} e ${IDADE_MAX} anos`
                        : "Data inválida"}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fiscais" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual")(e.target.value)} disabled={form.isento_inscricao_estadual === true} />
            </div>
            <div className="space-y-1.5">
              <Label className="block">Isento de IE</Label>
              <ToggleGroup
                type="single"
                value={form.isento_inscricao_estadual === true ? "sim" : form.isento_inscricao_estadual === false ? "nao" : ""}
                onValueChange={(v) => v && set("isento_inscricao_estadual")(v === "sim")}
                variant="outline"
                className="w-max"
              >
                <ToggleGroupItem value="sim">Sim</ToggleGroupItem>
                <ToggleGroupItem value="nao">Não</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div>
              <Label>Inscrição Municipal</Label>
              <Input value={form.inscricao_municipal} onChange={(e) => set("inscricao_municipal")(e.target.value)} />
            </div>
            <div>
              <Label>Regime tributário</Label>
              <Select value={form.regime_tributario || ""} onValueChange={set("regime_tributario")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CNAE principal</Label>
              <Input value={form.cnae_principal} onChange={(e) => set("cnae_principal")(e.target.value)} />
            </div>
            <div className={`space-y-1.5 ${isJuridica ? "opacity-60" : ""}`}>
              <Label className="block">Contribuinte de ICMS <span className="text-red-500">*</span></Label>
              <ToggleGroup
                type="single"
                value={form.contribuinte_icms === true ? "sim" : form.contribuinte_icms === false ? "nao" : ""}
                onValueChange={(v) => v && set("contribuinte_icms")(v === "sim")}
                variant="outline"
                className="w-max"
                disabled={isJuridica}
              >
                <ToggleGroupItem value="sim" disabled={isJuridica}>Sim</ToggleGroupItem>
                <ToggleGroupItem value="nao" disabled={isJuridica}>Não</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contatos" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <Label>E-mail para contato <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value.toLowerCase())}
                className={form.email.trim() && !isValidEmail(form.email) ? ERR_CLS : ""}
              />
              {form.email.trim() && !isValidEmail(form.email) && (
                <p className="text-xs text-destructive mt-1">Informe um e-mail válido (ex: email@email.com.br)</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => set("email_nf")(form.email)}
              disabled={!form.email}
              title="Usar e-mail de contato"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            <div>
              <Label>E-mail para NF <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={form.email_nf}
                onChange={(e) => set("email_nf")(e.target.value.toLowerCase())}
                className={form.email_nf.trim() && !isValidEmail(form.email_nf) ? ERR_CLS : ""}
              />
              {form.email_nf.trim() && !isValidEmail(form.email_nf) && (
                <p className="text-xs text-destructive mt-1">Informe um e-mail válido (ex: email@email.com.br)</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <Label>Telefone para contato <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Select value={ddi} onValueChange={setDdi} disabled={isEdit}>
                  <SelectTrigger className="w-[150px]">{ddiShortLabel(ddi)}</SelectTrigger>
                  <SelectContent>
                    {DDI_OPTIONS.map((o) => (
                      <SelectItem key={o.code} value={o.code}>{ddiDropdownLabel(o.code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.telefone}
                  disabled={isEdit}
                  className={errCls(!s(form.telefone))}
                  onChange={(e) =>
                    set("telefone")(ddi === "+55" ? maskPhoneBR(e.target.value) : maskPhoneIntl(e.target.value))
                  }
                  placeholder={ddi === "+55" ? "(11) 99999-9999" : ""}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => {
                setDdiComercial(ddi);
                set("telefone_comercial")(form.telefone);
              }}
              disabled={!form.telefone}
              title="Usar telefone de contato"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            <div>
              <Label>Telefone comercial <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Select value={ddiComercial} onValueChange={setDdiComercial}>
                  <SelectTrigger className="w-[150px]">{ddiShortLabel(ddiComercial)}</SelectTrigger>
                  <SelectContent>
                    {DDI_OPTIONS.map((o) => (
                      <SelectItem key={o.code} value={o.code}>{ddiDropdownLabel(o.code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.telefone_comercial}
                  className={errCls(!s(form.telefone_comercial))}
                  onChange={(e) =>
                    set("telefone_comercial")(
                      ddiComercial === "+55" ? maskPhoneBR(e.target.value) : maskPhoneIntl(e.target.value),
                    )
                  }
                  placeholder={ddiComercial === "+55" ? "(11) 3333-4444" : ""}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Switch checked={form.autoriza_contato} onCheckedChange={set("autoriza_contato")} />
                <Label>Autoriza contato <span className="text-red-500">*</span></Label>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Switch checked={form.aceite_politica_privacidade} onCheckedChange={set("aceite_politica_privacidade")} />
                <Label>Aceite da política de privacidade <span className="text-red-500">*</span></Label>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="endereco" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>CEP <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  value={endereco.cep}
                  className={errCls(!s(endereco.cep))}
                  onChange={(e) => setE("cep")(maskCEP(e.target.value))}
                  placeholder="00000-000"
                />
                {onlyDigits(endereco.cep).length === 8 && onlyDigits(endereco.cep) !== cepConsultado && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => cepApi.mutate()}
                    disabled={cepApi.isPending}
                    title="Buscar endereço pelo CEP"
                  >
                    {cepApi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Logradouro <span className="text-red-500">*</span></Label>
              <Input value={endereco.logradouro} className={errCls(!s(endereco.logradouro))} onChange={(e) => setE("logradouro")(e.target.value)} />
            </div>
            <div>
              <Label>Número <span className="text-red-500">*</span></Label>
              <Input value={endereco.numero} className={errCls(!s(endereco.numero))} onChange={(e) => setE("numero")(e.target.value)} />
            </div>
            <div>
              <Label>Complemento</Label>
              <Input value={endereco.complemento} onChange={(e) => setE("complemento")(e.target.value)} />
            </div>
            <div>
              <Label>Bairro <span className="text-red-500">*</span></Label>
              <Input value={endereco.bairro} className={errCls(!s(endereco.bairro))} onChange={(e) => setE("bairro")(e.target.value)} />
            </div>
            <div>
              <Label>Cidade <span className="text-red-500">*</span></Label>
              <Input value={endereco.cidade} className={errCls(!s(endereco.cidade))} onChange={(e) => setE("cidade")(e.target.value)} />
            </div>
            <div>
              <Label>UF <span className="text-red-500">*</span></Label>
              <Select value={endereco.uf || ""} onValueChange={(v) => setE("uf")(v)}>
                <SelectTrigger className={errCls(!s(endereco.uf))}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bancario" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Banco <span className="text-red-500">*</span></Label>
              <Select value={normalizarBanco(form.banco)} onValueChange={set("banco")}>
                <SelectTrigger className={errCls(!s(form.banco))}><SelectValue placeholder="Selecione o banco..." /></SelectTrigger>
                <SelectContent>
                  {BANCOS_COMPE.map((b) => (
                    <SelectItem key={b.codigo} value={rotuloBanco(b)}>{rotuloBanco(b)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Conta <span className="text-red-500">*</span></Label>
              <Select value={form.tipo_conta || ""} onValueChange={set("tipo_conta")}>
                <SelectTrigger className={errCls(!s(form.tipo_conta))}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agência <span className="text-red-500">*</span></Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={form.agencia}
                className={s(form.agencia) && !agenciaValida ? ERR_CLS : ""}
                onChange={(e) => set("agencia")(onlyDigits(e.target.value).slice(0, 6))}
              />
              {s(form.agencia) && !agenciaValida && <p className="text-xs text-destructive mt-1">Agência inválida (3 a 6 dígitos)</p>}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label>Conta <span className="text-red-500">*</span></Label>
                <Input
                  inputMode="numeric"
                  maxLength={12}
                  value={form.conta}
                  className={s(form.conta) && !contaValida ? ERR_CLS : ""}
                  onChange={(e) => set("conta")(onlyDigits(e.target.value).slice(0, 12))}
                />
                {s(form.conta) && !contaValida && <p className="text-xs text-destructive mt-1">Conta inválida (4 a 12 dígitos)</p>}
              </div>
              <div>
                <Label>Dígito <span className="text-red-500">*</span></Label>
                <Input
                  maxLength={1}
                  value={form.digito_conta}
                  onChange={(e) => set("digito_conta")(e.target.value.replace(/[^0-9xX]/g, "").slice(0, 1).toUpperCase())}
                  className={`w-16 ${s(form.digito_conta) && !digitoValido ? ERR_CLS : ""}`}
                />
              </div>
            </div>

            <div>
              <Label>Favorecido <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Input
                  value={form.favorecido}
                  onChange={(e) => set("favorecido")(isJuridica ? e.target.value.toUpperCase() : toTitleCase(e.target.value))}
                  className={`${isJuridica ? "uppercase" : ""} ${errCls(!s(form.favorecido))}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() =>
                    setForm((f: any) => ({
                      ...f,
                      favorecido: isJuridica ? (f.nome_razao_social || "").toUpperCase() : toTitleCase(f.nome_razao_social || ""),
                      cpf_cnpj_favorecido: maskCpfCnpj(f.cpf_cnpj || ""),
                    }))
                  }
                >
                  <Import className="h-4 w-4" /> É o cliente
                </Button>
              </div>
            </div>
            <div>
              <Label>CPF/CNPJ do Favorecido <span className="text-red-500">*</span></Label>
              <Input
                inputMode="numeric"
                value={form.cpf_cnpj_favorecido}
                className={errCls(!s(form.cpf_cnpj_favorecido))}
                onChange={(e) => set("cpf_cnpj_favorecido")(maskCpfCnpj(e.target.value))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Chave PIX <span className="text-red-500">*</span></Label>
              <Input value={form.chave_pix} className={errCls(!s(form.chave_pix))} onChange={(e) => set("chave_pix")(e.target.value)} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="obs" className="space-y-4 pt-4">
          <div>
            <Label>Observações internas</Label>
            <Textarea rows={4} value={form.observacoes_internas} onChange={(e) => set("observacoes_internas")(e.target.value)} />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 mt-6 border-t pt-4">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        )}
        <Button onClick={handlePrimary} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : allComplete ? (
            <Save className="mr-2 h-4 w-4" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          {allComplete ? "Salvar" : "Próximo"}
        </Button>
      </div>
    </>
  );

  if (embedded) return formBody;

  return (
    <Card className="p-4 md:p-6">{formBody}</Card>
  );
}

export default ClienteForm;
