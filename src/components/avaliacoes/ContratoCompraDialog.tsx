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
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto } from '@/lib/clienteCadastro';
import { Badge } from '@/components/ui/badge';
import { FileText, CalendarIcon, Save, Download, Eye, ArrowLeft, User, Bike, MessageSquare, Pencil, MapPin, Landmark, Loader2, RefreshCw, AlertTriangle, ExternalLink, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoCompraPdf } from '@/lib/generateContratoCompraPdf';
import { useNfeCompra } from '@/hooks/useNfeCompra';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: any;
  /** 'nfe' abre a mesma tela em modo somente-leitura para emitir a NF-e de compra. */
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

const tipoContaLabel = (v: string | null | undefined) => {
  if (v === 'corrente') return 'Corrente';
  if (v === 'poupanca') return 'Poupança';
  if (v === 'pagamento') return 'Pagamento';
  return v || undefined;
};

interface SnapshotVals {
  cpfCnpj: string;
  valorQuitacao: string;
  valorFechamento: string;
  obsInternas: string;
  obsContrato: string;
  dataContrato?: Date;
}
const snapshotFields = (v: SnapshotVals) =>
  JSON.stringify({
    cpfCnpj: v.cpfCnpj,
    valorQuitacao: v.valorQuitacao,
    valorFechamento: v.valorFechamento,
    obsInternas: v.obsInternas,
    obsContrato: v.obsContrato,
    dataContrato: v.dataContrato ? format(v.dataContrato, 'yyyy-MM-dd') : null,
  });

const InfoDisplay = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  ) : null
);

const ContratoCompraDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao, modo = 'contrato' }) => {
  const { user, userName } = useAuth();
  const ehNfe = modo === 'nfe';
  // Após a NF-e autorizada, volta para a tela de Pós-Compra.
  const nfe = useNfeCompra(avaliacao?.id, open, 'compra', 'avaliacao', () => {
    if (modo === 'nfe') setTimeout(() => onOpenChange(false), 1200);
  });
  // NF-e autorizada -> contrato e cliente 100% travados (nenhum campo editável).
  const nfeJaEmitida = nfe.emitida;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);
  // Controle de "edição desde a última geração" para liberar o botão Gerar.
  const [baseline, setBaseline] = useState('');
  const [clienteTocado, setClienteTocado] = useState(false);

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteRecord, setClienteRecord] = useState<any | null>(null);
  const [custosCliente, setCustosCliente] = useState(0);
  const [editandoCliente, setEditandoCliente] = useState(false);

  // Values
  const [valorQuitacao, setValorQuitacao] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');

  // Observations
  const [obsInternas, setObsInternas] = useState('');
  const [obsContrato, setObsContrato] = useState('');
  const [obsNfe, setObsNfe] = useState('');
  // Modo NF-e: valor que vai para a nota (default = valor de fechamento). O compromisso continua sendo o repasse.
  const [nfeValor, setNfeValor] = useState('');

  // Empresa emitente da NF-e (restrita às empresas vinculadas à loja do atendimento).
  const [empresasLoja, setEmpresasLoja] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');

  // Date
  const [dataContrato, setDataContrato] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  const moto = avaliacao;
  const atendimento = avaliacao?.atendimento || avaliacao?.atendimentos;

  useEffect(() => {
    if (!open || !avaliacao) return;
    const loadContrato = async () => {
      setLoading(true);
      setEditandoCliente(false);
      const atendimentoId = atendimento?.id;
      if (!atendimentoId) {
        setLoading(false);
        return;
      }
      // Buscar contratos vinculados ao atendimento (pode haver de venda também),
      // pegamos o que tem observação 'CONTRATO_COMPRA' nas observacoes_internas marker,
      // ou criamos um novo. Para diferenciar do contrato de venda, usamos um marcador na coluna ipva_tipo='COMPRA'.
      const [{ data: contratosList }, { data: histGerado }, { data: atFresh }, { data: custosData }] = await Promise.all([
        supabase
          .from('contratos')
          .select('*')
          .eq('atendimento_id', atendimentoId)
          .eq('ipva_tipo', 'COMPRA'),
        supabase
          .from('status_history')
          .select('id')
          .eq('entity_type', 'pos_compra')
          .eq('entity_id', avaliacao.id)
          .eq('status', 'contrato_compra_gerado')
          .limit(1),
        supabase.from('atendimentos_motos').select('cliente_id, loja_id, cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))').eq('id', atendimentoId).maybeSingle(),
        supabase.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacao.id),
      ]);

      setCustosCliente(
        (custosData || [])
          .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
          .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0),
      );
      setJaGerado(!!(histGerado && histGerado.length > 0));
      setClienteTocado(false);
      nfe.carregar();
      setClienteId((atFresh as any)?.cliente_id ?? null);
      setClienteRecord((atFresh as any)?.cliente ?? null);

      const contrato = contratosList && contratosList.length > 0 ? contratosList[0] : null;
      const atFreshCpf = (atFresh as any)?.cliente?.cpf_cnpj;

      // Empresas vinculadas à loja do atendimento (loja_empresas.id = atendimento.loja_id).
      const lojaId = (atFresh as any)?.loja_id;
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
      setEmpresaId((contrato as any)?.empresa_id || empresas[0]?.id || '');

      const quitacaoAval = (avaliacao as any).valor_quitacao;

      let vals: SnapshotVals;
      if (contrato) {
        setContratoId(contrato.id);
        vals = {
          cpfCnpj: contrato.cpf_cnpj || atFreshCpf || '',
          valorQuitacao: (contrato.valor_quitacao ?? quitacaoAval) != null ? formatCurrencyInput(String(Math.round((contrato.valor_quitacao ?? quitacaoAval) * 100))) : '',
          valorFechamento: (contrato.valor_fechamento ?? avaliacao.valor_fechamento) != null ? formatCurrencyInput(String(Math.round((contrato.valor_fechamento ?? avaliacao.valor_fechamento) * 100))) : '',
          obsInternas: contrato.observacoes_internas || '',
          obsContrato: contrato.observacoes_contrato || '',
          dataContrato: contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined,
        };
      } else {
        setContratoId(null);
        vals = {
          cpfCnpj: atFreshCpf || '',
          valorQuitacao: quitacaoAval != null ? formatCurrencyInput(String(Math.round(quitacaoAval * 100))) : '',
          valorFechamento: avaliacao.valor_fechamento != null ? formatCurrencyInput(String(Math.round(avaliacao.valor_fechamento * 100))) : '',
          obsInternas: '',
          obsContrato: '',
          dataContrato: undefined,
        };
      }
      setCpfCnpj(vals.cpfCnpj);
      setValorQuitacao(vals.valorQuitacao);
      setValorFechamento(vals.valorFechamento);
      // Valor da NF-e default = valor de fechamento (editável na tela de emissão).
      setNfeValor(vals.valorFechamento);
      setObsInternas(vals.obsInternas);
      setObsContrato(vals.obsContrato);
      setDataContrato(vals.dataContrato);
      setBaseline(snapshotFields(vals));
      setLoading(false);
    };
    loadContrato();
  }, [open, avaliacao?.id]);

  // Se já houve uma emissão (ex.: em erro), repõe o valor da NF que foi tentado.
  useEffect(() => {
    const vt = (nfe.nfe as any)?.valor_total;
    if (ehNfe && !nfeJaEmitida && typeof vt === 'number' && vt > 0) {
      setNfeValor(formatCurrencyInput(String(Math.round(vt * 100))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(nfe.nfe as any)?.valor_total, ehNfe, nfeJaEmitida]);

  const saveContrato = async (): Promise<string | null> => {
    if (nfeJaEmitida) {
      toast.error('Contrato bloqueado: a NF-e já foi emitida.');
      return null;
    }
    setSaving(true);
    const atendimentoId = atendimento?.id;
    if (!atendimentoId) {
      toast.error('Atendimento não encontrado');
      setSaving(false);
      return null;
    }
    const payload: any = {
      atendimento_id: atendimentoId,
      cpf_cnpj: cpfCnpj || null,
      valor_quitacao: valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      observacoes_internas: obsInternas || null,
      observacoes_contrato: obsContrato || null,
      data_sinal: dataContrato ? format(dataContrato, 'yyyy-MM-dd') : null,
      ipva_tipo: 'COMPRA', // marcador para distinguir contrato de compra do de venda
      empresa_id: empresaId || null,
    };

    if (contratoId) {
      const { error } = await supabase.from('contratos').update(payload).eq('id', contratoId);
      if (error) {
        console.error('Erro update contrato compra:', error);
        toast.error('Erro ao salvar contrato');
        setSaving(false);
        return null;
      }
      setSaving(false);
      return contratoId;
    } else {
      const { data, error } = await supabase.from('contratos').insert(payload).select().single();
      if (error) {
        console.error('Erro insert contrato compra:', error);
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

  // Grava a empresa emitente escolhida no contrato (tela de emissão de NF-e).
  const handleEmpresaChange = async (v: string) => {
    setEmpresaId(v);
    if (contratoId) {
      const { error } = await supabase.from('contratos').update({ empresa_id: v }).eq('id', contratoId);
      if (error) toast.error('Erro ao salvar a empresa emitente');
    }
  };

  const validateFields = (): boolean => {
    if (!cpfCnpj?.trim()) { toast.error('CPF/CNPJ é obrigatório'); return false; }
    // Quitação é obrigatória — o usuário precisa informar, ainda que seja 0.
    if (!valorQuitacao?.trim()) { toast.error('Valor de Quitação é obrigatório (informe 0 se não houver)'); return false; }
    if (!valorFechamento?.trim() || parseCurrencyInput(valorFechamento) <= 0) { toast.error('Valor de Fechamento é obrigatório'); return false; }
    if (!dataContrato) { toast.error('Data do Contrato é obrigatória'); return false; }
    if (dataContrato > new Date()) { toast.error('A Data do Contrato não pode ser maior que hoje'); return false; }
    return true;
  };

  const buildPdfData = () => {
    const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
    const formatCurrencyValue = (val: string) => {
      const num = parseCurrencyInput(val);
      return num ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
    };
    const fmtNum = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fechNum = valorFechamento?.trim() ? parseCurrencyInput(valorFechamento) : 0;
    const quitNum = valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : 0;
    const tel = atendimento?.cliente?.telefone || '';
    const digits = tel.replace(/\D/g, '');
    const telefoneFormatado = digits.length === 11
      ? `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
      : digits.length === 10
        ? `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
        : tel;

    const empSel = empresasLoja.find((e) => e.id === empresaId) || null;

    const b = clienteRecord || {};
    const tipoConta = b.tipo_conta === 'corrente' ? 'Corrente'
      : b.tipo_conta === 'poupanca' ? 'Poupança'
      : b.tipo_conta === 'pagamento' ? 'Pagamento'
      : (b.tipo_conta || null);
    const bancoCliente = {
      banco: b.banco || null,
      tipoConta,
      agencia: b.agencia || null,
      conta: b.conta ? `${b.conta}${b.digito_conta ? `-${b.digito_conta}` : ''}` : null,
      chavePix: b.chave_pix || null,
      favorecido: b.favorecido || null,
      cpfCnpjFavorecido: b.cpf_cnpj_favorecido ? formatCpfCnpj(String(b.cpf_cnpj_favorecido)) : null,
    };

    return {
      loja: atendimento?.loja || null,
      bancoCliente,
      empresa: empSel
        ? {
            razaoSocial: empSel.razao_social || null,
            nome: empSel.nome || null,
            cnpj: empSel.cnpj || null,
            endereco: empSel.endereco || null,
            uf: empSel.uf || null,
          }
        : null,
      nomeCliente: atendimento?.cliente?.nome_razao_social || '',
      telefone: telefoneFormatado,
      cpfCnpj: cpfCnpj || '-',
      marca: moto?.marca || '',
      modelo: moto?.modelo || '',
      anoFabMod: ano || '-',
      placa: moto?.placa?.replace(/-/g, '') || '-',
      km: moto?.km || '-',
      valorQuitacao: formatCurrencyValue(valorQuitacao),
      valorFechamento: formatCurrencyValue(valorFechamento),
      abatimentos: fmtNum(custosCliente + Number((avaliacao as any)?.previsao_custos_cliente ?? 0)),
      repasseCliente: fmtNum(fechNum - custosCliente - Number((avaliacao as any)?.previsao_custos_cliente ?? 0) - quitNum),
      observacoes: obsContrato || '',
      dataContrato: dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : '-',
    };
  };

  const handleGerar = async () => {
    if (!validateFields()) return;
    setGenerating(true);
    const id = await saveContrato();
    if (!id) { setGenerating(false); return; }

    try {
      await generateContratoCompraPdf(buildPdfData());

      if (user) {
        await supabase.from('status_history').insert({
          entity_type: 'pos_compra',
          entity_id: avaliacao.id,
          status: 'contrato_compra_gerado',
          changed_by: user.id,
          changed_by_name: userName || 'Usuário',
        });
      }

      setJaGerado(true);
      setBaseline(snapshotFields({ cpfCnpj, valorQuitacao, valorFechamento, obsInternas, obsContrato, dataContrato }));
      setClienteTocado(false);
      toast.success('Contrato de compra gerado com sucesso!');
      // Volta para a tela de detalhes do pós-compra.
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao gerar contrato:', err);
      toast.error('Erro ao gerar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleVisualizar = async () => {
    setGenerating(true);
    try {
      await generateContratoCompraPdf(buildPdfData(), 'view');
    } catch (err) {
      console.error('Erro ao visualizar contrato:', err);
      toast.error('Erro ao visualizar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleBaixar = async () => {
    setGenerating(true);
    try {
      await generateContratoCompraPdf(buildPdfData(), 'download');
      // Volta para a tela de detalhes do pós-compra.
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao baixar contrato:', err);
      toast.error('Erro ao baixar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleClienteSaved = async (savedId: string) => {
    setClienteId(savedId);
    setClienteTocado(true);
    // Recarrega o cadastro completo (para o CPF do PDF e para decidir o modo compacto).
    const { data } = await supabase
      .from('clientes_fornecedores')
      .select('*, clientes_fornecedores_enderecos(*)')
      .eq('id', savedId)
      .maybeSingle();
    if (data) {
      setClienteRecord(data);
      if ((data as any).cpf_cnpj) setCpfCnpj(formatCpfCnpj((data as any).cpf_cnpj));
    }
    setEditandoCliente(false);
  };

  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

  // Resumo do cliente (quando o cadastro está completo)
  const cli = clienteRecord;
  const cliEndereco = cli?.clientes_fornecedores_enderecos?.[0] || null;
  const cadastroCompleto = cadastroClienteCompleto(cli, cliEndereco);
  const fmtTelefone = (v: string | null | undefined) => {
    const d = (v || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v || undefined;
  };
  const fmtDataNasc = (v: string | null | undefined) =>
    v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1') : undefined;

  // KPIs de valores
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fechamentoNum = valorFechamento?.trim() ? parseCurrencyInput(valorFechamento) : 0;
  const quitacaoNum = valorQuitacao?.trim() ? parseCurrencyInput(valorQuitacao) : 0;
  // Custo do cliente registrado na avaliação (previsão) + custos de oficina do cliente.
  const previsaoCustosCliente = Number((avaliacao as any)?.previsao_custos_cliente ?? 0);
  const custosClienteTotal = custosCliente + previsaoCustosCliente;
  const repasseCliente = fechamentoNum - custosClienteTotal - quitacaoNum;

  // Houve edição desde a última geração/carregamento?
  const currentSnapshot = snapshotFields({ cpfCnpj, valorQuitacao, valorFechamento, obsInternas, obsContrato, dataContrato });
  const editado = currentSnapshot !== baseline || clienteTocado;
  // Contrato já gerado e sem edições (ou NF-e já emitida) -> modo leitura.
  const modoLeitura = (jaGerado && !editado) || nfeJaEmitida;
  // Campos do contrato/cliente somente leitura: na tela de NF-e ou após NF-e autorizada.
  const soLeitura = ehNfe || nfeJaEmitida;
  // Empresa: editável enquanto a NF-e não foi emitida e o contrato não está travado em leitura.
  const empresaReadonly = nfeJaEmitida || (!ehNfe && modoLeitura);

  // Modo NF-e
  const podeEmitirNfe = (avaliacao as any)?.aprovacao_status === 'aprovada'
    && jaGerado
    && (avaliacao as any)?.consulta_realizada === true;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> {ehNfe ? 'Emissão de NF-e de Compra' : 'Contrato de Compra'}
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Card: Empresa (compradora no contrato / emitente na NF-e) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> {ehNfe ? 'Empresa Emitente' : 'Empresa Compradora'}
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent>
              {empresasLoja.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma empresa vinculada à loja do atendimento.
                </p>
              ) : empresaReadonly ? (
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
                  <Label>{ehNfe ? 'Empresa da operação' : 'Empresa compradora'} <span className="text-destructive">*</span></Label>
                  <Select value={empresaId} onValueChange={handleEmpresaChange}>
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

          {/* Card: NF-e de Compra (valor + observações da nota) */}
          {ehNfe && !nfeJaEmitida && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> NF-e de Compra
                </CardTitle>
                <Separator className="mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5 max-w-xs">
                  <Label>Valor da NF-e <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      className="pl-7"
                      inputMode="numeric"
                      value={nfeValor}
                      onChange={(e) => setNfeValor(formatCurrencyInput(e.target.value))}
                      placeholder="0,00"
                      disabled={nfe.pendente}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Valor que sai na nota. O compromisso financeiro registra sempre o repasse ao cliente ({brl(repasseCliente)}).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Observações na NF-e</Label>
                  <Textarea
                    rows={3}
                    value={obsNfe}
                    onChange={(e) => setObsNfe(e.target.value.toUpperCase())}
                    placeholder="INFORMAÇÕES COMPLEMENTARES QUE SAIRÃO NA NOTA..."
                    className="uppercase"
                    disabled={nfe.pendente}
                  />
                </div>
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
                  <InfoDisplay label="Telefone (comercial)" value={fmtTelefone(cli?.telefone_comercial)} />
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
                <p className="text-base font-bold text-primary">{brl(custosClienteTotal)}</p>
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

          {/* Card: Data do Contrato (só no fluxo de contrato editável) */}
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

          {/* Card: Observações (do contrato) — escondido na tela de emissão de NF-e */}
          {!ehNfe && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Observações
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              {soLeitura ? (
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
          )}

          {/* Ações — só quando todos os obrigatórios estão preenchidos */}
          {clienteId && !editandoCliente && (soLeitura || (cadastroCompleto && !!dataContrato)) && (
            <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
              {ehNfe ? (
                <>
                  {nfe.nfe?.status === 'processada' ? (
                    <div className="flex flex-wrap items-center gap-3 mr-auto text-sm">
                      <Badge className="bg-primary/10 text-primary gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> NF-e nº {nfe.nfe.numero || '-'} • série {nfe.nfe.serie || '-'}
                      </Badge>
                      {nfe.nfe.caminho_danfe && (
                        <a href={nfe.nfe.caminho_danfe} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> DANFE
                        </a>
                      )}
                    </div>
                  ) : nfe.pendente ? (
                    <div className="flex items-center gap-3 mr-auto">
                      <Badge variant="outline" className="gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…
                      </Badge>
                      <Button variant="ghost" size="sm" disabled={nfe.loading} onClick={nfe.consultar} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${nfe.loading ? 'animate-spin' : ''}`} /> Atualizar
                      </Button>
                    </div>
                  ) : nfe.erro ? (
                    <p className="mr-auto text-sm text-destructive flex items-start gap-1 max-w-md">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      {nfe.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                    </p>
                  ) : null}

                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  {nfe.nfe?.status !== 'processada' && !nfe.pendente && (
                    <Button
                      variant={podeEmitirNfe && !!empresaId && parseCurrencyInput(nfeValor) > 0 && !!valorQuitacao?.trim() ? 'default' : 'outline'}
                      onClick={() => nfe.emitir({ valor: parseCurrencyInput(nfeValor), observacoes: obsNfe.trim() || undefined, empresa_id: empresaId || undefined })}
                      disabled={!podeEmitirNfe || nfe.loading || !empresaId || parseCurrencyInput(nfeValor) <= 0 || !valorQuitacao?.trim()}
                      title={
                        !empresaId
                          ? 'Selecione a empresa emitente'
                          : parseCurrencyInput(nfeValor) <= 0
                            ? 'Informe o valor da NF-e'
                          : !valorQuitacao?.trim()
                            ? 'Valor de Quitação é obrigatório no contrato (informe 0 se não houver)'
                          : podeEmitirNfe
                            ? undefined
                            : 'Disponível após aprovação, contrato gerado e consulta realizada'
                      }
                      className="gap-1.5"
                    >
                      {nfe.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : nfe.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      {nfe.erro ? 'Tentar novamente' : 'Emitir NF-e'}
                    </Button>
                  )}
                </>
              ) : modoLeitura ? (
                <>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <Button variant="outline" onClick={handleBaixar} disabled={generating}>
                    <Download className="h-4 w-4 mr-1" /> Baixar
                  </Button>
                  <Button onClick={handleVisualizar} disabled={generating}>
                    <Eye className="h-4 w-4 mr-1" /> Visualizar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button onClick={handleGerar} disabled={generating}>
                    <Download className="h-4 w-4 mr-1" /> {generating ? 'Gerando...' : 'Gerar'}
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContratoCompraDialog;
