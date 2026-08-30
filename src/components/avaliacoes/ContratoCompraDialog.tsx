import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto } from '@/lib/clienteCadastro';
import { FileText, CalendarIcon, Save, Download, Eye, ArrowLeft, User, Bike, MessageSquare, Pencil, MapPin, Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoCompraPdf } from '@/lib/generateContratoCompraPdf';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: any;
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

const InfoDisplay = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  ) : null
);

const ContratoCompraDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao }) => {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);

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
        supabase.from('atendimentos_motos').select('cliente_id, cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))').eq('id', atendimentoId).maybeSingle(),
        supabase.from('custos_oficina').select('responsavel, valor_previsto, valor_executado').eq('avaliacao_id', avaliacao.id),
      ]);

      setCustosCliente(
        (custosData || [])
          .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
          .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0),
      );
      setJaGerado(!!(histGerado && histGerado.length > 0));
      setClienteId((atFresh as any)?.cliente_id ?? null);
      setClienteRecord((atFresh as any)?.cliente ?? null);

      const contrato = contratosList && contratosList.length > 0 ? contratosList[0] : null;
      const atFreshCpf = (atFresh as any)?.cliente?.cpf_cnpj;

      const quitacaoAval = (avaliacao as any).valor_quitacao;

      if (contrato) {
        setContratoId(contrato.id);
        setCpfCnpj(contrato.cpf_cnpj || atFreshCpf || '');
        setValorQuitacao((contrato.valor_quitacao ?? quitacaoAval) != null ? formatCurrencyInput(String(Math.round((contrato.valor_quitacao ?? quitacaoAval) * 100))) : '');
        setValorFechamento(contrato.valor_fechamento ? formatCurrencyInput(String(Math.round(contrato.valor_fechamento * 100))) : '');
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataContrato(contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined);
      } else {
        setContratoId(null);
        setCpfCnpj(atFreshCpf || '');
        setValorQuitacao(quitacaoAval != null ? formatCurrencyInput(String(Math.round(quitacaoAval * 100))) : '');
        setValorFechamento(avaliacao.valor_fechamento ? formatCurrencyInput(String(Math.round(avaliacao.valor_fechamento * 100))) : '');
        setObsInternas('');
        setObsContrato('');
        setDataContrato(undefined);
      }
      setLoading(false);
    };
    loadContrato();
  }, [open, avaliacao?.id]);

  const saveContrato = async (): Promise<string | null> => {
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

  const validateFields = (): boolean => {
    if (!cpfCnpj?.trim()) { toast.error('CPF/CNPJ é obrigatório'); return false; }
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

    return {
      loja: atendimento?.loja || null,
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
      abatimentos: fmtNum(custosCliente),
      repasseCliente: fmtNum(fechNum - custosCliente - quitNum),
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
      toast.success('Contrato de compra gerado com sucesso!');
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
      const id = await saveContrato();
      if (!id) { setGenerating(false); return; }
      await generateContratoCompraPdf(buildPdfData(), 'view');
      toast.success('PDF visualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao visualizar contrato:', err);
      toast.error('Erro ao visualizar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleClienteSaved = async (savedId: string) => {
    setClienteId(savedId);
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
  const repasseCliente = fechamentoNum - custosCliente - quitacaoNum;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Contrato de Compra
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Card: Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
                {clienteId && cadastroCompleto && !editandoCliente && (
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
              ) : cadastroCompleto && !editandoCliente ? (
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
                <p className="text-base font-bold text-primary">{brl(custosCliente)}</p>
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

          {/* Card: Data do Contrato */}
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

          {/* Card: Observações */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Observações
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Observações Internas</Label>
                <Textarea rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
              </div>
              <div className="space-y-1.5">
                <Label>Observações do Contrato</Label>
                <Textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
              </div>
            </CardContent>
          </Card>

          {/* Ações — só quando todos os obrigatórios estão preenchidos */}
          {clienteId && cadastroCompleto && !editandoCliente && !!dataContrato && (
            <div className="flex flex-wrap gap-3 justify-end pt-2">
              {jaGerado && (
                <Button variant="outline" onClick={handleVisualizar} disabled={generating}>
                  <Eye className="h-4 w-4 mr-1" /> Visualizar
                </Button>
              )}
              <Button variant="outline" onClick={handleGerar} disabled={generating}>
                <Download className="h-4 w-4 mr-1" /> {generating ? 'Gerando...' : 'Gerar'}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContratoCompraDialog;
