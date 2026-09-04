import React, { useEffect, useState } from 'react';
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
import { FileText, CalendarIcon, Trash2, Plus, Save, Eye, PlusCircle, Download, Loader2, RefreshCw, ExternalLink, AlertTriangle, User, Bike, MessageSquare, Wallet, ArrowLeft, Pencil, MapPin, Landmark, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Atendimento, MotoInteresse, Avaliacao } from '@/types/crm';
import { generateContratoPdf, type ContratoPdfData } from '@/lib/generateContratoPdf';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import { useAuth } from '@/contexts/AuthContext';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto } from '@/lib/clienteCadastro';

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
  const soLeitura = ehNfe || nfeJaEmitida;
  const [nfeValor, setNfeValor] = useState('');
  const [nfeObs, setNfeObs] = useState('');

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
  // Other payment valor
  const [outroValor, setOutroValor] = useState('');

  const [sinalCalOpen, setSinalCalOpen] = useState(false);
  const [vencCalOpen, setVencCalOpen] = useState(false);

  const hasTroca = atendimento.interesse === 'trocar' && motosAvaliacao.length > 0;

  // Load existing contract data
  useEffect(() => {
    if (!open) return;
    const loadContrato = async () => {
      setLoading(true);
      setEditingId(null);
      nfe.carregar();
      const [{ data: contrato }, { data: histGerado }, { data: freshAtendimento }, { data: freshEstoque }, { data: formasOpts }, { data: instOpts }] = await Promise.all([
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
        supabase
          .from(estoqueTabela)
          .select('valor_sinal, valor_venda')
          .eq('atendimento_venda_id', atendimento.id)
          .maybeSingle(),
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
      ]);

      setFormasPagOpcoes((formasOpts as any[]) || []);

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
        setIpvaValor(contrato.ipva_valor ? formatCurrencyInput(String(Math.round(contrato.ipva_valor * 100))) : '');
        setTransferenciaTipo(contrato.transferencia_tipo || '');
        setTransferenciaValor(contrato.transferencia_valor ? formatCurrencyInput(String(Math.round(contrato.transferencia_valor * 100))) : '');
        setValorQuitacao(contrato.valor_quitacao != null ? fmtCur(contrato.valor_quitacao) : (avQuitacao != null ? fmtCur(avQuitacao) : ''));
        setValorFechamento(contrato.valor_fechamento != null ? fmtCur(contrato.valor_fechamento) : (avFechamento != null ? fmtCur(avFechamento) : ''));
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataSinal(contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined);
        setDataVencimento(contrato.data_vencimento_sinal ? new Date(contrato.data_vencimento_sinal + 'T12:00:00') : undefined);
        setValorSinal(atSinal ? formatCurrencyInput(String(Math.round(atSinal * 100))) : '');
        setValorVenda(atVenda ? formatCurrencyInput(String(Math.round(atVenda * 100))) : '');

        // Load formas de pagamento
        const { data: formas } = await supabase
          .from('formas_pagamento_contrato')
          .select('*')
          .eq('contrato_id', contrato.id)
          .order('created_at', { ascending: true });
        if (formas) {
          setFormasPagamento(formas.map(mapFormaRow));
        }
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
        setValorSinal(atSinal ? formatCurrencyInput(String(Math.round(atSinal * 100))) : '');
        setValorVenda(atVenda ? formatCurrencyInput(String(Math.round(atVenda * 100))) : '');
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

  const resetPagamentoForm = () => {
    setNovaPagamentoTipo('');
    setNovaInstituicaoId('');
    setNovaObservacoes('');
    setFinValorEntrada('');
    setFinParcelas('');
    setFinValorParcelas('');
    setFinValorFinanciado('');
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
      cliente_fornecedor_id: null,
      financeira: null,
      observacoes: null,
    };

    if (ehFinanciamento(novaFormaNome)) {
      formaData.valor_entrada = parseCurrencyInput(finValorEntrada) || null;
      formaData.numero_parcelas = finParcelas ? parseInt(finParcelas) : null;
      formaData.valor_parcelas = parseCurrencyInput(finValorParcelas) || null;
      formaData.valor_financiado = parseCurrencyInput(finValorFinanciado) || null;
    } else {
      formaData.valor_total = parseCurrencyInput(outroValor) || null;
    }

    if (ehInst && instSel) {
      formaData.cliente_fornecedor_id = instSel.cliente_fornecedor_id;
      formaData.financeira = instSel.nome; // denormalizado p/ PDF e lista
    }
    // Observação é livre pra qualquer forma de pagamento, não só as vinculadas a instituição.
    formaData.observacoes = novaObservacoes.trim() || null;

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
      if (nfeJaEmitida) toast.error('Contrato bloqueado: NF-e de venda já emitida.');
      return contratoId;
    }
    setSaving(true);
    const payload: any = {
      atendimento_id: atendimento.id,
      cpf_cnpj: cpfCnpj || null,
      empresa_id: empresaId || null,
      ipva_tipo: ipvaTipo || null,
      ipva_cotas: ipvaTipo === 'ambos' && ipvaCotas ? ipvaCotas : null,
      ipva_valor: ipvaTipo === 'loja' ? parseCurrencyInput(ipvaValor) || null : null,
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
        await supabase.from(estoqueTabela).update(estoqueUpdate).eq('id', motoIntNfe.estoque_moto_id);
      } else {
        await supabase.from(estoqueTabela).update(estoqueUpdate).eq('atendimento_venda_id', atendimento.id);
      }
    }
    // CPF/CNPJ do cliente é imutável: só grava se o cliente ainda não tinha um.
    if (cpfCnpj && atendimento.cliente_id && !cpfBloqueado) {
      await supabase.from('clientes_fornecedores').update({ cpf_cnpj: cpfCnpj }).eq('id', atendimento.cliente_id);
    }

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
      setSaving(false);
      return data.id;
    }
  };

  const handleSave = async () => {
    const id = await saveContrato();
    if (id) {
      toast.success('Contrato salvo com sucesso!');
      onSaved?.();
      onOpenChange(false);
    }
  };

  // Auto-save on close: if user closes the dialog (X, ESC, click outside)
  // without explicitly saving, persist whatever was filled to avoid losing data.
  const hasAnyData = (): boolean => {
    return !!(
      cpfCnpj || ipvaTipo || ipvaCotas || ipvaValor ||
      transferenciaTipo || transferenciaValor ||
      valorQuitacao || valorFechamento ||
      obsInternas || obsContrato ||
      dataSinal || dataVencimento ||
      valorSinal || valorVenda ||
      formasPagamento.length > 0
    );
  };

  const handleOpenChange = async (next: boolean) => {
    // Na tela de NF-e só valor/observação da nota são editáveis (ver handleEmitirNfe) —
    // não há o que autosalvar no contrato aqui.
    if (!next && !loading && !saving && !generating && !viewing && !ehNfe && hasAnyData()) {
      const id = await saveContrato();
      if (id) {
        toast.success('Alterações salvas');
        onSaved?.();
      }
    }
    onOpenChange(next);
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
  const cliEndereco = cli?.clientes_fornecedores_enderecos?.[0] || null;
  // Dados bancários do cliente só são obrigatórios quando há troca (a loja paga o repasse da moto do cliente).
  const exigirBancarios = hasTroca;
  const cadastroCompleto = cadastroClienteCompleto(cli, cliEndereco, { exigirBancarios });
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

    const pdfData: ContratoPdfData = {
      loja: atendimento.loja,
      empresaMotoInteresse: estItem?.empresa || null,
      nomeCliente: atendimento.cliente?.nome_razao_social || '',
      telefone: (atendimento.cliente?.telefone ? formatPhone(atendimento.cliente.telefone) : atendimento.cliente?.telefone) || '',
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
      transferenciaTipo: transferenciaTipo || null,
      transferenciaValor: transferenciaValor ? `R$ ${transferenciaValor}` : null,
      ipvaTipo: ipvaTipo || null,
      ipvaCotas: ipvaCotas || null,
      observacoes: obsContrato || '',
      dataSinal: dataSinal ? format(dataSinal, "dd/MM/yyyy", { locale: ptBR }) : '',
      dataVencimento: dataVencimento ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR }) : '',
      formasPagamento: formasPagamento.map(f => {
        const fmt = (v: number | null | undefined) => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';
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
            observacoes: f.observacoes || '',
          };
        }
        return {
          tipo: f.tipo,
          descricao: tipoLabel(f.tipo),
          valor: fmt(f.valor_total),
          financeira: f.financeira || '',
          observacoes: f.observacoes || '',
        };
      }),
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
        valorNegociado: `R$ ${valorFechamento || '0,00'}`,
      };
    }

    return pdfData;
  };

  const validateForGeneration = (): boolean => {
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
    if (!isDucati && ipvaTipo === 'loja' && !ipvaValor) errors.push('Valor do IPVA');
    // Quitação da moto do cliente é obrigatória quando há troca — vem da avaliação (informar 0 se não houver).
    if (hasTroca && !valorQuitacao?.trim()) errors.push('Valor de Quitação da moto do cliente (defina na avaliação — 0 se não houver)');
    if (!obsContrato && !obsContrato.trim()) errors.push('Observações do Contrato');

    if (errors.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${errors.join(', ')}`);
      return false;
    }
    return true;
  };

  const handleGerar = async (variant: 'sinal' | 'venda' = 'sinal') => {
    if (nfeJaEmitida) { toast.error('NF-e de venda já emitida — contrato bloqueado.'); return; }
    if (!validateForGeneration()) return;

    setGenerating(true);
    const id = await saveContrato();
    if (!id) {
      setGenerating(false);
      return;
    }

    try {
      const pdfData = buildPdfData();
      if (!pdfData) throw new Error('Dados insuficientes');

      await generateContratoPdf(pdfData, variant);

      // Registrar no histórico de movimentações
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
      toast.success(variant === 'venda' ? 'Contrato de venda gerado com sucesso!' : 'Contrato gerado com sucesso!');
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
      const id = await saveContrato();
      if (!id) { setViewing(false); return; }
      const pdfData = buildPdfData();
      if (!pdfData) throw new Error('Dados insuficientes');
      await generateContratoPdf(pdfData, 'sinal');
      toast.success('Contrato visualizado');
    } catch (err) {
      console.error('Erro ao visualizar PDF:', err);
      toast.error('Erro ao visualizar o contrato PDF');
    } finally {
      setViewing(false);
    }
  };

  const lojaLower = (atendimento.loja || '').toLowerCase();
  const canGerarVenda = ['ducati bsb', 'ducati fln', 'ducati poa', '299i', '299s', '299f', '299p', 'aventura'].includes(lojaLower) && atendimento.situacao === 'vendido';

  const tipoLabel = (tipo: string) => tipo || '—';

  if (!open) return null;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => handleOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> {ehNfe ? 'Emissão de NF-e de Venda' : 'Emissão de Contrato'}
        </h1>
      </div>

      {nfeJaEmitida && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> NF-e de venda emitida — contrato bloqueado para edição.
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
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" /> Dados do Cliente
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
                      <InfoDisplay label="CPF/CNPJ" value={cli?.cpf_cnpj ? formatCpfCnpj(cli.cpf_cnpj) : undefined} />
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

              {clienteId && cadastroCompleto && !editandoCliente && (
                <>
                  {/* Card: Endereço */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" /> Endereço
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

                  {/* Card: Dados Bancários (só quando há troca — a loja paga o cliente) */}
                  {exigirBancarios && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-primary" /> Dados Bancários
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
                      <InfoDisplay label="CPF/CNPJ do Favorecido" value={cli?.cpf_cnpj_favorecido ? formatCpfCnpj(cli.cpf_cnpj_favorecido) : undefined} />
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
                      <InfoDisplay label="Placa" value={estItem.placa ? estItem.placa.replace(/-/g, '') : undefined} />
                      {!estItem.placa && estItem.chassi && <InfoDisplay label="Chassi" value={estItem.chassi} />}
                    </div>
                    <div className="pt-2 border-t border-border grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-4">
                      <InfoDisplay label="Preço" value={formatCurrency(estItem.preco)} />
                      {!!estItem.preco_acao && <InfoDisplay label="Preço Ação" value={formatCurrency(estItem.preco_acao)} />}
                      {estItem.valor_sinal != null && <InfoDisplay label="Valor do Sinal" value={formatCurrency(estItem.valor_sinal)} />}
                      {estItem.valor_venda != null && <InfoDisplay label="Valor de Venda" value={formatCurrency(estItem.valor_venda)} valueClassName="text-primary" />}
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

                {soLeitura ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {!atendimento.loja?.toLowerCase().startsWith('ducati') && (
                      <>
                        <InfoDisplay label="IPVA" value={ipvaTipo === 'ambos' ? 'Ambos' : ipvaTipo === 'cliente' ? 'Cliente' : ipvaTipo === 'loja' ? 'Loja' : undefined} />
                        {ipvaTipo === 'ambos' && <InfoDisplay label="Cotas do IPVA" value={ipvaCotas} />}
                        {ipvaTipo === 'loja' && <InfoDisplay label="Valor do IPVA" value={ipvaValor ? `R$ ${ipvaValor}` : undefined} />}
                      </>
                    )}
                    <InfoDisplay label="Transferência" value={transferenciaTipo === 'cliente' ? 'Cliente' : transferenciaTipo === 'loja' ? 'Loja' : transferenciaTipo === 'outra_uf' ? 'Outra UF' : undefined} />
                    {transferenciaTipo === 'cliente' && <InfoDisplay label="Valor da Transferência" value={transferenciaValor ? `R$ ${transferenciaValor}` : undefined} />}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <CurrencyField label="Valor do Sinal" value={valorSinal} onChange={setValorSinal} required />
                      <CurrencyField label="Valor da Venda" value={valorVenda} onChange={setValorVenda} required />
                    </div>

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
                      {ipvaTipo === 'loja' && (
                        <div className="mt-2">
                          <CurrencyField label="Valor do IPVA" value={ipvaValor} onChange={setIpvaValor} required />
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
                                  {avaliacaoData.avaliacao_compra != null && avaliacaoData.previsao_custos_loja != null
                                    ? formatCurrency(avaliacaoData.avaliacao_compra - avaliacaoData.previsao_custos_loja)
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

              {/* Card: Negociação */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" /> Negociação
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">

                {/* Adicionar / editar forma */}
                {!soLeitura && (
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
                        onClick={() => { setNovaPagamentoTipo(fp.id); setNovaInstituicaoId(''); setNovaObservacoes(''); setOutroValor(''); setFinValorEntrada(''); setFinParcelas(''); setFinValorParcelas(''); setFinValorFinanciado(''); }}
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
                    </div>
                  )}

                  {novaPagamentoTipo && !ehFinanciamento(novaFormaNome) && (
                    <CurrencyField label="Valor Total" value={outroValor} onChange={setOutroValor} />
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
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddPagamento} className="flex-1">
                        {editingId ? <Save className="h-4 w-4 mr-1" /> : <PlusCircle className="h-4 w-4 mr-1" />}
                        {editingId ? 'Salvar Alterações' : 'Adicionar'}
                      </Button>
                      {editingId && (
                        <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                          Cancelar
                        </Button>
                      )}
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
                          {ehFinanciamento(fp.tipo) ? (
                            <div className="text-xs text-muted-foreground space-x-3">
                              {fp.valor_entrada != null && <span>Entrada: {formatCurrency(fp.valor_entrada)}</span>}
                              {fp.numero_parcelas != null && fp.valor_parcelas != null && (
                                <span>{fp.numero_parcelas}x de {formatCurrency(fp.valor_parcelas)}</span>
                              )}
                              {fp.valor_financiado != null && <span>Financiado: {formatCurrency(fp.valor_financiado)}</span>}
                            </div>
                          ) : (
                            fp.valor_total != null && <p className="text-xs text-muted-foreground">Valor: {formatCurrency(fp.valor_total)}</p>
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
                    <Textarea rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações do Contrato <span className="text-destructive">*</span></Label>
                    <Textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
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
                    {nfeJaEmitida ? (
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
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
          </div>

          {/* Ações */}
          {ehNfe ? (
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {nfe.nfe?.status === 'processada' && (
                <div className="flex flex-wrap items-center gap-3 mr-auto text-sm">
                  <Badge className="bg-primary/10 text-primary gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> NF-e nº {nfe.nfe?.numero || '-'} • série {nfe.nfe?.serie || '-'}
                  </Badge>
                  {nfe.nfe?.caminho_danfe && (
                    <Button variant="outline" size="sm" onClick={() => window.open(nfe.nfe.caminho_danfe, '_blank', 'noopener')}>
                      <ExternalLink className="h-4 w-4 mr-1" /> DANFE
                    </Button>
                  )}
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

              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {!nfeJaEmitida && !nfe.pendente && (
                <Button
                  className="gap-1.5"
                  disabled={nfe.loading || !empresaId || parseCurrencyInput(nfeValor) <= 0 || (hasTroca && !valorQuitacao?.trim())}
                  title={
                    !empresaId
                      ? 'Nenhuma empresa vinculada à loja do atendimento'
                      : hasTroca && !valorQuitacao?.trim()
                        ? 'Valor de Quitação da moto do cliente é obrigatório — defina na avaliação (0 se não houver)'
                        : undefined
                  }
                  onClick={() => nfe.emitir({ valor: parseCurrencyInput(nfeValor), observacoes: nfeObs || undefined, empresa_id: empresaId || undefined })}
                >
                  {nfe.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfe.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  {nfe.erro ? 'Tentar novamente' : 'Emitir NF-e'}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {jaGerado && contratoId && (
                <Button variant="outline" onClick={handleVisualizar} disabled={viewing}>
                  <Eye className="h-4 w-4 mr-1" />{viewing ? 'Abrindo...' : 'Visualizar'}
                </Button>
              )}
              <Button variant="outline" onClick={() => handleGerar('sinal')} disabled={generating || nfeJaEmitida}>
                <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Contrato Sinal'}
              </Button>
              {canGerarVenda && (
                <Button variant="outline" onClick={() => handleGerar('venda')} disabled={generating || nfeJaEmitida}>
                  <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Contrato Venda'}
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving || nfeJaEmitida} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md px-6">
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
