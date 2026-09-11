import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileText, CalendarIcon, Trash2, Plus, Save, Eye, Download, Loader2, RefreshCw, AlertTriangle, User, Bike, MessageSquare, Wallet, ArrowLeft, Pencil, MapPin, Landmark, Building2, Package, DollarSign, Receipt, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { vendaLiberada } from '@/lib/aprovacaoVenda';
import type { Atendimento, MotoInteresse, Avaliacao } from '@/types/crm';
import { generateContratoPdf, type ContratoPdfData } from '@/lib/generateContratoPdf';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { useAuth } from '@/contexts/AuthContext';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto, pendenciasCadastroCliente, semPendencias } from '@/lib/clienteCadastro';
import PendenciaTag from '@/components/shared/PendenciaTag';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';
import NfeCabecalhoAcoes from '@/components/shared/NfeCabecalhoAcoes';
import AgregadosContrato, { type Agregado, type AgregadoLinha } from '@/components/showroom/AgregadosContrato';
import { rotuloDocumento, ehCnpj } from '@/lib/documento';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento: Atendimento;
  motosInteresse: MotoInteresse[];
  motosAvaliacao: Avaliacao[];
  estoqueData: Record<string, any>;
  avaliacoes: Record<string, any>;
  onSaved?: () => void;
  /** 'nfe' abre a tela de revisão/emissão da NF-e de venda. */
  modo?: 'contrato' | 'nfe';
}

/** Forma cujo nome é "Financiamento" ganha o bloco de campos extras (entrada/parcelas). */
const ehFinanciamento = (nome: string | null | undefined) =>
  String(nome ?? '').trim().toLowerCase() === 'financiamento';

/** Forma cujo nome é "Consórcio". */
const ehConsorcio = (nome: string | null | undefined) =>
  ['consórcio', 'consorcio'].includes(String(nome ?? '').trim().toLowerCase());

/** Formas que se vinculam a uma instituição (banco / administradora) e têm observação editável. */
const ehFinInstituicao = (nome: string | null | undefined) =>
  ehFinanciamento(nome) || ehConsorcio(nome);

interface InstituicaoOpt {
  /** id da linha em formas_pagamento_instituicoes */
  id: string;
  cliente_fornecedor_id: string;
  nome: string;
  observacoes_contrato: string | null;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
};

/**
 * Percentual: "." e "," são sempre separador decimal. Aceita "12,5", "12.5",
 * "1.234,5" (o último separador é o decimal; os anteriores são milhar).
 */
const parsePct = (v: string): number | null => {
  const cleaned = v.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const s = cleaned.replace(/[.,](?=.*[.,])/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const tipoContaLabel = (v: string | null | undefined) => {
  if (v === 'corrente') return 'Corrente';
  if (v === 'poupanca') return 'Poupança';
  if (v === 'pagamento') return 'Pagamento';
  return v || undefined;
};

const fmtDataNasc = (v: string | null | undefined) =>
  v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1') : undefined;

const formatCpfCnpj = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
      d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
    );
  }
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
    e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
  );
};

const CurrencyField = ({ label, value, onChange, required, disabled }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) => (
  <div>
    <label className="text-sm font-medium text-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>
    <div className="relative mt-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        className="pl-10"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(formatCurrencyInput(e.target.value))}
        inputMode="numeric"
        disabled={disabled}
      />
    </div>
  </div>
);

/**
 * Textarea que cresce verticalmente conforme o texto (sem alça de redimensionar) e
 * refaz a altura quando a largura muda (ex.: tela encolhe e o texto quebra em mais
 * linhas) — nunca deixa conteúdo cortado.
 */
const AutoTextarea = ({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const larguraRef = useRef(0);
  const ajustarAltura = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  // Recalcula ao digitar / carregar valor.
  useLayoutEffect(ajustarAltura, [value]);
  // Recalcula quando a LARGURA do campo muda (resize da janela / do container).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    larguraRef.current = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w !== larguraRef.current) { larguraRef.current = w; ajustarAltura(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      className="resize-none overflow-hidden"
    />
  );
};

const formatPhone = (phone: string | null | undefined) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return phone;
};

const InfoDisplay = ({ label, value, valueClassName }: { label: string; value: string | null | undefined; valueClassName?: string }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className={cn('text-sm font-semibold', valueClassName)}>{value}</p>
    </div>
  ) : null
);

interface FormaPagamento {
  id?: string;
  forma_pagamento_id: string | null;
  /** nome da forma (denormalizado) */
  tipo: string;
  valor_total: number | null;
  valor_entrada: number | null;
  financeira: string | null;
  numero_parcelas: number | null;
  valor_parcelas: number | null;
  valor_financiado: number | null;
  /** Taxa de retorno (%) — só para Financiamento. */
  taxa_retorno_pct: number | null;
  /** data do pagamento (yyyy-MM-dd) — vira data_vencimento da parcela do compromisso a receber */
  data_pagamento: string | null;
  /** instituição (banco / administradora) escolhida — só para Financiamento / Consórcio */
  cliente_fornecedor_id: string | null;
  /** observação da forma, editável, com default vindo de formas_pagamento_instituicoes.observacoes_contrato */
  observacoes: string | null;
}

/** Converte uma linha de formas_pagamento_contrato (insert/update/select) para o formato usado no estado. */
const mapFormaRow = (data: any): FormaPagamento => ({
  id: data.id,
  forma_pagamento_id: data.forma_pagamento_id ?? null,
  tipo: data.tipo || '',
  valor_total: data.valor_total,
  valor_entrada: data.valor_entrada,
  financeira: data.financeira,
  numero_parcelas: data.numero_parcelas,
  valor_parcelas: data.valor_parcelas,
  valor_financiado: data.valor_financiado,
  taxa_retorno_pct: data.taxa_retorno_pct != null ? Number(data.taxa_retorno_pct) : null,
  data_pagamento: data.data_pagamento ?? null,
  cliente_fornecedor_id: data.cliente_fornecedor_id ?? null,
  observacoes: data.observacoes ?? '',
});

