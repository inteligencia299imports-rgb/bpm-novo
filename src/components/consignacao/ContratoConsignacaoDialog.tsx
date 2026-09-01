import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { FileText, CalendarIcon, Save, Download, Percent, Eye, ArrowLeft, Loader2, RefreshCw, ExternalLink, AlertTriangle, User, Bike, MessageSquare, Pencil, MapPin, Landmark, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoConsignacaoPdf } from '@/lib/generateContratoConsignacaoPdf';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto } from '@/lib/clienteCadastro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: any;
  /** 'nfe' abre a mesma tela para revisar/emitir a NF-e de entrada em consignação. */
  modo?: 'contrato' | 'nfe';
}

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

const formatCep = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
  }
  return digits;
};

const formatTelefone = (v: string | null | undefined): string | undefined => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || undefined;
};

const tipoContaLabel = (v: string | null | undefined) => {
  if (v === 'corrente') return 'Corrente';
  if (v === 'poupanca') return 'Poupança';
  if (v === 'pagamento') return 'Pagamento';
  return v || undefined;
};

const fmtDataNasc = (v: string | null | undefined) =>
  v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1') : undefined;

const CurrencyField = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <div>
    <label className="text-sm font-medium text-foreground">{label}</label>
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

const InfoDisplay = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  ) : null
);

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Assinatura dos campos do contrato para detectar edição desde a última geração
// (mesma lógica do contrato de compra).
const snapshotFields = (v: {
  cpfCnpj: string; email: string; endereco: string; cep: string;
  valorQuitacao: string; valorFechamento: string;
  obsInternas: string; obsContrato: string; dataContrato?: Date;
}) => JSON.stringify({ ...v, dataContrato: v.dataContrato ? v.dataContrato.toISOString().slice(0, 10) : '' });

const ContratoConsignacaoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao, modo = 'contrato' }) => {
  const { user, userName } = useAuth();
  const ehNfe = modo === 'nfe';
  // Após a NF-e autorizada, volta para a tela de Consignação.
  const nfe = useNfeCompra(avaliacao?.id, open, 'consignacao', 'avaliacao', () => {
    if (modo === 'nfe') setTimeout(() => onOpenChange(false), 1200);
  });
  const nfeJaEmitida = nfe.emitida;
  const soLeitura = ehNfe || nfeJaEmitida;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);
  // Modo NF-e: valor editável antes de emitir + obs da nota.
  const [valorConsigNota, setValorConsigNota] = useState('');
  const [obsNfe, setObsNfe] = useState('');
  // Empresa emitente da NF-e (restrita às empresas vinculadas à loja do atendimento).
  const [empresasLoja, setEmpresasLoja] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const podeEmitirNfe = jaGerado && (avaliacao as any)?.consulta_realizada === true;

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');
  // CPF/CNPJ já cadastrado no cliente é imutável — só permite preencher se vazio.
  const [clienteCpfOriginal, setClienteCpfOriginal] = useState('');
  const cpfBloqueado = !!clienteCpfOriginal;
  const [email, setEmail] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cep, setCep] = useState('');
  // Cadastro completo do cliente (embute o ClienteForm, igual ao contrato de compra).
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteRecord, setClienteRecord] = useState<any | null>(null);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteTocado, setClienteTocado] = useState(false);

  // Moto values
  const [valorQuitacao, setValorQuitacao] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');
  // Custos de oficina de responsabilidade do cliente (abatem o repasse) — igual ao contrato de compra.
  const [custosCliente, setCustosCliente] = useState(0);

  // Observations
  const [obsInternas, setObsInternas] = useState('');
  const [obsContrato, setObsContrato] = useState('');

  // Date
  const [dataContrato, setDataContrato] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  // Baseline p/ detectar edição desde a última geração/carregamento (igual compra).
  const [baseline, setBaseline] = useState('');

  const moto = avaliacao;
  const atendimento = avaliacao?.atendimento || avaliacao?.atendimentos;

  useEffect(() => {
    if (!open || !avaliacao) return;
    const loadContrato = async () => {
      setLoading(true);
      const [{ data: contrato }, { data: histGerado }, { data: custosData }] = await Promise.all([
        supabase
          .from('contratos_consignacao')
          .select('*')
          .eq('avaliacao_id', avaliacao.id)
          .maybeSingle(),
        supabase
          .from('status_history')
          .select('id')
          .eq('entity_type', 'consignacao')
          .eq('entity_id', avaliacao.id)
          .like('status', 'CONTRATO GERADO%')
          .limit(1),
        supabase
          .from('custos_oficina')
          .select('responsavel, valor_previsto, valor_executado')
          .eq('avaliacao_id', avaliacao.id),
      ]);

      setJaGerado(!!(histGerado && histGerado.length > 0));
      setCustosCliente(
        (custosData || [])
          .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
          .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0),
      );
      nfe.carregar();
      // Quitação e Fechamento da moto do cliente têm origem na avaliação — não são editados no contrato.
      const quitacaoAval = (avaliacao as any)?.valor_quitacao;
      const fechamentoAval = (avaliacao as any)?.valor_fechamento;
      // Valor da NF default = valor de fechamento (contrato > avaliação); mantém o que já foi
      // informado numa tentativa anterior, se houver.
      const fechamentoNota = (contrato as any)?.valor_fechamento ?? fechamentoAval;
      const vcn = (avaliacao as any)?.valor_consignacao_nota ?? fechamentoNota;
      setValorConsigNota(vcn != null ? formatCurrencyInput(String(Math.round(vcn * 100))) : '');
      setObsNfe('');

      // Buscar dados atualizados do atendimento direto do banco para garantir dados frescos
      const atendimentoId = atendimento?.id || avaliacao?.atendimento_id;
      let atendimentoFresh: any = atendimento || {};
      if (atendimentoId) {
        const { data: at, error: atErr } = await supabase
          .from('atendimentos_motos')
          .select('cliente_id, loja_id, cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))')
          .eq('id', atendimentoId)
          .maybeSingle();
        console.log('[ContratoConsignacao] atendimentoId:', atendimentoId, 'fresh:', at, 'err:', atErr);
        if ((at as any)?.cliente_id) setClienteId((at as any).cliente_id);

        // Empresas vinculadas à loja do atendimento (loja_empresas.id = atendimento.loja_id).
        const lojaId = (at as any)?.loja_id;
        let empresas: any[] = [];
        if (lojaId) {
          const { data: le } = await supabase
            .from('loja_empresas')
            .select('empresa_id, empresas:empresa_id(id, nome, razao_social, cnpj, endereco, uf)')
            .eq('id', lojaId);
          const seen = new Set<string>();
          empresas = (le || [])
            .map((r: any) => r.empresas)
            .filter((e: any) => e && !seen.has(e.id) && seen.add(e.id));
        }
        setEmpresasLoja(empresas);
        setEmpresaId(empresas[0]?.id || '');
        if (at?.cliente) {
          setClienteRecord(at.cliente);
          const end = (at.cliente as any).clientes_fornecedores_enderecos?.[0];
          atendimentoFresh = {
            ...atendimentoFresh,
            nome_cliente: (at.cliente as any).nome_razao_social,
            cpf_cnpj: (at.cliente as any).cpf_cnpj,
            email: (at.cliente as any).email,
            endereco: end?.logradouro,
            cep: end?.cep,
          };
        }
      } else {
        console.warn('[ContratoConsignacao] sem atendimentoId! avaliacao:', avaliacao);
      }
      console.log('[ContratoConsignacao] contrato:', contrato, 'atendimentoFresh:', atendimentoFresh);

      setClienteCpfOriginal(atendimentoFresh?.cpf_cnpj ? String(atendimentoFresh.cpf_cnpj) : '');
      setEditandoCliente(false);

      if (contrato) {
        setContratoId(contrato.id);
        // Fallback: se contrato não tem, puxa do atendimento (cliente já cadastrado)
        setCpfCnpj(contrato.cpf_cnpj || atendimentoFresh?.cpf_cnpj || '');
        setEmail(contrato.email || atendimentoFresh?.email || '');
        setEndereco(contrato.endereco || atendimentoFresh?.endereco || '');
        setCep(contrato.cep || atendimentoFresh?.cep || '');
        setValorQuitacao((contrato.valor_quitacao ?? quitacaoAval) != null ? formatCurrencyInput(String(Math.round((contrato.valor_quitacao ?? quitacaoAval) * 100))) : '');
        setValorFechamento((contrato.valor_fechamento ?? fechamentoAval) != null ? formatCurrencyInput(String(Math.round((contrato.valor_fechamento ?? fechamentoAval) * 100))) : '');
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataContrato(contrato.data_contrato ? new Date(contrato.data_contrato + 'T12:00:00') : undefined);
      } else {
        setContratoId(null);
        // Pré-preencher dados do cliente a partir do atendimento
        setCpfCnpj(atendimentoFresh?.cpf_cnpj || '');
        setEmail(atendimentoFresh?.email || '');
        setEndereco(atendimentoFresh?.endereco || '');
        setCep(atendimentoFresh?.cep || '');
        // Quitação e Fechamento vêm da avaliação (origem) — não são editados no contrato.
        setValorQuitacao(quitacaoAval != null ? formatCurrencyInput(String(Math.round(quitacaoAval * 100))) : '');
        setValorFechamento(fechamentoAval != null ? formatCurrencyInput(String(Math.round(fechamentoAval * 100))) : '');
        setObsInternas('');
        setObsContrato('');
        setDataContrato(undefined);
      }
      setLoading(false);
    };
    loadContrato();
  }, [open, avaliacao?.id]);

  // Após terminar de carregar, fixa o baseline com os valores atuais.
  useEffect(() => {
    if (loading) return;
    setBaseline(snapshotFields({ cpfCnpj, email, endereco, cep, valorQuitacao, valorFechamento, obsInternas, obsContrato, dataContrato }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const saveContrato = async (): Promise<string | null> => {
    if (nfeJaEmitida) {
      toast.error('Contrato bloqueado: a NF-e já foi emitida.');
      return null;
    }
    setSaving(true);
    const payload: any = {
      avaliacao_id: avaliacao.id,
      cpf_cnpj: cpfCnpj || null,
      email: email || null,
      endereco: endereco || null,
      cep: cep || null,
      valor_quitacao: valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : 0,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      observacoes_internas: obsInternas || null,
      observacoes_contrato: obsContrato || null,
      data_contrato: dataContrato ? format(dataContrato, 'yyyy-MM-dd') : null,
    };

    // Sync client data back to o cliente vinculado
    const atendimentoId = atendimento?.id;
    if (atendimentoId) {
      const { data: atRow } = await supabase.from('atendimentos_motos').select('cliente_id').eq('id', atendimentoId).maybeSingle();
      if (atRow?.cliente_id) {
        await supabase.from('clientes_fornecedores').update({
          // CPF/CNPJ do cliente é imutável: só grava se ainda não havia um.
          ...(cpfBloqueado ? {} : { cpf_cnpj: cpfCnpj || null }),
          email: email || null,
        }).eq('id', atRow.cliente_id);
        const { data: endRow } = await supabase.from('clientes_fornecedores_enderecos').select('id').eq('cliente_fornecedor_id', atRow.cliente_id).eq('tipo', 'fiscal').maybeSingle();
        if (endRow) {
          await supabase.from('clientes_fornecedores_enderecos').update({ logradouro: endereco || null, cep: cep || null }).eq('id', endRow.id);
        } else if (endereco || cep) {
          await supabase.from('clientes_fornecedores_enderecos').insert({ cliente_fornecedor_id: atRow.cliente_id, tipo: 'fiscal', logradouro: endereco || null, cep: cep || null });
        }
      }
    }

    if (contratoId) {
      const { error } = await supabase.from('contratos_consignacao').update(payload).eq('id', contratoId);
      if (error) {
        toast.error('Erro ao salvar contrato');
        setSaving(false);
        return null;
      }
      setSaving(false);
      return contratoId;
    } else {
      const { data, error } = await supabase.from('contratos_consignacao').insert(payload).select().single();
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
      onOpenChange(false);
    }
  };

  const handleClienteSaved = async (savedId: string) => {
    setClienteId(savedId);
    setClienteTocado(true);
    const { data } = await supabase
      .from('clientes_fornecedores')
      .select('*, clientes_fornecedores_enderecos(*)')
      .eq('id', savedId)
      .maybeSingle();
    if (data) {
      setClienteRecord(data);
      const end = (data as any).clientes_fornecedores_enderecos?.[0];
      if ((data as any).cpf_cnpj) {
        setCpfCnpj(formatCpfCnpj((data as any).cpf_cnpj));
        setClienteCpfOriginal(String((data as any).cpf_cnpj));
      }
      if ((data as any).email) setEmail((data as any).email);
      if (end?.logradouro) setEndereco(end.logradouro);
      if (end?.cep) setCep(end.cep);
    }
    setEditandoCliente(false);
  };

  // Resumo do cliente (quando o cadastro está completo) — igual ao contrato de compra.
  const cli = clienteRecord;
  const cliEndereco = cli?.clientes_fornecedores_enderecos?.[0] || null;
  const cadastroCompleto = cadastroClienteCompleto(cli, cliEndereco);

  // KPIs de valores — mesma lógica do contrato de compra.
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fechamentoNum = valorFechamento?.trim() ? parseCurrencyInput(valorFechamento) : 0;
  const quitacaoNum = valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : 0;
  const previsaoCustosCliente = Number((avaliacao as any)?.previsao_custos_cliente ?? 0);
  const abatimentos = custosCliente + previsaoCustosCliente;
  const repasseCliente = fechamentoNum - abatimentos - quitacaoNum;

  // Houve edição desde a última geração/carregamento? (igual contrato de compra)
  const currentSnapshot = snapshotFields({ cpfCnpj, email, endereco, cep, valorQuitacao, valorFechamento, obsInternas, obsContrato, dataContrato });
  const editado = currentSnapshot !== baseline || clienteTocado;
  // Contrato já gerado e sem edições (ou NF-e já emitida) -> só permite baixar/visualizar.
  const modoLeitura = (jaGerado && !editado) || nfeJaEmitida;

  const validateFields = (): boolean => {
    if (!cpfCnpj?.trim()) { toast.error('CPF/CNPJ é obrigatório'); return false; }
    if (!email?.trim()) { toast.error('E-mail é obrigatório'); return false; }
    if (!endereco?.trim()) { toast.error('Endereço é obrigatório'); return false; }
    if (!cep?.trim()) { toast.error('CEP é obrigatório'); return false; }
    // Quitação é obrigatória — o usuário precisa informar, ainda que seja 0.
    if (!valorQuitacao?.trim()) { toast.error('Valor de Quitação é obrigatório (informe 0 se não houver)'); return false; }
    if (!valorFechamento?.trim() || parseCurrencyInput(valorFechamento) <= 0) { toast.error('Valor de Fechamento é obrigatório'); return false; }
    if (!dataContrato) { toast.error('Data do Contrato é obrigatória'); return false; }
    return true;
  };

  const buildPdfData = (comPercentual?: number) => {
    const anoStr = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
    const formatCurrencyValue = (val: string) => {
      const num = parseCurrencyInput(val);
      return num ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
    };
    return {
      loja: atendimento?.loja || null,
      nomeCliente: clienteRecord?.nome_razao_social || atendimento?.cliente?.nome_razao_social || '',
      telefone: (() => {
        const t = clienteRecord?.telefone || atendimento?.cliente?.telefone || '';
        const digits = t.replace(/\D/g, '');
        if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
        return t;
      })(),
      cpfCnpj: cpfCnpj || '-',
      email: email || '-',
      endereco: endereco || '-',
      cep: cep || '-',
      bancoCliente: cli ? {
        banco: cli.banco ?? null,
        tipoConta: tipoContaLabel(cli.tipo_conta) ?? null,
        agencia: cli.agencia ?? null,
        conta: cli.conta ? `${cli.conta}${cli.digito_conta ? `-${cli.digito_conta}` : ''}` : null,
        chavePix: cli.chave_pix ?? null,
        favorecido: cli.favorecido ?? null,
        cpfCnpjFavorecido: cli.cpf_cnpj_favorecido ?? null,
      } : null,
      marca: moto?.marca || '',
      modelo: moto?.modelo || '',
      anoFabMod: anoStr || '-',
      placa: moto?.placa?.replace(/-/g, '') || '-',
      km: moto?.km || '-',
      valorQuitacao: formatCurrencyValue(valorQuitacao),
      valorNegociado: formatCurrencyValue(valorFechamento),
      observacoes: obsContrato || '',
      valorFechamento: formatCurrencyValue(valorFechamento),
      dataContrato: dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : '-',
      comPercentual5: !!comPercentual,
    };
  };

  const handleGerar = async (comPercentual?: number) => {
    if (!validateFields()) return;
    setGenerating(true);
    const id = await saveContrato();
    if (!id) { setGenerating(false); return; }
    try {
      await generateContratoConsignacaoPdf(buildPdfData(comPercentual), 'download');

      if (user) {
        const { error } = await supabase.from('status_history').insert({
          entity_type: 'consignacao',
          entity_id: avaliacao.id,
          status: comPercentual ? 'CONTRATO GERADO (5%)' : 'CONTRATO GERADO',
          changed_by: user.id,
          changed_by_name: userName || 'Vendedor',
        });
        if (error) console.error('Erro ao registrar histórico:', error);
      }

      setJaGerado(true);
      setBaseline(snapshotFields({ cpfCnpj, email, endereco, cep, valorQuitacao, valorFechamento, obsInternas, obsContrato, dataContrato }));
      setClienteTocado(false);
      toast.success(`Contrato de consignação ${comPercentual ? '(5%) ' : ''}gerado com sucesso!`);
      // Volta para a tela de detalhes.
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao gerar contrato:', err);
      toast.error('Erro ao gerar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleVisualizar = async (comPercentual?: number) => {
    setGenerating(true);
    try {
      await generateContratoConsignacaoPdf(buildPdfData(comPercentual), 'view');
    } catch (err) {
      console.error('Erro ao visualizar contrato:', err);
      toast.error('Erro ao visualizar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleBaixar = async (comPercentual?: number) => {
    setGenerating(true);
    try {
      await generateContratoConsignacaoPdf(buildPdfData(comPercentual), 'download');
      // Volta para a tela de detalhes.
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao baixar contrato:', err);
      toast.error('Erro ao baixar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

  if (!open) return null;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> {ehNfe ? 'Emissão de NF-e de Consignação' : 'Contrato de Consignação'}
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
              {/* Card: Empresa Emitente (só na emissão de NF-e) */}
              {ehNfe && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" /> Empresa Emitente
                    </CardTitle>
                    <Separator className="mt-2" />
                  </CardHeader>
                  <CardContent>
                    {empresasLoja.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma empresa vinculada à loja do atendimento.
                      </p>
                    ) : nfeJaEmitida ? (
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
                        <Label>Empresa da operação <span className="text-destructive">*</span></Label>
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
              )}

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
                      <InfoDisplay label="Telefone (comercial)" value={formatTelefone(cli?.telefone_comercial)} />
                    </div>
                  ) : (
                    <ClienteForm
                      embedded
                      id={clienteId}
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

                  {/* Card: Dados Bancários */}
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
                </>
              )}

              {/* Card: Moto do Cliente */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bike className="h-4 w-4 text-primary" /> Moto do Cliente
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <InfoDisplay label="Marca" value={moto?.marca} />
                    <InfoDisplay label="Modelo" value={(moto?.modelo || '').toUpperCase() || undefined} />
                    <InfoDisplay label="Ano Fabricação" value={moto?.ano_fabricacao} />
                    <InfoDisplay label="Ano Modelo" value={moto?.ano_modelo} />
                    <InfoDisplay label="Categoria" value={moto?.categoria ? String(moto.categoria).toUpperCase() : undefined} />
                    <InfoDisplay label="Cilindrada" value={moto?.cilindrada ? (parseInt(String(moto.cilindrada).replace(/\D/g, ''), 10) || 0).toLocaleString('pt-BR') : undefined} />
                    <InfoDisplay label="Cor" value={moto?.cor ? String(moto.cor).toUpperCase() : undefined} />
                    <InfoDisplay label="Placa" value={moto?.placa ? moto.placa.replace(/-/g, '') : undefined} />
                    <InfoDisplay label="KM" value={moto?.km ? `${Number(String(moto.km).replace(/\D/g, '')).toLocaleString('pt-BR')} km` : undefined} />
                    <InfoDisplay label="Chassi" value={moto?.chassi} />
                    <InfoDisplay label="RENAVAM" value={moto?.renavam} />
                    <InfoDisplay label="Nº CRV" value={moto?.numero_crv} />
                    <InfoDisplay label="UF" value={moto?.uf} />
                  </div>
                  {moto?.observacoes && <InfoDisplay label="Observações" value={moto.observacoes} />}
                  <MaintenanceBadges
                    temManual={moto?.tem_manual}
                    temChaveReserva={moto?.tem_chave_reserva}
                    manutencaoVencida={moto?.manutencao_vencida}
                  />
                </CardContent>
              </Card>

              {/* KPIs de Valores */}
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Abatimentos (Custos+Despesas)</span>
                    <p className="text-base font-bold text-primary">{brl(abatimentos)}</p>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Quitação</span>
                    <p className="text-base font-bold text-primary">{brl(quitacaoNum)}</p>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Valor de Fechamento</span>
                    <p className="text-base font-bold text-primary">{brl(fechamentoNum)}</p>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse ao Cliente</span>
                    <p className={`text-base font-bold ${repasseCliente >= 0 ? 'text-primary' : 'text-destructive'}`}>{brl(repasseCliente)}</p>
                  </div>
                </div>
              </div>

              {/* Card: Datas */}
              {!soLeitura && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" /> Datas
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Data do Contrato <span className="text-destructive">*</span></Label>
                    <Popover open={calOpen} onOpenChange={setCalOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataContrato && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dataContrato} onSelect={setDataContrato} disabled={{ after: new Date() }} initialFocus className="p-3 pointer-events-auto" />
                        <div className="border-t p-2 flex justify-end">
                          <Button size="sm" disabled={!dataContrato} onClick={() => setCalOpen(false)}>OK</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Card: Observações */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Observações
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {ehNfe && !nfeJaEmitida ? (
                    <>
                      <div className="max-w-xs">
                        <CurrencyField
                          label="Valor da NF-e"
                          value={valorConsigNota}
                          onChange={setValorConsigNota}
                          disabled={nfe.pendente}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Valor que sai na nota de entrada em consignação.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Observações na NF-e</Label>
                        <Textarea
                          className="uppercase"
                          rows={3}
                          value={obsNfe}
                          onChange={(e) => setObsNfe(e.target.value.toUpperCase())}
                          placeholder="INFORMAÇÕES COMPLEMENTARES QUE SAIRÃO NA NOTA..."
                          disabled={nfe.pendente}
                        />
                      </div>
                    </>
                  ) : soLeitura ? (
                    <>
                      <InfoDisplay label="Observações Internas" value={obsInternas || undefined} />
                      <InfoDisplay label="Observações do Contrato" value={obsContrato || undefined} />
                      {!obsInternas && !obsContrato && <p className="text-sm text-muted-foreground">Sem observações.</p>}
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Observações Internas</Label>
                        <Textarea rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Observações do Contrato</Label>
                        <Textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
            {ehNfe && nfe.nfe?.status === 'processada' && (
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
            {ehNfe && nfe.pendente && (
              <div className="flex items-center gap-3 mr-auto">
                <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                <Button variant="ghost" onClick={nfe.consultar} disabled={nfe.loading} className="gap-1.5">
                  <RefreshCw className={`h-4 w-4 ${nfe.loading ? 'animate-spin' : ''}`} /> Atualizar
                </Button>
              </div>
            )}
            {ehNfe && nfe.erro && !nfe.pendente && (
              <p className="mr-auto text-sm text-destructive flex items-start gap-1 max-w-md">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {nfe.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
              </p>
            )}

            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>

            {ehNfe ? (
              nfe.nfe?.status !== 'processada' && !nfe.pendente && (
                <Button
                  disabled={!podeEmitirNfe || nfe.loading || !empresaId}
                  title={
                    !empresaId
                      ? 'Nenhuma empresa vinculada à loja do atendimento'
                      : podeEmitirNfe
                        ? undefined
                        : 'Disponível após o contrato do consignante e a consulta realizada'
                  }
                  onClick={() => nfe.emitir({ valor: parseCurrencyInput(valorConsigNota), observacoes: obsNfe.trim() || undefined, empresa_id: empresaId || undefined })}
                >
                  {nfe.loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : nfe.erro ? <RefreshCw className="h-4 w-4 mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  {nfe.erro ? 'Tentar novamente' : 'Emitir NF-e'}
                </Button>
              )
            ) : modoLeitura ? (
              <>
                <Button variant="outline" onClick={() => handleBaixar()} disabled={generating}>
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </Button>
                <Button variant="outline" onClick={() => handleBaixar(5)} disabled={generating}>
                  <Download className="h-4 w-4 mr-1" /> Baixar (5%)
                </Button>
                <Button variant="outline" onClick={() => handleVisualizar()} disabled={generating}>
                  <Eye className="h-4 w-4 mr-1" /> Visualizar
                </Button>
                <Button onClick={() => handleVisualizar(5)} disabled={generating}>
                  <Eye className="h-4 w-4 mr-1" /> Visualizar (5%)
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1">
                  <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button variant="outline" onClick={() => handleGerar(5)} disabled={generating}>
                  <Percent className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Gerar (5%)'}
                </Button>
                <Button onClick={() => handleGerar()} disabled={generating}>
                  <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Gerar'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ContratoConsignacaoDialog;