const ContratoDialog: React.FC<Props> = ({
  open, onOpenChange, atendimento, motosInteresse, motosAvaliacao, estoqueData, avaliacoes, onSaved,
  modo = 'contrato',
}) => {
  const { userName, user } = useAuth();
  const ehNfe = modo === 'nfe';
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);

  // ---- NF-e de venda ----
  const motoIntNfe = motosInteresse[0];
  const estItemNfe = motoIntNfe?.origem === 'estoque' && motoIntNfe?.estoque_moto_id ? estoqueData[motoIntNfe.estoque_moto_id] : null;
  const eh0kmVenda = motoIntNfe?.estoque_tipo === '0km' || estItemNfe?.tipo === '0km';
  const estoqueTabela = eh0kmVenda ? 'estoque_motos_novas' : 'estoque_motos';
  const tipoVenda = eh0kmVenda ? 'venda_0km' : 'venda_seminova';
  // Após a NF-e de venda autorizada, volta para a tela de Pós-Venda.
  const nfe = useNfeCompra(atendimento.id, open, tipoVenda, 'atendimento', () => {
    if (ehNfe) setTimeout(() => onOpenChange(false), 1200);
  });
  const nfeJaEmitida = nfe.emitida;
  // Contrato só trava depois de NF-e emitida em PRODUÇÃO — homologação é teste,
  // não deve bloquear edição/geração do contrato. O ambiente é fixo no servidor
  // (env var), então o da última emissão já indica o de qualquer emissão nova.
  const nfeEmProducao = nfeJaEmitida && nfe.nfe?.ambiente === 'producao';
  const soLeitura = ehNfe || nfeEmProducao;
  // Homologação permite reemitir mesmo com uma NF-e já autorizada (sempre com os
  // dados atuais do sistema) — em produção uma NF-e autorizada é definitiva, não reemite.
  const podeReemitirHomolog = nfeJaEmitida && nfe.nfe?.ambiente === 'homologacao';
  const [nfeValor, setNfeValor] = useState('');
  const [nfeObs, setNfeObs] = useState('');
  // ICMS-ST retido anteriormente (grupo <ICMS60> da NF de venda 0km) — transcrito
  // da NF de entrada da moto. Editável aqui e salvo em estoque_motos_novas.
  const [stBcRetido, setStBcRetido] = useState('');
  const [stValorSubstituto, setStValorSubstituto] = useState('');
  const [stValorRetido, setStValorRetido] = useState('');

  // Empresa emitente / vendedora (restrita à empresa vinculada à loja do atendimento).
  const [empresasLoja, setEmpresasLoja] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');
  // CPF/CNPJ do cliente já cadastrado é imutável; só permite preencher se estiver vazio.
  const [clienteCpfOriginal, setClienteCpfOriginal] = useState('');
  const cpfBloqueado = !!clienteCpfOriginal;
  // Cadastro completo do cliente (para embutir o ClienteForm, igual ao contrato de compra).
  const clienteId = atendimento.cliente_id || null;
  const [clienteRecord, setClienteRecord] = useState<any | null>(null);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteTocado, setClienteTocado] = useState(false);

  // IPVA
  const [ipvaTipo, setIpvaTipo] = useState<string>('');
  const [ipvaCotas, setIpvaCotas] = useState('');
  const [ipvaValor, setIpvaValor] = useState('');

  // Transferência
  const [transferenciaTipo, setTransferenciaTipo] = useState<string>('');
  const [transferenciaValor, setTransferenciaValor] = useState('');

  // Moto cliente
  const [valorQuitacao, setValorQuitacao] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');

  // Observações
  const [obsInternas, setObsInternas] = useState('');
  const [obsContrato, setObsContrato] = useState('');
  const [dataSinal, setDataSinal] = useState<Date | undefined>();
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>();

  // Valor sinal / venda
  const [valorSinal, setValorSinal] = useState('');
  const [valorVenda, setValorVenda] = useState('');

  // Formas de pagamento
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [formasPagOpcoes, setFormasPagOpcoes] = useState<{ id: string; nome: string }[]>([]);
  const [agregados, setAgregados] = useState<AgregadoLinha[]>([]);
  const [agregadoOpcoes, setAgregadoOpcoes] = useState<Agregado[]>([]);
  // instituições (banco / administradora) vinculadas a cada forma_pagamento_id
  const [instituicoesByForma, setInstituicoesByForma] = useState<Record<string, InstituicaoOpt[]>>({});
  // id do registro de formas_pagamento_contrato em edição (null = formulário está em modo "adicionar")
  const [editingId, setEditingId] = useState<string | null>(null);
  // id da forma_pagamento selecionada para adicionar
  const [novaPagamentoTipo, setNovaPagamentoTipo] = useState('');
  const novaFormaNome = formasPagOpcoes.find(f => f.id === novaPagamentoTipo)?.nome ?? '';
  // instituição + observação da forma sendo adicionada (Financiamento / Consórcio)
  const [novaInstituicaoId, setNovaInstituicaoId] = useState('');
  const [novaObservacoes, setNovaObservacoes] = useState('');
  // Financiamento fields
  const [finValorEntrada, setFinValorEntrada] = useState('');
  const [finParcelas, setFinParcelas] = useState('');
  const [finValorParcelas, setFinValorParcelas] = useState('');
  const [finValorFinanciado, setFinValorFinanciado] = useState('');
  const [finTaxaRetorno, setFinTaxaRetorno] = useState('');
  // Data do pagamento (yyyy-MM-dd) — comum a qualquer forma
  const [novaDataPagamento, setNovaDataPagamento] = useState('');
  // Other payment valor
  const [outroValor, setOutroValor] = useState('');

  const [sinalCalOpen, setSinalCalOpen] = useState(false);
  const [vencCalOpen, setVencCalOpen] = useState(false);
  const [pagCalOpen, setPagCalOpen] = useState(false);

  const hasTroca = atendimento.interesse === 'trocar' && motosAvaliacao.length > 0;
  // Troca: a NF-e de venda em PRODUÇÃO só libera depois da NF-e de compra da moto
  // da troca ter sido emitida em produção.
  const [trocaCompraProdOk, setTrocaCompraProdOk] = useState(false);

  // Load existing contract data
  useEffect(() => {
    if (!open) return;
    const loadContrato = async () => {
      setLoading(true);
      setEditingId(null);
      nfe.carregar();
      const [{ data: contrato }, { data: histGerado }, { data: freshAtendimento }, { data: freshEstoque }, { data: formasOpts }, { data: instOpts }, { data: agregadosOpts }] = await Promise.all([
        supabase
          .from('contratos')
          .select('*')
          .eq('atendimento_id', atendimento.id)
          .maybeSingle(),
        supabase
          .from('status_history')
          .select('id')
          .eq('entity_type', 'showroom')
          .eq('entity_id', atendimento.id)
          .eq('status', 'contrato_de_sinal')
          .limit(1),
        supabase
          .from('atendimentos_motos')
          .select('loja_id, cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))')
          .eq('id', atendimento.id)
          .maybeSingle(),
        // Lê valor_sinal/valor_venda pela MESMA chave usada no save: pelo id da moto do
        // estoque quando for de estoque (o vínculo atendimento_venda_id pode ainda não
        // existir na linha), senão pelo atendimento_venda_id.
        (motoIntNfe?.origem === 'estoque' && motoIntNfe?.estoque_moto_id
          ? supabase.from(estoqueTabela).select('valor_sinal, valor_venda').eq('id', motoIntNfe.estoque_moto_id).maybeSingle()
          : supabase.from(estoqueTabela).select('valor_sinal, valor_venda').eq('atendimento_venda_id', atendimento.id).maybeSingle()
        ),
        supabase
          .from('formas_pagamento')
          .select('id, nome')
          .eq('bpm', true)
          .eq('ativo', true)
          .order('ordem'),
        supabase
          .from('formas_pagamento_instituicoes')
          .select('id, forma_pagamento_id, cliente_fornecedor_id, observacoes_contrato, instituicao:cliente_fornecedor_id(nome_razao_social, nome_fantasia)')
          .eq('ativo', true),
        supabase
          .from('agregados_motos')
          .select('id, descricao, valor, empresa_id, ativo')
          .eq('ativo', true)
          .order('descricao'),
      ]);

      setFormasPagOpcoes((formasOpts as any[]) || []);
      setAgregadoOpcoes(((agregadosOpts as any[]) || []).map((a) => ({ id: a.id, descricao: a.descricao, valor: Number(a.valor) || 0, empresa_id: a.empresa_id, ativo: a.ativo !== false })));

      // ICMS-ST retido anteriormente — só moto 0km; prefill de estoque_motos_novas.
      if (eh0kmVenda && motoIntNfe?.estoque_moto_id) {
        const { data: stRow } = await supabase
          .from('estoque_motos_novas')
          .select('icms_st_bc_retido, icms_st_valor_substituto, icms_st_valor_retido')
          .eq('id', motoIntNfe.estoque_moto_id)
          .maybeSingle();
        const fc = (v: any) => (v != null ? formatCurrencyInput(String(Math.round(Number(v) * 100))) : '');
        setStBcRetido(fc((stRow as any)?.icms_st_bc_retido));
        setStValorSubstituto(fc((stRow as any)?.icms_st_valor_substituto));
        setStValorRetido(fc((stRow as any)?.icms_st_valor_retido));
      } else {
        setStBcRetido(''); setStValorSubstituto(''); setStValorRetido('');
      }

      // Troca: a NF-e de compra da moto que entra já foi emitida em produção?
      if (hasTroca) {
        const { data: cp } = await supabase
          .from('nfe_entradas')
          .select('id')
          .in('avaliacao_id', motosAvaliacao.map((m) => m.id))
          .eq('operacao', 'compra')
          .eq('ambiente', 'producao')
          .eq('status', 'processada')
          .limit(1);
        setTrocaCompraProdOk(!!(cp && cp.length));
      } else {
        setTrocaCompraProdOk(false);
      }

      type InstRow = {
        id: string;
        forma_pagamento_id: string;
        cliente_fornecedor_id: string;
        observacoes_contrato: string | null;
        instituicao: { nome_razao_social: string | null; nome_fantasia: string | null } | null;
      };
      const byForma: Record<string, InstituicaoOpt[]> = {};
      for (const r of ((instOpts ?? []) as InstRow[])) {
        (byForma[r.forma_pagamento_id] ??= []).push({
          id: r.id,
          cliente_fornecedor_id: r.cliente_fornecedor_id,
          nome: r.instituicao?.nome_fantasia || r.instituicao?.nome_razao_social || 'Instituição',
          observacoes_contrato: r.observacoes_contrato ?? null,
        });
      }
      for (const k of Object.keys(byForma)) {
        byForma[k].sort((a, b) => a.nome.localeCompare(b.nome));
      }
      setInstituicoesByForma(byForma);

      setJaGerado(!!(histGerado && histGerado.length > 0));

      // Empresa vinculada à loja do atendimento (emitente da NF-e / vendedora no contrato).
      const lojaId = (freshAtendimento as any)?.loja_id ?? (atendimento as any).loja_id;
      let empresas: any[] = [];
      if (lojaId) {
        const { data: le } = await supabase
          .from('loja_empresas')
          .select('empresa_id, empresas:empresa_id(id, nome, razao_social, cnpj, uf)')
          .eq('id', lojaId);
        const seen = new Set<string>();
        empresas = (le || [])
          .map((r: any) => r.empresas)
          .filter((e: any) => e && !seen.has(e.id) && seen.add(e.id));
      }
      setEmpresasLoja(empresas);
      setEmpresaId((contrato as any)?.empresa_id || empresas[0]?.id || '');

      const atSinal = freshEstoque?.valor_sinal ?? (atendimento as any).valor_sinal;
      const atVenda = freshEstoque?.valor_venda ?? (atendimento as any).valor_venda;
      // Quitação e Fechamento da moto do cliente vêm da avaliação (origem) — não são editados no contrato.
      const avTroca = motosAvaliacao[0] ? avaliacoes[motosAvaliacao[0].id] : null;
      const avQuitacao = avTroca?.valor_quitacao;
      const avFechamento = avTroca?.valor_fechamento;
      const fmtCur = (v: number) => formatCurrencyInput(String(Math.round(v * 100)));
      const atCpf = (freshAtendimento as any)?.cliente?.cpf_cnpj ?? atendimento.cliente?.cpf_cnpj;
      setClienteCpfOriginal(atCpf ? String(atCpf) : '');
      if ((freshAtendimento as any)?.cliente) setClienteRecord((freshAtendimento as any).cliente);
      setEditandoCliente(false);

      if (contrato) {
        setContratoId(contrato.id);
        setCpfCnpj(contrato.cpf_cnpj || atCpf || '');
        setIpvaTipo(contrato.ipva_tipo || '');
        setIpvaCotas(contrato.ipva_cotas ? String(contrato.ipva_cotas) : '');
        setIpvaValor(contrato.ipva_valor != null ? formatCurrencyInput(String(Math.round(contrato.ipva_valor * 100))) : '');
        setTransferenciaTipo(contrato.transferencia_tipo || '');
        setTransferenciaValor(contrato.transferencia_valor != null ? formatCurrencyInput(String(Math.round(contrato.transferencia_valor * 100))) : '');
        setValorQuitacao(contrato.valor_quitacao != null ? fmtCur(contrato.valor_quitacao) : (avQuitacao != null ? fmtCur(avQuitacao) : ''));
        setValorFechamento(contrato.valor_fechamento != null ? fmtCur(contrato.valor_fechamento) : (avFechamento != null ? fmtCur(avFechamento) : ''));
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataSinal(contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined);
        setDataVencimento(contrato.data_vencimento_sinal ? new Date(contrato.data_vencimento_sinal + 'T12:00:00') : undefined);
        setValorSinal(atSinal != null ? formatCurrencyInput(String(Math.round(atSinal * 100))) : '');
        setValorVenda(atVenda != null ? formatCurrencyInput(String(Math.round(atVenda * 100))) : '');

        // Load formas de pagamento
        const { data: formas } = await supabase
          .from('formas_pagamento_contrato')
          .select('*')
          .eq('contrato_id', contrato.id)
          .order('created_at', { ascending: true });
        if (formas) {
          setFormasPagamento(formas.map(mapFormaRow));
        }

        const { data: ags } = await supabase
          .from('contratos_agregados')
          .select('agregado_id, descricao, valor, observacoes, cortesia')
          .eq('contrato_id', contrato.id)
          .order('created_at', { ascending: true });
        setAgregados(((ags as any[]) || []).map((a) => ({
          agregado_id: a.agregado_id,
          descricao: a.descricao,
          valor: Number(a.valor) || 0,
          observacoes: a.observacoes ?? null,
          cortesia: !!a.cortesia,
        })));
      } else {
        // Reset
        setContratoId(null);
        setCpfCnpj(atCpf || '');
        setIpvaTipo('');
        setIpvaCotas('');
        setIpvaValor('');
        setTransferenciaTipo('');
        setTransferenciaValor('');
        setValorQuitacao(avQuitacao != null ? fmtCur(avQuitacao) : '');
        setValorFechamento(avFechamento != null ? fmtCur(avFechamento) : '');
        setObsInternas('');
        setObsContrato('');
        setDataSinal(undefined);
        setDataVencimento(undefined);
        setFormasPagamento([]);
        setAgregados([]);
        setValorSinal(atSinal != null ? formatCurrencyInput(String(Math.round(atSinal * 100))) : '');
        setValorVenda(atVenda != null ? formatCurrencyInput(String(Math.round(atVenda * 100))) : '');
      }
      setLoading(false);
    };
    loadContrato();
  }, [open, atendimento.id]);

  // Valor default da NF-e de venda = valor de venda da moto.
  useEffect(() => {
    if (!open) return;
    setNfeValor((prev) => prev || valorVenda);
  }, [open, valorVenda]);

  // Observações da NF-e: copia automaticamente as observações das formas de pagamento
  // vinculadas a instituição (Financiamento / Consórcio) — só preenche se ainda estiver
  // vazio, pra não sobrescrever edição manual do usuário.
  useEffect(() => {
    if (!open || !ehNfe || nfeObs) return;
    const dasFormas = formasPagamento
      .filter(fp => ehFinInstituicao(fp.tipo) && fp.observacoes?.trim())
      .map(fp => fp.observacoes!.trim())
      .join(' ');
    if (dasFormas) setNfeObs(dasFormas.toUpperCase());
  }, [open, ehNfe, formasPagamento, nfeObs]);

  const handleEmitirNf = (ambiente: 'homologacao' | 'producao') =>
    nfe.emitir({
      valor: parseCurrencyInput(nfeValor),
      observacoes: nfeObs || undefined,
      empresa_id: empresaId || undefined,
      ambiente,
    });

  const resetPagamentoForm = () => {
    setNovaPagamentoTipo('');
    setNovaInstituicaoId('');
    setNovaObservacoes('');
    setFinValorEntrada('');
    setFinParcelas('');
    setFinValorParcelas('');
    setFinValorFinanciado('');
    setFinTaxaRetorno('');
    setNovaDataPagamento('');
    setOutroValor('');
  };

  /** Preenche o formulário com os dados de uma forma já lançada, para edição. */
  const handleEditPagamento = (fp: FormaPagamento) => {
    setEditingId(fp.id || null);
    setNovaPagamentoTipo(fp.forma_pagamento_id || '');
    // novaInstituicaoId guarda o id da linha em formas_pagamento_instituicoes, não o cliente_fornecedor_id.
    const instMatch = fp.cliente_fornecedor_id
      ? (instituicoesByForma[fp.forma_pagamento_id || ''] || []).find(i => i.cliente_fornecedor_id === fp.cliente_fornecedor_id)
      : undefined;
    setNovaInstituicaoId(instMatch?.id || '');
    setNovaObservacoes(fp.observacoes || '');
    setFinValorEntrada(fp.valor_entrada != null ? formatCurrencyInput(String(Math.round(fp.valor_entrada * 100))) : '');
    setFinParcelas(fp.numero_parcelas != null ? String(fp.numero_parcelas) : '');
    setFinValorParcelas(fp.valor_parcelas != null ? formatCurrencyInput(String(Math.round(fp.valor_parcelas * 100))) : '');
    setFinValorFinanciado(fp.valor_financiado != null ? formatCurrencyInput(String(Math.round(fp.valor_financiado * 100))) : '');
    setFinTaxaRetorno(fp.taxa_retorno_pct != null ? String(fp.taxa_retorno_pct) : '');
    setNovaDataPagamento(fp.data_pagamento || '');
    setOutroValor(fp.valor_total != null ? formatCurrencyInput(String(Math.round(fp.valor_total * 100))) : '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    resetPagamentoForm();
  };

  const handleAddPagamento = async () => {
    if (!novaPagamentoTipo) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    const ehInst = ehFinInstituicao(novaFormaNome);
    const instSel = ehInst
      ? (instituicoesByForma[novaPagamentoTipo] || []).find(i => i.id === novaInstituicaoId)
      : undefined;
    if (ehInst && !instSel) {
      toast.error('Selecione o banco / administradora');
      return;
    }

    // Campos zerados por padrão para não deixar resíduo de outra forma ao editar (ex.: trocar Financiamento -> Pix).
    const formaData: any = {
      forma_pagamento_id: novaPagamentoTipo,
      tipo: novaFormaNome,
      valor_total: null,
      valor_entrada: null,
      numero_parcelas: null,
      valor_parcelas: null,
      valor_financiado: null,
      taxa_retorno_pct: null,
      data_pagamento: null,
      cliente_fornecedor_id: null,
      financeira: null,
      observacoes: null,
    };

    if (ehFinanciamento(novaFormaNome)) {
      formaData.valor_entrada = parseCurrencyInput(finValorEntrada) || null;
      formaData.numero_parcelas = finParcelas ? parseInt(finParcelas) : null;
      formaData.valor_parcelas = parseCurrencyInput(finValorParcelas) || null;
      formaData.valor_financiado = parseCurrencyInput(finValorFinanciado) || null;
      formaData.taxa_retorno_pct = parsePct(finTaxaRetorno);
    } else {
      formaData.valor_total = parseCurrencyInput(outroValor) || null;
    }

    if (ehInst && instSel) {
      formaData.cliente_fornecedor_id = instSel.cliente_fornecedor_id;
      formaData.financeira = instSel.nome; // denormalizado p/ PDF e lista
    }
    // Observação é livre pra qualquer forma de pagamento, não só as vinculadas a instituição.
    formaData.observacoes = novaObservacoes.trim() || null;
    // Data do pagamento (opcional) — vira data_vencimento da parcela do compromisso a receber.
    formaData.data_pagamento = novaDataPagamento || null;

    // A soma das formas de pagamento não pode passar do Valor Total (financiamento conta
    // só o valor financiado; na troca o valor de fechamento da moto já entra em `somaPagamentos`).
    if (valorTotalContrato > 0.005) {
      const contribNova = ehFinanciamento(novaFormaNome)
        ? Number(formaData.valor_financiado) || 0
        : Number(formaData.valor_total) || 0;
      const fpAntiga = editingId ? formasPagamento.find((f) => f.id === editingId) : undefined;
      const contribAntiga = fpAntiga
        ? (ehFinanciamento(fpAntiga.tipo) ? (Number(fpAntiga.valor_financiado) || 0) : (Number(fpAntiga.valor_total) || 0))
        : 0;
      const jaPago = somaPagamentos - contribAntiga;
      if (jaPago + contribNova > valorTotalContrato + 0.005) {
        const restante = Math.max(valorTotalContrato - jaPago, 0);
        toast.error(`A soma das formas de pagamento não pode passar do Valor Total (${formatCurrency(valorTotalContrato)}). Restante: ${formatCurrency(restante)}.`);
        return;
      }
    }

    if (editingId) {
      const { data, error } = await supabase.from('formas_pagamento_contrato').update(formaData).eq('id', editingId).select().single();
      if (error) {
        toast.error('Erro ao salvar forma de pagamento');
        return;
      }
      setFormasPagamento(prev => prev.map(f => f.id === editingId ? mapFormaRow(data) : f));
      setEditingId(null);
      resetPagamentoForm();
      toast.success('Forma de pagamento atualizada');
      return;
    }

    // Ensure contrato exists first
    let cId = contratoId;
    if (!cId) {
      cId = await saveContrato();
      if (!cId) return;
    }

    const { data, error } = await supabase.from('formas_pagamento_contrato').insert({ ...formaData, contrato_id: cId }).select().single();
    if (error) {
      toast.error('Erro ao adicionar forma de pagamento');
      return;
    }
    setFormasPagamento(prev => [...prev, mapFormaRow(data)]);
    resetPagamentoForm();
    toast.success('Forma de pagamento adicionada');
  };

  const handleRemovePagamento = async (id: string) => {
    await supabase.from('formas_pagamento_contrato').delete().eq('id', id);
    setFormasPagamento(prev => prev.filter(f => f.id !== id));
    if (editingId === id) handleCancelEdit();
    toast.success('Forma de pagamento removida');
  };

  const saveContrato = async (): Promise<string | null> => {
    if (soLeitura) {
      if (nfeEmProducao) toast.error('Contrato bloqueado: NF-e de venda já emitida em produção.');
      return contratoId;
    }
    setSaving(true);
    const payload: any = {
      atendimento_id: atendimento.id,
      cpf_cnpj: cpfCnpj || null,
      empresa_id: empresaId || null,
      ipva_tipo: ipvaTipo || null,
      ipva_cotas: ipvaTipo === 'ambos' && ipvaCotas ? ipvaCotas : null,
      // Valor pago pela loja: vale para "Loja" (paga tudo) e "Ambos" (paga a parte dela).
      ipva_valor: (ipvaTipo === 'loja' || ipvaTipo === 'ambos') && ipvaValor?.trim() ? parseCurrencyInput(ipvaValor) : null,
      transferencia_tipo: transferenciaTipo || null,
      transferencia_valor: transferenciaTipo === 'cliente' ? parseCurrencyInput(transferenciaValor) || null : null,
      valor_quitacao: valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      observacoes_internas: obsInternas || null,
      observacoes_contrato: obsContrato || null,
      data_sinal: dataSinal ? format(dataSinal, 'yyyy-MM-dd') : null,
      data_vencimento_sinal: dataVencimento ? format(dataVencimento, 'yyyy-MM-dd') : null,
    };

    // Save valor_sinal/valor_venda to estoque, cpf_cnpj to cliente
    const estoqueUpdate: any = {};
    const parsedSinal = parseCurrencyInput(valorSinal);
    const parsedVenda = parseCurrencyInput(valorVenda);
    if (parsedSinal !== null) estoqueUpdate.valor_sinal = parsedSinal;
    if (parsedVenda !== null) estoqueUpdate.valor_venda = parsedVenda;
    if (Object.keys(estoqueUpdate).length > 0) {
      if (motoIntNfe?.origem === 'estoque' && motoIntNfe?.estoque_moto_id) {
        // Filtra pelo id da moto (não por atendimento_venda_id): o contrato pode ser o
        // primeiro passo a gravar um valor, antes desse vínculo existir no estoque.
        estoqueUpdate.atendimento_venda_id = atendimento.id;
        const r = await supabase.from(estoqueTabela).update(estoqueUpdate).eq('id', motoIntNfe.estoque_moto_id).select('id');
        if (r.error || (r.data?.length ?? 0) === 0) {
          console.error('[contrato] Falha ao gravar Valor do Sinal / Valor da Venda no estoque', { error: r.error, matched: r.data?.length ?? 0, estoqueTabela });
          toast.error('Não foi possível salvar o Valor do Sinal / Valor da Venda (permissão no estoque). Avise um gerente.');
        }
      } else {
        await supabase.from(estoqueTabela).update(estoqueUpdate).eq('atendimento_venda_id', atendimento.id);
      }
    }
    // CPF/CNPJ do cliente é imutável: só grava se o cliente ainda não tinha um.
    if (cpfCnpj && atendimento.cliente_id && !cpfBloqueado) {
      await supabase.from('clientes_fornecedores').update({ cpf_cnpj: cpfCnpj }).eq('id', atendimento.cliente_id);
    }

    // Agregados: substitui a lista inteira do contrato (delete + insert).
    const syncAgregados = async (cId: string) => {
      await supabase.from('contratos_agregados').delete().eq('contrato_id', cId);
      if (agregados.length > 0) {
        await supabase.from('contratos_agregados').insert(
          agregados.map((a) => ({
            contrato_id: cId,
            agregado_id: a.agregado_id,
            descricao: a.descricao,
            valor: Number(a.valor) || 0,
            observacoes: (a.observacoes ?? '').trim() || null,
            cortesia: !!a.cortesia,
          })),
        );
      }
    };

    if (contratoId) {
      const { error } = await supabase.from('contratos').update(payload).eq('id', contratoId);
      if (error) {
        toast.error('Erro ao salvar contrato');
        setSaving(false);
        return null;
      }
      // Sync valor_fechamento to avaliacoes
      const parsedFechamento = parseCurrencyInput(valorFechamento);
      if (parsedFechamento && parsedFechamento > 0 && hasTroca) {
        const { data: avs } = await supabase.from('avaliacoes').select('id').eq('atendimento_id', atendimento.id);
        if (avs && avs.length > 0) {
          await Promise.all(avs.map(av => supabase.from('avaliacoes').update({ valor_fechamento: parsedFechamento }).eq('id', av.id)));
        }
      }
      await syncAgregados(contratoId);
      setSaving(false);
      return contratoId;
    } else {
      const { data, error } = await supabase.from('contratos').insert(payload).select().single();
      if (error) {
        toast.error('Erro ao criar contrato');
        setSaving(false);
        return null;
      }
      setContratoId(data.id);
      await syncAgregados(data.id);
      setSaving(false);
      return data.id;
    }
  };

  const handleSave = async () => {
    const id = await saveContrato();
    if (id) {
      toast.success('Proposta salva com sucesso!');
      onSaved?.();
      onOpenChange(false);
    }
  };

  const handleClienteSaved = async (savedId: string) => {
    setClienteTocado(true);
    const { data } = await supabase
      .from('clientes_fornecedores')
      .select('*, clientes_fornecedores_enderecos(*)')
      .eq('id', savedId)
      .maybeSingle();
    if (data) {
      setClienteRecord(data);
      if ((data as any).cpf_cnpj) {
        setCpfCnpj(formatCpfCnpj((data as any).cpf_cnpj));
        setClienteCpfOriginal(String((data as any).cpf_cnpj));
      }
    }
    setEditandoCliente(false);
  };

  // Resumo do cliente (quando o cadastro está completo) — igual ao contrato de compra.
  const cli = clienteRecord;
  // Endereço COMERCIAL (tipo='fiscal') — o cliente pode ter mais de uma linha
  // (ex.: 'residencial', PJ) em clientes_fornecedores_enderecos.
  const cliEndereco = (cli?.clientes_fornecedores_enderecos as any[] | undefined)?.find((e) => e.tipo === 'fiscal')
    ?? cli?.clientes_fornecedores_enderecos?.[0] ?? null;
  // Dados bancários do cliente só são obrigatórios quando há troca E a loja fica
  // devendo pro cliente — ou seja, o valor de fechamento da moto que entra é
  // maior que o valor da moto vendida (aí a loja paga a diferença nessa conta).
  // Se a moto da troca vale menos que a vendida, o cliente é que paga a
  // diferença: não precisa dos dados bancários.
  const exigirBancarios = hasTroca
    && parseCurrencyInput(valorFechamento) > parseCurrencyInput(valorVenda);
  const cadastroCompleto = cadastroClienteCompleto(cli, cliEndereco, { exigirBancarios });
  // Pendências de cadastro para emissão de NF-e, por card. Só usadas quando ehNfe.
  const pendenciasNf = pendenciasCadastroCliente(cli, cliEndereco, { exigirBancarios });
  const nfSemPendencias = semPendencias(pendenciasNf);
  const fmtTelefone = (v: string | null | undefined) => {
    const d = (v || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v || undefined;
  };


  // Get moto de interesse data
  const motoInt = motosInteresse[0];
  const estItem = motoInt?.origem === 'estoque' && motoInt?.estoque_moto_id ? estoqueData[motoInt.estoque_moto_id] : null;

  // Get moto do cliente data
  const motoAv = motosAvaliacao[0];
  const avaliacaoData = motoAv ? avaliacoes[motoAv.id] : null;

  const buildPdfData = (): ContratoPdfData | null => {
    const produtoMarca = estItem?.marca || motoInt?.marca || '';
    const produtoModelo = estItem?.modelo || motoInt?.modelo || '';
    const produtoAnoFab = estItem?.ano_fabricacao || '';
    const produtoAnoMod = estItem?.ano_modelo || motoInt?.ano || '';
    // Moto 0km normalmente ainda não tem placa — usa o chassi do estoque (estoque_motos_novas) nesse caso.
    const produtoPlaca = (estItem?.placa || '')?.replace(/-/g, '') || estItem?.chassi || motoInt?.chassi || 'N/A';
    const produtoCor = (estItem?.cor || '').toUpperCase();

    // Cliente: prioriza o registro completo carregado (cli) — o `atendimento.cliente`
    // da prop pode vir parcial (ex.: PJ sem razão social/telefone).
    const cliPdf = cli || atendimento.cliente || {};
    const telefoneCliente = cliPdf.telefone || cliPdf.telefone_comercial || '';
    const maskCep = (v: string) => { const d = String(v || '').replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
    const enderecoCompleto = cliEndereco
      ? [
          [cliEndereco.logradouro, cliEndereco.numero].filter(Boolean).join(', '),
          cliEndereco.complemento,
          cliEndereco.bairro,
          [cliEndereco.cidade, cliEndereco.uf].filter(Boolean).join('/'),
          cliEndereco.cep ? `CEP ${maskCep(cliEndereco.cep)}` : null,
        ].filter(Boolean).join(' - ')
      : '';

    const pdfData: ContratoPdfData = {
      loja: atendimento.loja,
      empresaMotoInteresse: estItem?.empresa || null,
      nomeCliente: cliPdf.nome_razao_social || '',
      telefone: (telefoneCliente ? formatPhone(telefoneCliente) : telefoneCliente) || '',
      emailCliente: cliPdf.email || '',
      enderecoCompleto,
      cpfCnpj,
      produtoMarca: produtoMarca.toUpperCase(),
      produtoModelo: produtoModelo.toUpperCase(),
      produtoAnoFabMod: [produtoAnoFab, produtoAnoMod].filter(Boolean).join('/'),
      produtoAnoFabricacao: produtoAnoFab,
      produtoAnoModelo: produtoAnoMod,
      produtoCor,
      produtoPlacaChassi: produtoPlaca,
      vendedorNome: userName || 'Vendedor',
      valorSinal: `R$ ${valorSinal}`,
      valorVenda: `R$ ${valorVenda}`,
      valorTotal: formatCurrency(valorTotalContrato),
      transferenciaTipo: transferenciaTipo || null,
      transferenciaValor: transferenciaValor ? `R$ ${transferenciaValor}` : null,
      ipvaTipo: ipvaTipo || null,
      ipvaCotas: ipvaCotas || null,
      observacoes: obsContrato || '',
      dataSinal: dataSinal ? format(dataSinal, "dd/MM/yyyy", { locale: ptBR }) : '',
      dataVencimento: dataVencimento ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR }) : '',
      formasPagamento: formasPagamento.map(f => {
        const fmt = (v: number | null | undefined) => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';
        const dataPagamento = f.data_pagamento
          ? format(new Date(`${f.data_pagamento}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })
          : '';
        if (ehFinanciamento(f.tipo)) {
          return {
            tipo: 'financiamento',
            descricao: f.tipo || 'Financiamento',
            valor: fmt(f.valor_financiado),
            financeira: f.financeira || '',
            valorEntrada: fmt(f.valor_entrada),
            numeroParcelas: f.numero_parcelas || 0,
            valorParcelas: fmt(f.valor_parcelas),
            valorFinanciado: fmt(f.valor_financiado),
            dataPagamento,
            observacoes: f.observacoes || '',
          };
        }
        return {
          tipo: f.tipo,
          descricao: tipoLabel(f.tipo),
          valor: fmt(f.valor_total),
          financeira: f.financeira || '',
          dataPagamento,
          observacoes: f.observacoes || '',
        };
      }),
      agregados: agregados.map((a) => ({
        descricao: a.descricao,
        valor: `R$ ${(Number(a.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        cortesia: !!a.cortesia,
      })),
    };

    // Troca info
    if (hasTroca && motoAv) {
      pdfData.troca = {
        marca: (motoAv.marca || '').toUpperCase(),
        modelo: (motoAv.modelo || '').toUpperCase(),
        anoFabMod: [motoAv.ano_fabricacao, motoAv.ano_modelo].filter(Boolean).join('/'),
        placaChassi: (motoAv.placa || '')?.replace(/-/g, '') || 'N/A',
        km: motoAv.km || 'N/A',
        valorQuitacao: `R$ ${valorQuitacao || '0,00'}`,
        // Sem Valor de Fechamento, usa o repasse de compra ao cliente
        // (Avaliação − Custos Loja), igual ao cálculo do Valor Faltante.
        valorNegociado: parseCurrencyInput(valorFechamento) > 0
          ? `R$ ${valorFechamento}`
          : formatCurrency(valorRepasseTroca || 0),
      };
    }

    return pdfData;
  };

  // Campos obrigatórios pendentes para gerar o contrato (sinal/venda). Sem toast — usado
  // tanto para bloquear/ocultar os botões quanto pela validação abaixo (com toast).
  const errosGeracao: string[] = (() => {
    const errors: string[] = [];
    if (!empresaId) errors.push('Empresa vendedora');
    if (!cpfCnpj) errors.push('CPF/CNPJ do cliente');
    if (!valorSinal) errors.push('Valor do Sinal');
    if (!valorVenda) errors.push('Valor da Venda');
    if (!dataSinal) errors.push('Data do Sinal');
    if (!dataVencimento) errors.push('Data de Vencimento do Sinal');

    if (!motoInt && !estItem) errors.push('Moto de Interesse');
    if (!transferenciaTipo) errors.push('Transferência');
    if (transferenciaTipo === 'cliente' && !transferenciaValor) errors.push('Valor da Transferência');
    const isDucati = atendimento.loja?.toLowerCase().startsWith('ducati');
    if (!isDucati && !ipvaTipo) errors.push('IPVA');
    if (!isDucati && ipvaTipo === 'ambos' && !ipvaCotas) errors.push('Número de Cotas do IPVA');
    if (!isDucati && (ipvaTipo === 'loja' || ipvaTipo === 'ambos') && !ipvaValor) errors.push('Valor do IPVA');
    // Quitação da moto do cliente é obrigatória quando há troca — vem da avaliação (informar 0 se não houver).
    if (hasTroca && !valorQuitacao?.trim()) errors.push('Valor de Quitação da moto do cliente (defina na avaliação — 0 se não houver)');
    if (!obsContrato && !obsContrato.trim()) errors.push('Observações do Contrato');
    return errors;
  })();

  const validateForGeneration = (): boolean => {
    if (errosGeracao.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${errosGeracao.join(', ')}`);
      return false;
    }
    return true;
  };

  const handleGerar = async (variant: 'sinal' | 'venda' = 'sinal') => {
    if (!validateForGeneration()) return;
    // Venda de moto nova (Ducati): exige a moto do estoque de novas selecionada.
    if (variant === 'venda' && !soLeitura && exigeMotoNovaParaVenda) {
      toast.error('Selecione a moto do estoque de novas na Moto de Interesse para gerar a venda. Sem ela, só é possível gerar o sinal.');
      return;
    }
    // Só a proposta de VENDA exige as formas de pagamento cobrindo 100% do total.
    if (variant === 'venda' && !soLeitura && valorFaltante > 0.005) {
      toast.error(`As formas de pagamento ainda não cobrem o Valor Total. Valor faltante: ${formatCurrency(valorFaltante)}.`);
      return;
    }

    setGenerating(true);
    // Somente leitura (NF-e de venda já emitida em produção): não salva nada, só
    // regera o PDF a partir do contrato já persistido — download continua liberado.
    const id = soLeitura ? contratoId : await saveContrato();
    if (!id) {
      setGenerating(false);
      return;
    }

    try {
      const pdfData = buildPdfData();
      if (!pdfData) throw new Error('Dados insuficientes');

      await generateContratoPdf(pdfData, variant);

      if (!soLeitura) {
        // Registrar no histórico de movimentações (só na geração "real", não no re-download).
        if (user) {
          await supabase.from('status_history').insert({
            entity_type: 'showroom',
            entity_id: atendimento.id,
            status: variant === 'venda' ? 'contrato_de_venda' : 'contrato_de_sinal',
            changed_by: user.id,
            changed_by_name: userName || 'Vendedor',
          });
        }
        setJaGerado(true);

        // Proposta de VENDA → gera o compromisso financeiro a receber (parcelas =
        // formas de pagamento) e, se houver troca, o a pagar da moto da troca.
        // Best-effort: não bloqueia o PDF nem a tela.
        if (variant === 'venda') {
          supabase.functions
            .invoke('gerar-compromissos-proposta', { body: { acao: 'venda', atendimento_id: atendimento.id } })
            .then(({ error }) => { if (error) console.error('gerar-compromissos-proposta (venda)', error); });
        }
      }
      toast.success(variant === 'venda' ? 'Proposta de venda gerada com sucesso!' : 'Proposta gerada com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      toast.error('Erro ao gerar o contrato PDF');
    } finally {
      setGenerating(false);
    }
  };

  

  const handleVisualizar = async () => {
    if (!validateForGeneration()) return;

    setViewing(true);
    try {
      const id = soLeitura ? contratoId : await saveContrato();
      if (!id) { setViewing(false); return; }
      const pdfData = buildPdfData();
      if (!pdfData) throw new Error('Dados insuficientes');
      await generateContratoPdf(pdfData, 'sinal');
      toast.success('Proposta visualizada');
    } catch (err) {
      console.error('Erro ao visualizar PDF:', err);
      toast.error('Erro ao visualizar o contrato PDF');
    } finally {
      setViewing(false);
    }
  };

  const lojaLower = (atendimento.loja || '').toLowerCase();
  // Atendimento Ducati = negociação de moto 0km. A VENDA (contrato de venda) exige
  // a moto do estoque de novas selecionada; sem ela, só sinal / contrato de sinal.
  const ehAtendimentoMotoNova = lojaLower.startsWith('ducati');
  const motoNovaEstoqueSelecionada = !!estItem && ((estItem as any).fonte === '0km' || (estItem as any).tipo === '0km');
  const exigeMotoNovaParaVenda = ehAtendimentoMotoNova && !motoNovaEstoqueSelecionada;
  const canGerarVenda = ['ducati bsb', 'ducati fln', 'ducati poa', '299i', '299s', '299f', '299p', 'aventura'].includes(lojaLower)
    && atendimento.situacao === 'vendido'
    && !exigeMotoNovaParaVenda;

  const tipoLabel = (tipo: string) => tipo || '—';

  // Total de taxas administrativas cobrado do CLIENTE. Hoje só a transferência tem valor
  // e só é cobrada do cliente quando o tipo é "Cliente" (IPVA: o valor informado é a parte
  // da loja; "cliente"/"ambos" não têm valor numérico da parte do cliente).
  const totalTaxasCliente = transferenciaTipo === 'cliente' ? (parseCurrencyInput(transferenciaValor) || 0) : 0;

  // Preço de referência da moto: "Preço Ação" quando existir (> 0), senão o "Preço" de tabela.
  // Usado em todos os cálculos e comparações de venda.
  const precoTabela = (Number(estItem?.preco_acao) || 0) > 0 ? Number(estItem.preco_acao) : (Number(estItem?.preco) || 0);
  const vendaNum = parseCurrencyInput(valorVenda);
  // Variação da venda vs. preço de referência: + = acréscimo (verde), − = desconto (vermelho).
  const vendaVarPct = precoTabela > 0 && vendaNum > 0 ? ((vendaNum - precoTabela) / precoTabela) * 100 : null;
  // Acréscimo/desconto exibido como percentual inteiro (arredondado).
  const vendaVarPctInt = vendaVarPct != null ? Math.round(vendaVarPct) : null;

  // --- KPIs do resumo (abaixo do card Formas de Pagamento) ---
  // Agregado marcado como cortesia não é cobrado do cliente — fora de todo cálculo.
  const totalAgregados = agregados.reduce((s, a) => s + (a.cortesia ? 0 : Number(a.valor) || 0), 0);
  const totalTaxasEAgregados = totalAgregados + totalTaxasCliente;
  // O que o cliente deve: venda + agregados + taxas administrativas cobradas do cliente.
  const valorTotalContrato = vendaNum + totalTaxasEAgregados;
  // O que já está coberto pelas formas de pagamento (financiamento = só o valor financiado,
  // a entrada é lançada à parte; demais = valor total) + o valor de fechamento da moto do
  // cliente, quando há troca.
  const somaFormasPagamento = formasPagamento.reduce((s, fp) => (
    ehFinanciamento(fp.tipo)
      ? s + (Number(fp.valor_financiado) || 0)
      : s + (Number(fp.valor_total) || 0)
  ), 0);
  // Repasse ao cliente pela moto da troca (mesma conta do card "Moto do Cliente":
  // avaliação de compra − custos da loja).
  // Custos da loja ausentes contam como 0 — o valor de aquisição da moto do
  // cliente (Avaliação Compra) tem de entrar no abatimento mesmo sem custos.
  const valorRepasseTroca = hasTroca && avaliacaoData?.avaliacao_compra != null
    ? Math.max(Number(avaliacaoData.avaliacao_compra) - Number(avaliacaoData.previsao_custos_loja ?? 0), 0)
    : 0;
  // O quanto a moto da troca abate do Valor Faltante — a moto do cliente entra
  // como pagamento pelo seu valor cheio:
  //  - com Valor de Fechamento preenchido: o próprio Valor de Fechamento;
  //  - sem Valor de Fechamento: o repasse de compra (Avaliação − Custos Loja).
  const fechamentoTrocaNum = parseCurrencyInput(valorFechamento);
  const abatimentoTroca = hasTroca
    ? (fechamentoTrocaNum > 0 ? fechamentoTrocaNum : valorRepasseTroca)
    : 0;
  const somaPagamentos = somaFormasPagamento + abatimentoTroca;
  const valorFaltante = valorTotalContrato - somaPagamentos;

  // Só libera gerar contrato quando não há campo obrigatório pendente E as formas
  // de pagamento cobrem 100% do Valor Total (valor faltante zerado).
  const vendaBloqueadaAprovacao = !vendaLiberada(atendimento as any);
  // Contrato de SINAL: campos obrigatórios preenchidos e Valor da Venda definido.
  // NÃO exige aprovação do master nem que as formas de pagamento cubram 100% do
  // total — o sinal é "paga o sinal agora, o resto até o vencimento".
  const podeGerarSinal = errosGeracao.length === 0 && valorTotalContrato > 0.005;
  // Contrato de VENDA (proposta finalizada): além do acima, formas de pagamento
  // cobrindo 100% do Valor Total e aprovação do master.
  const podeGerarContrato = podeGerarSinal && valorFaltante <= 0.005 && !vendaBloqueadaAprovacao
    && !exigeMotoNovaParaVenda;

  if (!open) return null;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> {ehNfe ? 'Emissão de NF-e de Venda' : 'Emissão de Proposta'}
        </h1>
        {ehNfe && <NfeCabecalhoAcoes nfe={nfe} />}
      </div>

      {nfeEmProducao && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> NF-e de venda emitida em produção — contrato bloqueado para edição.
        </div>
      )}

      {!ehNfe && vendaBloqueadaAprovacao && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> Proposta aguardando aprovação — o contrato de sinal já pode ser gerado; a proposta de venda libera após a aprovação do seu Gestor.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
              {/* Card: Empresa Vendedora */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" /> Empresa Vendedora
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent>
                  {empresasLoja.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada à loja do atendimento.</p>
                  ) : soLeitura ? (
                    <InfoDisplay
                      label="Empresa"
                      value={(() => {
                        const e = empresasLoja.find((x) => x.id === empresaId);
                        if (!e) return '—';
                        return `${e.razao_social || e.nome}${e.cnpj ? ` - ${e.cnpj}` : ''}`;
                      })()}
                    />
                  ) : (
                    <div className="space-y-1.5 max-w-sm">
                      <Label>Empresa vendedora <span className="text-destructive">*</span></Label>
                      <Select value={empresaId} onValueChange={setEmpresaId}>
                        <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                        <SelectContent>
                          {empresasLoja.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {(e.razao_social || e.nome)}{e.cnpj ? ` - ${e.cnpj}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card: Dados do Cliente */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                    <User className="h-4 w-4 text-primary" /> Dados do Cliente
                    {ehNfe && <PendenciaTag itens={pendenciasNf.cliente} className="ml-auto" />}
                    {clienteId && cadastroCompleto && !editandoCliente && !soLeitura && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto"
                        onClick={() => setEditandoCliente(true)}
                        title="Editar dados do cliente"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent>
                  {!clienteId ? (
                    <p className="text-sm text-muted-foreground">Nenhum cliente vinculado ao atendimento.</p>
                  ) : (soLeitura || (cadastroCompleto && !editandoCliente)) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Nome" value={cli?.nome_razao_social} />
                      <InfoDisplay label={rotuloDocumento(cli)} value={cli?.cpf_cnpj ? formatCpfCnpj(cli.cpf_cnpj) : undefined} />
                      <InfoDisplay label="Sexo" value={cli?.sexo} />
                      <InfoDisplay label="Data de Nascimento" value={fmtDataNasc(cli?.data_nascimento)} />
                      <InfoDisplay label="E-mail (NF)" value={cli?.email_nf} />
                      <InfoDisplay label="Telefone (comercial)" value={fmtTelefone(cli?.telefone_comercial)} />
                    </div>
                  ) : (
                    <ClienteForm
                      embedded
                      id={clienteId}
                      exigirBancarios={exigirBancarios}
                      onSaved={handleClienteSaved}
                      onCancel={editandoCliente && cadastroCompleto ? () => setEditandoCliente(false) : undefined}
                    />
                  )}
                </CardContent>
              </Card>

              {clienteId && !editandoCliente && (cadastroCompleto || ehNfe) && (
                <>
                  {/* Card: Endereço — na emissão de NF-e fica sempre visível */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                        <MapPin className="h-4 w-4 text-primary" /> Endereço
                        {ehNfe && <PendenciaTag itens={pendenciasNf.endereco} className="ml-auto" />}
                      </CardTitle>
                      <Separator className="mt-2" />
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="CEP" value={cliEndereco?.cep} />
                      <InfoDisplay label="Logradouro" value={cliEndereco?.logradouro} />
                      <InfoDisplay label="Número" value={cliEndereco?.numero} />
                      <InfoDisplay label="Complemento" value={cliEndereco?.complemento} />
                      <InfoDisplay label="Bairro" value={cliEndereco?.bairro} />
                      <InfoDisplay label="Cidade" value={cliEndereco?.cidade} />
                      <InfoDisplay label="UF" value={cliEndereco?.uf} />
                      <InfoDisplay label="País" value={cliEndereco?.pais} />
                    </CardContent>
                  </Card>

                  {/* Card: Dados Bancários — troca em que a loja paga o cliente */}
                  {exigirBancarios && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                        <Landmark className="h-4 w-4 text-primary" /> Dados Bancários
                        {ehNfe && <PendenciaTag itens={pendenciasNf.bancario} className="ml-auto" />}
                      </CardTitle>
                      <Separator className="mt-2" />
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Banco" value={cli?.banco} />
                      <InfoDisplay label="Tipo de Conta" value={tipoContaLabel(cli?.tipo_conta)} />
                      <InfoDisplay label="Agência" value={cli?.agencia} />
                      <InfoDisplay label="Conta" value={cli?.conta ? `${cli.conta}${cli?.digito_conta ? `-${cli.digito_conta}` : ''}` : undefined} />
                      <InfoDisplay label="Chave PIX" value={cli?.chave_pix} />
                      <InfoDisplay label="Favorecido" value={cli?.favorecido} />
                      <InfoDisplay label={`${ehCnpj(cli?.cpf_cnpj_favorecido) ? 'CNPJ' : 'CPF'} do Favorecido`} value={cli?.cpf_cnpj_favorecido ? formatCpfCnpj(cli.cpf_cnpj_favorecido) : undefined} />
                    </CardContent>
                  </Card>
                  )}
                </>
              )}

              {/* Card: Moto de Interesse */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bike className="h-4 w-4 text-primary" /> Moto de Interesse
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                {estItem ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Marca" value={estItem.marca} />
                      <InfoDisplay label="Modelo" value={estItem.modelo ? String(estItem.modelo).toUpperCase() : undefined} />
                      <InfoDisplay label="Ano" value={[estItem.ano_fabricacao, estItem.ano_modelo].filter(Boolean).join('/') || undefined} />
                      <InfoDisplay label="Cor" value={estItem.cor ? String(estItem.cor).toUpperCase() : undefined} />
                      {estItem.fonte === '0km'
                        ? <InfoDisplay label="Chassi" value={estItem.chassi || undefined} />
                        : <InfoDisplay label="Placa" value={estItem.placa ? estItem.placa.replace(/-/g, '') : undefined} />}
                      {estItem.fonte !== '0km' && !estItem.placa && estItem.chassi && <InfoDisplay label="Chassi" value={estItem.chassi} />}
                    </div>
                    <div className="pt-2 border-t border-border grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-4">
                      <InfoDisplay label="Preço" value={formatCurrency(estItem.preco)} valueClassName="text-primary" />
                      {!!estItem.preco_acao && <InfoDisplay label="Preço Ação" value={formatCurrency(estItem.preco_acao)} />}
                    </div>
                  </>
                ) : motoInt ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <InfoDisplay label="Marca" value={motoInt.marca} />
                    <InfoDisplay label="Modelo" value={motoInt.modelo ? String(motoInt.modelo).toUpperCase() : undefined} />
                    <InfoDisplay label="Ano" value={motoInt.ano} />
                    {motoInt.chassi && <InfoDisplay label="Chassi" value={motoInt.chassi} />}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma moto de interesse</p>
                )}

                </CardContent>
              </Card>

              {/* Card: Negociação */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Negociação
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent>
                  {soLeitura ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Valor do Sinal" value={valorSinal ? `R$ ${valorSinal}` : undefined} />
                      <InfoDisplay label="Valor da Venda" value={valorVenda ? `R$ ${valorVenda}` : undefined} valueClassName="text-primary" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <CurrencyField label="Valor do Sinal" value={valorSinal} onChange={setValorSinal} required />
                      <CurrencyField label="Valor da Venda" value={valorVenda} onChange={setValorVenda} required />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card: Taxas Administrativas — IPVA e Transferência */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" /> Taxas Administrativas
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                {soLeitura ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {!atendimento.loja?.toLowerCase().startsWith('ducati') && (
                      <>
                        <InfoDisplay label="IPVA" value={ipvaTipo === 'ambos' ? 'Ambos' : ipvaTipo === 'cliente' ? 'Cliente' : ipvaTipo === 'loja' ? 'Loja' : undefined} />
                        {ipvaTipo === 'ambos' && <InfoDisplay label="Cotas do IPVA" value={ipvaCotas} />}
                        {(ipvaTipo === 'loja' || ipvaTipo === 'ambos') && <InfoDisplay label="Valor do IPVA" value={ipvaValor ? `R$ ${ipvaValor}` : undefined} />}
                      </>
                    )}
                    <InfoDisplay label="Transferência" value={transferenciaTipo === 'cliente' ? 'Cliente' : transferenciaTipo === 'loja' ? 'Loja' : transferenciaTipo === 'outra_uf' ? 'Outra UF' : undefined} />
                    {transferenciaTipo === 'cliente' && <InfoDisplay label="Valor da Transferência" value={transferenciaValor ? `R$ ${transferenciaValor}` : undefined} />}
                  </div>
                ) : (
                  <>
                    {/* IPVA - hidden for Ducati */}
                    {!atendimento.loja?.toLowerCase().startsWith('ducati') && (
                    <div>
                      <label className="text-sm font-medium text-foreground">IPVA<span className="text-destructive ml-0.5">*</span></label>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {['loja', 'cliente', 'ambos'].map(opt => (
                          <Button
                            key={opt}
                            size="sm"
                            variant={ipvaTipo === opt ? 'default' : 'outline'}
                            onClick={() => setIpvaTipo(opt)}
                            className="capitalize"
                          >
                            {opt === 'ambos' ? 'Ambos' : opt === 'cliente' ? 'Cliente' : 'Loja'}
                          </Button>
                        ))}
                      </div>
                      {ipvaTipo === 'ambos' && (
                        <div className="mt-2">
                          <label className="text-sm text-muted-foreground">Cotas<span className="text-destructive ml-0.5">*</span></label>
                          <Input
                            className="mt-1"
                            type="text"
                            value={ipvaCotas}
                            onChange={(e) => setIpvaCotas(e.target.value)}
                            placeholder="Ex: 1 à 5"
                          />
                        </div>
                      )}
                      {(ipvaTipo === 'loja' || ipvaTipo === 'ambos') && (
                        <div className="mt-2">
                          <CurrencyField label={ipvaTipo === 'ambos' ? 'Valor do IPVA (parte da loja)' : 'Valor do IPVA'} value={ipvaValor} onChange={setIpvaValor} required />
                        </div>
                      )}
                    </div>
                    )}

                    {/* Transferência */}
                    <div>
                      <label className="text-sm font-medium text-foreground">Transferência<span className="text-destructive ml-0.5">*</span></label>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {['loja', 'cliente', 'outra_uf'].map(opt => (
                          <Button
                            key={opt}
                            size="sm"
                            variant={transferenciaTipo === opt ? 'default' : 'outline'}
                            onClick={() => setTransferenciaTipo(opt)}
                          >
                            {opt === 'cliente' ? 'Cliente' : opt === 'loja' ? 'Loja' : 'Outra UF'}
                          </Button>
                        ))}
                      </div>
                      {transferenciaTipo === 'cliente' && (
                        <div className="mt-2">
                          <CurrencyField label="Valor da Transferência" value={transferenciaValor} onChange={setTransferenciaValor} required />
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total de Taxas Administrativas</span>
                  <span className="text-primary">R$ {totalTaxasCliente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                </CardContent>
              </Card>

              {/* Card: Moto do Cliente (troca) */}
              {hasTroca && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bike className="h-4 w-4 text-primary" /> Moto do Cliente
                    </CardTitle>
                    <Separator className="mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {motoAv && (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <InfoDisplay label="Marca" value={motoAv.marca} />
                          <InfoDisplay label="Modelo" value={motoAv.modelo ? String(motoAv.modelo).toUpperCase() : undefined} />
                          <InfoDisplay label="Ano" value={[motoAv.ano_fabricacao, motoAv.ano_modelo].filter(Boolean).join('/') || undefined} />
                          <InfoDisplay label="Cor" value={motoAv.cor ? String(motoAv.cor).toUpperCase() : undefined} />
                          <InfoDisplay label="Placa" value={motoAv.placa ? motoAv.placa.replace(/-/g, '') : undefined} />
                        </div>
                        {avaliacaoData && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <InfoDisplay label="Avaliação Compra" value={formatCurrency(avaliacaoData.avaliacao_compra)} />
                              <InfoDisplay label="Custos Loja" value={formatCurrency(avaliacaoData.previsao_custos_loja)} />
                              <div>
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse Cliente</span>
                                <p className="text-sm font-bold text-primary">
                                  {avaliacaoData.avaliacao_compra != null
                                    ? formatCurrency(Math.max(avaliacaoData.avaliacao_compra - (avaliacaoData.previsao_custos_loja ?? 0), 0))
                                    : '-'}
                                </p>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">REPASSE = AVALIAÇÃO - CUSTOS LOJA</p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Valor de Quitação" value={valorQuitacao ? `R$ ${valorQuitacao}` : '—'} />
                      <InfoDisplay label="Valor de Fechamento" value={valorFechamento ? `R$ ${valorFechamento}` : '—'} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Card: Agregados — serviços cobrados à parte do cliente */}
              {(!soLeitura || agregados.length > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" /> Agregados
                    </CardTitle>
                    <Separator className="mt-2" />
                  </CardHeader>
                  <CardContent>
                    <AgregadosContrato
                      value={agregados}
                      onChange={setAgregados}
                      catalogo={empresaId ? agregadoOpcoes.filter((a) => a.empresa_id === empresaId && a.ativo !== false) : []}
                      soLeitura={soLeitura}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Card: Formas de Pagamento */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" /> Formas de Pagamento
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">

                {/* Adicionar / editar forma — bloqueado quando o Valor Total já está coberto */}
                {!soLeitura && !editingId && valorTotalContrato > 0.005 && valorFaltante <= 0.005 && (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
                    Valor Total já coberto pelas formas de pagamento{hasTroca ? ' + valor de fechamento da moto' : ''}. Para ajustar, edite ou remova uma forma abaixo.
                  </p>
                )}
                {!soLeitura && (editingId || valorTotalContrato <= 0.005 || valorFaltante > 0.005) && (
                <div className={cn('rounded-lg border p-3 space-y-3', editingId && 'border-primary')}>
                  <div className="flex items-center gap-2">
                    {editingId ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium">{editingId ? 'Editar Forma de Pagamento' : 'Adicionar Forma de Pagamento'}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {formasPagOpcoes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma forma de pagamento habilitada para o BPM.</p>
                    )}
                    {formasPagOpcoes.map(fp => (
                      <Button
                        key={fp.id}
                        size="sm"
                        variant={novaPagamentoTipo === fp.id ? 'default' : 'outline'}
                        onClick={() => { setNovaPagamentoTipo(fp.id); setNovaInstituicaoId(''); setNovaObservacoes(''); setNovaDataPagamento(''); setOutroValor(''); setFinValorEntrada(''); setFinParcelas(''); setFinValorParcelas(''); setFinValorFinanciado(''); setFinTaxaRetorno(''); }}
                        className="text-xs"
                      >
                        {fp.nome}
                      </Button>
                    ))}
                  </div>

                  {ehFinInstituicao(novaFormaNome) && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Banco / Administradora</label>
                      <Select
                        value={novaInstituicaoId}
                        onValueChange={(v) => {
                          setNovaInstituicaoId(v);
                          const sel = (instituicoesByForma[novaPagamentoTipo] || []).find(i => i.id === v);
                          setNovaObservacoes(sel?.observacoes_contrato ?? '');
                        }}
                      >
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(instituicoesByForma[novaPagamentoTipo] || []).map(i => (
                            <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(instituicoesByForma[novaPagamentoTipo] || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum banco / administradora vinculado a esta forma de pagamento.
                        </p>
                      )}
                    </div>
                  )}

                  {ehFinanciamento(novaFormaNome) && (
                    <div className="space-y-3">
                      <CurrencyField label="Valor de Entrada" value={finValorEntrada} onChange={setFinValorEntrada} />
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-sm font-medium text-foreground">Nº Parcelas</label>
                          <Input className="mt-1" type="number" value={finParcelas} onChange={e => setFinParcelas(e.target.value)} placeholder="48" />
                        </div>
                        <CurrencyField label="Valor Parcelas" value={finValorParcelas} onChange={setFinValorParcelas} />
                        <CurrencyField label="Valor Financiado" value={finValorFinanciado} onChange={setFinValorFinanciado} />
                      </div>
                      <div className="max-w-[10rem]">
                        <label className="text-sm font-medium text-foreground">Taxa de Retorno (%)</label>
                        <div className="relative mt-1">
                          <Input className="pr-7" inputMode="decimal" placeholder="0" value={finTaxaRetorno} onChange={e => setFinTaxaRetorno(e.target.value)} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {novaPagamentoTipo && !ehFinanciamento(novaFormaNome) && (
                    <CurrencyField label="Valor Total" value={outroValor} onChange={setOutroValor} />
                  )}

                  {novaPagamentoTipo && (
                    <div className="max-w-[14rem] space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Data do Pagamento</label>
                      <Popover open={pagCalOpen} onOpenChange={setPagCalOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !novaDataPagamento && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {novaDataPagamento ? format(new Date(`${novaDataPagamento}T00:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={novaDataPagamento ? new Date(`${novaDataPagamento}T00:00:00`) : undefined}
                            onSelect={(d) => { setNovaDataPagamento(d ? format(d, "yyyy-MM-dd") : ''); setPagCalOpen(false); }}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                          {novaDataPagamento && (
                            <div className="border-t p-2 flex justify-between">
                              <Button size="sm" variant="ghost" onClick={() => { setNovaDataPagamento(''); setPagCalOpen(false); }}>Limpar</Button>
                              <Button size="sm" onClick={() => setPagCalOpen(false)}>OK</Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  {novaPagamentoTipo && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Observações</label>
                      <Textarea
                        rows={3}
                        value={novaObservacoes}
                        onChange={(e) => setNovaObservacoes(e.target.value)}
                        placeholder="Observações desta forma de pagamento..."
                      />
                    </div>
                  )}

                  {novaPagamentoTipo && (
                    <div className="flex justify-center gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 max-w-[10.5rem]" onClick={handleCancelEdit}>
                        <X className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={handleAddPagamento} className="flex-1 max-w-[10.5rem]">
                        <Plus className="h-4 w-4 mr-1" />
                        {editingId ? 'Salvar Alterações' : 'Registrar'}
                      </Button>
                    </div>
                  )}
                </div>
                )}

                {/* Lista de formas já adicionadas */}
                {formasPagamento.length > 0 && (
                  <div className="space-y-2">
                    {formasPagamento.map((fp) => (
                      <div key={fp.id} className={cn('flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2', editingId === fp.id && 'border-primary')}>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{tipoLabel(fp.tipo)}</span>
                            {fp.financeira && <span className="text-xs text-muted-foreground">{fp.financeira}</span>}
                          </div>
                          {ehFinanciamento(fp.tipo) || ehConsorcio(fp.tipo) ? (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {fp.valor_entrada != null && <div>Entrada: {formatCurrency(fp.valor_entrada)}</div>}
                              {fp.numero_parcelas != null && fp.valor_parcelas != null && (
                                <div>{fp.numero_parcelas}x de {formatCurrency(fp.valor_parcelas)}</div>
                              )}
                              {fp.valor_financiado != null && <div>Financiado: {formatCurrency(fp.valor_financiado)}</div>}
                              {fp.taxa_retorno_pct != null && <div>Taxa de Retorno: {fp.taxa_retorno_pct}%</div>}
                              {fp.valor_total != null && <div>Valor: {formatCurrency(fp.valor_total)}</div>}
                            </div>
                          ) : (
                            fp.valor_total != null && <p className="text-xs text-muted-foreground">Valor: {formatCurrency(fp.valor_total)}</p>
                          )}
                          {fp.data_pagamento && (
                            <p className="text-xs text-muted-foreground">
                              Pagamento: {format(new Date(`${fp.data_pagamento}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          )}
                          {fp.observacoes && (
                            <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">{fp.observacoes}</p>
                          )}
                        </div>
                        {!soLeitura && (
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditPagamento(fp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => fp.id && handleRemovePagamento(fp.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </CardContent>
              </Card>

              {/* Resumo financeiro — KPIs abaixo das Formas de Pagamento (um por card) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card>
                  <CardContent className="pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Preço de Tabela</span>
                    <p className="text-base font-bold">{precoTabela > 0 ? formatCurrency(precoTabela) : '—'}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Valor da Venda</span>
                    <p className="text-base font-bold">
                      {vendaNum > 0 ? formatCurrency(vendaNum) : '—'}
                      {vendaVarPctInt != null && vendaVarPctInt !== 0 && (
                        <span className={cn('ml-1', vendaVarPctInt > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          ({vendaVarPctInt > 0 ? '+' : ''}{vendaVarPctInt}%)
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Taxas e Agregados</span>
                    <p className="text-base font-bold">{formatCurrency(totalTaxasEAgregados)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Valor Total</span>
                    <p className="text-base font-bold text-primary">{formatCurrency(valorTotalContrato)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      {valorFaltante < -0.005 ? 'Valor Sobrando' : 'Valor Faltante'}
                    </span>
                    <p className={cn('text-base font-bold', valorFaltante > 0.005 ? 'text-orange-600' : 'text-emerald-600')}>
                      {formatCurrency(valorFaltante < 0 ? Math.abs(valorFaltante) : valorFaltante)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Card: Observações */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Observações
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {soLeitura ? (
                    <div className="space-y-4">
                      {obsInternas && (
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações Internas</span>
                          <p className="text-sm whitespace-pre-wrap">{obsInternas}</p>
                        </div>
                      )}
                      {obsContrato && (
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações do Contrato</span>
                          <p className="text-sm whitespace-pre-wrap">{obsContrato}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-4">
                        <InfoDisplay label="Data do Sinal" value={dataSinal ? format(dataSinal, "dd/MM/yyyy", { locale: ptBR }) : undefined} />
                        <InfoDisplay label="Data Vencimento do Sinal" value={dataVencimento ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR }) : undefined} />
                        {estItem?.status === 'vendido' && estItem?.data_venda && (
                          <InfoDisplay label="Data da Venda" value={format(new Date(estItem.data_venda), 'dd/MM/yyyy', { locale: ptBR })} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="space-y-1.5">
                    <Label>Observações Internas</Label>
                    <AutoTextarea value={obsInternas} onChange={setObsInternas} placeholder="Observações internas..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações do Contrato <span className="text-destructive">*</span></Label>
                    <AutoTextarea value={obsContrato} onChange={setObsContrato} placeholder="Observações do contrato..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Data do Sinal <span className="text-destructive">*</span></Label>
                      <Popover open={sinalCalOpen} onOpenChange={setSinalCalOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataSinal && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dataSinal ? format(dataSinal, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dataSinal} onSelect={setDataSinal} initialFocus className="p-3 pointer-events-auto" />
                          <div className="border-t p-2 flex justify-end">
                            <Button size="sm" disabled={!dataSinal} onClick={() => setSinalCalOpen(false)}>OK</Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Data Vencimento do Sinal <span className="text-destructive">*</span></Label>
                      <Popover open={vencCalOpen} onOpenChange={setVencCalOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataVencimento && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dataVencimento ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dataVencimento} onSelect={setDataVencimento} initialFocus className="p-3 pointer-events-auto" />
                          <div className="border-t p-2 flex justify-end">
                            <Button size="sm" disabled={!dataVencimento} onClick={() => setVencCalOpen(false)}>OK</Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Card: NF-e de Venda — só na tela de emissão de NF-e; só a observação segue editável, valor é informativo (vem do Valor da Venda). */}
              {ehNfe && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> NF-e de Venda
                    </CardTitle>
                    <Separator className="mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {nfeJaEmitida && !podeReemitirHomolog ? (
                      <p className="text-sm text-muted-foreground">NF-e autorizada — veja os dados na barra de ações abaixo.</p>
                    ) : (
                      <>
                        <InfoDisplay label="Valor da Nota" value={nfeValor ? `R$ ${nfeValor}` : undefined} valueClassName="text-primary" />
                        <div className="space-y-1.5">
                          <Label>Observações na NF-e</Label>
                          <Textarea
                            className="uppercase"
                            rows={3}
                            value={nfeObs}
                            onChange={(e) => setNfeObs(e.target.value.toUpperCase())}
                            placeholder="INFORMAÇÕES COMPLEMENTARES..."
                          />
                        </div>
                        {eh0kmVenda && (
                          <div className="space-y-2 rounded-md border border-dashed p-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              De acordo com NF de Entrada da Moto.
                            </p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <InfoDisplay label="BC ST retida" value={stBcRetido ? `R$ ${stBcRetido}` : '—'} />
                              <InfoDisplay label="ICMS do substituto" value={stValorSubstituto ? `R$ ${stValorSubstituto}` : '—'} />
                              <InfoDisplay label="ICMS-ST retido" value={stValorRetido ? `R$ ${stValorRetido}` : '—'} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
          </div>

          {/* Ações */}
          {ehNfe ? (
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {nfe.nfe?.status === 'processada' && nfe.nfe.ambiente === 'producao' && (
                <div className="flex flex-wrap items-center gap-3 mr-auto text-sm">
                  <Badge className="bg-primary/10 text-primary gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> NF-e nº {nfe.nfe?.numero || '-'} • série {nfe.nfe?.serie || '-'}
                  </Badge>
                </div>
              )}
              {nfe.pendente && (
                <div className="flex items-center gap-3 mr-auto">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                  <Button variant="ghost" onClick={nfe.consultar} disabled={nfe.loading} className="gap-1.5">
                    <RefreshCw className={`h-4 w-4 ${nfe.loading ? 'animate-spin' : ''}`} /> Atualizar
                  </Button>
                </div>
              )}
              {nfe.erro && !nfe.pendente && (
                <p className="mr-auto text-sm text-destructive flex items-start gap-1 max-w-md">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {nfe.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}

              {(nfe.emitida || nfe.cancelada) && nfe.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={nfe} />}

              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {(() => {
                const disabled = nfe.loading || !empresaId || parseCurrencyInput(nfeValor) <= 0 || (hasTroca && !valorQuitacao?.trim()) || !nfSemPendencias;
                // Moto 0km: produção exige os valores de ICMS-ST retido (da NF de entrada).
                const stRetidoOk = !eh0kmVenda || (
                  parseCurrencyInput(stBcRetido) > 0 &&
                  parseCurrencyInput(stValorSubstituto) > 0 &&
                  parseCurrencyInput(stValorRetido) > 0
                );
                const title = !empresaId
                  ? 'Nenhuma empresa vinculada à loja do atendimento'
                  : hasTroca && !valorQuitacao?.trim()
                    ? 'Valor de Quitação da moto do cliente é obrigatório — defina na avaliação (0 se não houver)'
                    : !nfSemPendencias
                      ? 'Cadastro do cliente incompleto — resolva as pendências marcadas nos cards acima'
                      : undefined;
                return (
                  <>
                    {(!nfeJaEmitida || podeReemitirHomolog) && !nfe.pendente && (
                      <Button
                        className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={disabled}
                        title={title}
                        onClick={() => handleEmitirNf('homologacao')}
                      >
                        {nfe.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfe.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        {nfe.erro ? 'Tentar novamente' : 'NF-e (Homologação)'}
                      </Button>
                    )}
                    {podeReemitirHomolog && !nfe.pendente && (
                      <Button
                        className="gap-1.5"
                        disabled={disabled || (hasTroca && !trocaCompraProdOk) || !stRetidoOk}
                        title={!stRetidoOk
                          ? 'Preencha os valores de ICMS-ST retido (da NF de entrada da moto) antes de emitir em produção'
                          : hasTroca && !trocaCompraProdOk
                            ? 'Emita a NF-e de compra da moto da troca em produção antes'
                            : title}
                        onClick={() => handleEmitirNf('producao')}
                      >
                        <FileText className="h-4 w-4" /> NF-e (Produção)
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
              {exigeMotoNovaParaVenda && !soLeitura && (
                <p className="w-full text-right text-xs text-amber-600">
                  Selecione a moto do estoque de novas na Moto de Interesse para liberar a <strong>Proposta Venda</strong> — sem ela, só a Proposta Sinal.
                </p>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {(soLeitura || podeGerarSinal) && (
                <>
                  {jaGerado && contratoId && (
                    <Button variant="outline" onClick={handleVisualizar} disabled={viewing}>
                      <Eye className="h-4 w-4 mr-1" />{viewing ? 'Abrindo...' : 'Visualizar'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => handleGerar('sinal')} disabled={generating}>
                    <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Proposta Sinal'}
                  </Button>
                  {canGerarVenda && (soLeitura || podeGerarContrato) && (
                    <Button variant="outline" onClick={() => handleGerar('venda')} disabled={generating}>
                      <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Proposta Venda'}
                    </Button>
                  )}
                </>
              )}
              <Button onClick={handleSave} disabled={saving || nfeEmProducao} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md px-6">
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContratoDialog;
