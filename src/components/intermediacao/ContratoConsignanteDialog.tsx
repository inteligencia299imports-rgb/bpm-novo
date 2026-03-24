import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, CalendarIcon, Save, Download, Eye, Plus, Trash2, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoConsignantePdf } from '@/lib/generateContratoConsignantePdf';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
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

const formatTelefone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const CurrencyField = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <div>
    <label className="text-sm font-medium text-foreground">{label}</label>
    <div className="relative mt-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input className="pl-10" placeholder="0,00" value={value} onChange={(e) => onChange(formatCurrencyInput(e.target.value))} inputMode="numeric" disabled={disabled} />
    </div>
  </div>
);

interface CustoOperacional {
  id?: string;
  tipo: string;
  responsavel: string;
  descricao: string;
  valor: string;
}

const ContratoConsignanteDialog: React.FC<Props> = ({ open, onOpenChange, atendimentoId }) => {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);

  // Consignante data
  const [nomeConsignante, setNomeConsignante] = useState('');
  const [telefoneConsignante, setTelefoneConsignante] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dadosBancarios, setDadosBancarios] = useState('');
  const [titularConta, setTitularConta] = useState('');

  // Moto / financeiro from avaliacao
  const [motoInfo, setMotoInfo] = useState<any>(null);
  const [avaliacaoInfo, setAvaliacaoInfo] = useState<any>(null);
  const [custosOficina, setCustosOficina] = useState<any[]>([]);
  const [estoqueInfo, setEstoqueInfo] = useState<any>(null);

  // Values
  const [valorFechamento, setValorFechamento] = useState('');
  const [valorRepasse, setValorRepasse] = useState('');

  // Custos operacionais
  const [custosOp, setCustosOp] = useState<CustoOperacional[]>([]);
  const [newCustoTipo, setNewCustoTipo] = useState('Processo');
  const [newCustoResp, setNewCustoResp] = useState('Cliente');
  const [newCustoDesc, setNewCustoDesc] = useState('');
  const [newCustoValor, setNewCustoValor] = useState('');

  // Obs
  const [obsContrato, setObsContrato] = useState('');
  const [obsInternas, setObsInternas] = useState('');

  // Date
  const [dataContrato, setDataContrato] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, atendimentoId]);

  const loadData = async () => {
    setLoading(true);

    // Find the estoque item that is consignada and linked to this atendimento_id (as atendimento_venda_id)
    const { data: estoqueItems } = await supabase
      .from('estoque')
      .select('*')
      .eq('atendimento_venda_id', atendimentoId)
      .eq('tipo', 'consignada')
      .limit(1);

    const estoque = estoqueItems?.[0];
    setEstoqueInfo(estoque);

    let avaliacao: any = null;
    let moto: any = null;
    let oficinaCosts: any[] = [];
    let consignanteAtendimento: any = null;

    if (estoque?.avaliacao_id) {
      const [{ data: avalData }, { data: custosData }] = await Promise.all([
        supabase.from('avaliacoes').select('*, motos_avaliacao:moto_avaliacao_id(*)').eq('id', estoque.avaliacao_id).maybeSingle(),
        supabase.from('custos_oficina').select('*').eq('avaliacao_id', estoque.avaliacao_id),
      ]);
      avaliacao = avalData;
      moto = avalData?.motos_avaliacao;
      oficinaCosts = custosData || [];

      // Fetch the original consignante's atendimento (the person who left the moto)
      if (avalData?.atendimento_id) {
        const { data: origAtend } = await supabase
          .from('atendimentos')
          .select('nome_cliente, telefone')
          .eq('id', avalData.atendimento_id)
          .maybeSingle();
        consignanteAtendimento = origAtend;
      }
    }

    setAvaliacaoInfo(avaliacao);
    setMotoInfo(moto);
    setCustosOficina(oficinaCosts);

    // Load existing contrato_consignante
    const [{ data: contrato }, { data: histGerado }] = await Promise.all([
      supabase.from('contratos_consignante').select('*').eq('atendimento_id', atendimentoId).maybeSingle(),
      supabase.from('status_history').select('id').eq('entity_type', 'contrato_consignante').eq('entity_id', atendimentoId).like('status_to', 'CONTRATO GERADO%').limit(1),
    ]);

    setJaGerado(!!(histGerado && histGerado.length > 0));

    if (contrato) {
      setContratoId(contrato.id);
      setNomeConsignante(contrato.nome_consignante || '');
      setTelefoneConsignante(formatTelefone(contrato.telefone_consignante || ''));
      setCpfCnpj(formatCpfCnpj(contrato.cpf_cnpj || ''));
      setDadosBancarios(contrato.dados_bancarios || '');
      setTitularConta(contrato.titular_conta || '');
      setValorFechamento(contrato.valor_fechamento ? formatCurrencyInput(String(Math.round(contrato.valor_fechamento * 100))) : '');
      setValorRepasse(contrato.valor_repasse ? formatCurrencyInput(String(Math.round(contrato.valor_repasse * 100))) : '');
      setObsContrato(contrato.observacoes_contrato || '');
      setObsInternas(contrato.observacoes_internas || '');
      setDataContrato(contrato.data_contrato ? new Date(contrato.data_contrato + 'T12:00:00') : undefined);

      // Load custos operacionais
      const { data: custosOpData } = await supabase.from('custos_operacionais').select('*').eq('contrato_consignante_id', contrato.id).order('created_at');
      setCustosOp((custosOpData || []).map((c: any) => ({
        id: c.id,
        tipo: c.tipo,
        responsavel: c.responsavel,
        descricao: c.descricao || '',
        valor: c.valor ? formatCurrencyInput(String(Math.round(c.valor * 100))) : '',
      })));
    } else {
      setContratoId(null);
      // Pre-fill consignante data from the original atendimento + contrato_consignacao
      setNomeConsignante(consignanteAtendimento?.nome_cliente || '');
      setTelefoneConsignante(formatTelefone(consignanteAtendimento?.telefone || ''));

      if (estoque?.avaliacao_id) {
        const { data: cc } = await supabase.from('contratos_consignacao').select('*').eq('avaliacao_id', estoque.avaliacao_id).maybeSingle();
        if (cc) {
          setCpfCnpj(formatCpfCnpj(cc.cpf_cnpj || ''));
        } else {
          setCpfCnpj('');
        }
      } else {
        setCpfCnpj('');
      }

      // Pre-fill valor_fechamento from avaliacao
      if (avaliacao?.valor_fechamento) {
        setValorFechamento(formatCurrencyInput(String(Math.round(avaliacao.valor_fechamento * 100))));
      } else {
        setValorFechamento('');
      }
      setDadosBancarios('');
      setTitularConta('');
      setValorRepasse('');
      setObsContrato('');
      setObsInternas('');
      setDataContrato(undefined);
      setCustosOp([]);
    }

    setLoading(false);
  };

  // Calculate abatimentos: custos oficina (all) + custos operacionais where responsavel = 'Loja'
  const calcAbatimentos = () => {
    const oficTotal = custosOficina.reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0);
    const opLojaTotal = custosOp
      .filter(c => c.responsavel === 'Loja')
      .reduce((sum, c) => sum + parseCurrencyInput(c.valor), 0);
    return oficTotal + opLojaTotal;
  };

  // Auto-calculate repasse
  useEffect(() => {
    const vf = parseCurrencyInput(valorFechamento);
    const abat = calcAbatimentos();
    const repasse = vf - abat;
    setValorRepasse(repasse > 0 ? formatCurrencyInput(String(Math.round(repasse * 100))) : '0,00');
  }, [valorFechamento, custosOp, custosOficina]);

  const addCustoOp = async () => {
    if (!newCustoValor || parseCurrencyInput(newCustoValor) <= 0) {
      toast.error('Informe o valor do custo');
      return;
    }

    const newItem: CustoOperacional = {
      tipo: newCustoTipo,
      responsavel: newCustoResp,
      descricao: newCustoDesc,
      valor: newCustoValor,
    };

    // If contract already saved, insert directly
    if (contratoId) {
      const { data, error } = await supabase.from('custos_operacionais').insert({
        contrato_consignante_id: contratoId,
        tipo: newCustoTipo,
        responsavel: newCustoResp,
        descricao: newCustoDesc || null,
        valor: parseCurrencyInput(newCustoValor),
      } as any).select().single();
      if (error) { toast.error('Erro ao adicionar custo'); return; }
      newItem.id = data.id;
    }

    setCustosOp(prev => [...prev, newItem]);
    setNewCustoTipo('Processo');
    setNewCustoResp('Cliente');
    setNewCustoDesc('');
    setNewCustoValor('');

    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  const removeCustoOp = async (idx: number) => {
    const item = custosOp[idx];
    if (item.id) {
      await supabase.from('custos_operacionais').delete().eq('id', item.id);
    }
    setCustosOp(prev => prev.filter((_, i) => i !== idx));
  };

  const saveContrato = async (): Promise<string | null> => {
    setSaving(true);
    const payload: any = {
      atendimento_id: atendimentoId,
      nome_consignante: nomeConsignante || null,
      telefone_consignante: telefoneConsignante || null,
      cpf_cnpj: cpfCnpj || null,
      dados_bancarios: dadosBancarios || null,
      titular_conta: titularConta || null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      valor_repasse: parseCurrencyInput(valorRepasse) || null,
      observacoes_contrato: obsContrato || null,
      observacoes_internas: obsInternas || null,
      data_contrato: dataContrato ? format(dataContrato, 'yyyy-MM-dd') : null,
    };

    let id = contratoId;
    if (id) {
      const { error } = await supabase.from('contratos_consignante').update(payload).eq('id', id);
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return null; }
    } else {
      const { data, error } = await supabase.from('contratos_consignante').insert(payload).select().single();
      if (error) { toast.error('Erro ao criar'); setSaving(false); return null; }
      id = data.id;
      setContratoId(data.id);

      // Save custos operacionais that were added before first save
      if (custosOp.length > 0) {
        const rows = custosOp.map(c => ({
          contrato_consignante_id: data.id,
          tipo: c.tipo,
          responsavel: c.responsavel,
          descricao: c.descricao || null,
          valor: parseCurrencyInput(c.valor),
        }));
        const { data: inserted } = await supabase.from('custos_operacionais').insert(rows as any).select();
        if (inserted) {
          setCustosOp(prev => prev.map((c, i) => ({ ...c, id: inserted[i]?.id })));
        }
      }
    }

    setSaving(false);
    return id;
  };

  const handleSave = async () => {
    const id = await saveContrato();
    if (id) {
      toast.success('Contrato salvo com sucesso!');
      onOpenChange(false);
    }
  };

  const buildPdfData = () => {
    const abat = calcAbatimentos();
    const repasse = parseCurrencyInput(valorFechamento) - abat;
    return {
      nomeConsignante: nomeConsignante || '-',
      telefoneConsignante: telefoneConsignante || '-',
      cpfCnpj: cpfCnpj || '-',
      dadosBancarios: dadosBancarios || '-',
      titularConta: titularConta || '-',
      marcaMoto: motoInfo?.marca || estoqueInfo?.marca || '-',
      modeloMoto: motoInfo?.modelo || estoqueInfo?.modelo || '-',
      placaMoto: (motoInfo?.placa || estoqueInfo?.placa || '-').replace(/-/g, ''),
      valorFechamento: formatCurrency(parseCurrencyInput(valorFechamento)),
      totalAbatimentos: formatCurrency(abat),
      valorRepasse: formatCurrency(repasse > 0 ? repasse : 0),
      custosOperacionais: custosOp.map(c => ({
        tipo: c.tipo,
        responsavel: c.responsavel,
        descricao: c.descricao,
        valor: formatCurrency(parseCurrencyInput(c.valor)),
      })),
      custosOficina: custosOficina.map((c: any) => ({
        tipo: c.tipo,
        responsavel: c.responsavel,
        detalhes: c.detalhes || '',
        valor: formatCurrency(c.valor_executado || c.valor_previsto || 0),
      })),
      observacoesContrato: obsContrato || '',
      observacoesInternas: '',
      dataContrato: dataContrato ? format(dataContrato, 'dd/MM/yyyy', { locale: ptBR }) : '-',
    };
  };

  const handleGerar = async () => {
    if (!nomeConsignante?.trim()) { toast.error('Nome do consignante é obrigatório'); return; }
    if (!dataContrato) { toast.error('Data do contrato é obrigatória'); return; }

    setGenerating(true);
    const id = await saveContrato();
    if (!id) { setGenerating(false); return; }

    try {
      await generateContratoConsignantePdf(buildPdfData());

      if (user) {
        await supabase.from('status_history').insert({
          entity_type: 'contrato_consignante',
          entity_id: atendimentoId,
          status_from: 'em_aberto',
          status_to: 'CONTRATO GERADO',
          changed_by: user.id,
          changed_by_name: userName || 'Vendedor',
        });
      }
      setJaGerado(true);
      toast.success('Contrato gerado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleVisualizar = async () => {
    setGenerating(true);
    try {
      await generateContratoConsignantePdf(buildPdfData());
      toast.success('PDF visualizado!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao visualizar');
    } finally {
      setGenerating(false);
    }
  };

  const abatimentos = calcAbatimentos();
  const repasseNum = parseCurrencyInput(valorFechamento) - abatimentos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Pagamento ao Consignante
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto" ref={listRef}>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground px-6">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-6 pb-6 px-6 pt-2">
              {/* DADOS DO CONSIGNANTE */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Dados do Consignante</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Nome</label>
                    <Input className="mt-1" value={nomeConsignante} onChange={e => setNomeConsignante(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Telefone</label>
                    <Input className="mt-1" value={telefoneConsignante} onChange={e => setTelefoneConsignante(formatTelefone(e.target.value))} maxLength={15} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">CPF/CNPJ</label>
                    <Input className="mt-1" value={cpfCnpj} onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))} maxLength={18} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Titular da Conta</label>
                    <Input className="mt-1" value={titularConta} onChange={e => setTitularConta(e.target.value)} placeholder="Nome do titular" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Dados Bancários</label>
                  <Textarea className="mt-1" rows={2} value={dadosBancarios} onChange={e => setDadosBancarios(e.target.value)} placeholder="Banco, Agência, Conta, Tipo (Corrente/Poupança), PIX..." />
                </div>
              </div>

              <Separator />

              {/* DADOS DA MOTO + NEGOCIAÇÃO */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Moto e Negociação</h3>
                {(motoInfo || estoqueInfo) && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="font-semibold text-foreground">
                      {(motoInfo?.marca || estoqueInfo?.marca)} {(motoInfo?.modelo || estoqueInfo?.modelo || '').toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Placa: {(motoInfo?.placa || estoqueInfo?.placa || '-').replace(/-/g, '')}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <CurrencyField label="Valor de Fechamento" value={valorFechamento} onChange={setValorFechamento} />
                  <div>
                    <label className="text-sm font-medium">Abatimentos (Oficina + Op. loja)</label>
                    <div className="mt-1 h-10 flex items-center px-3 rounded-md border bg-muted/50 text-sm font-semibold text-destructive">
                      {formatCurrency(abatimentos)}
                    </div>
                  </div>
                </div>
                {/* Detalhamento dos abatimentos */}
                {abatimentos > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhamento dos Abatimentos</span>
                    <div className="space-y-1">
                      {custosOficina.map((c: any) => {
                        const val = c.valor_executado || c.valor_previsto || 0;
                        if (val <= 0) return null;
                        return (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              <span className="inline-block rounded bg-primary/10 text-primary px-1.5 py-0.5 font-medium mr-1.5">Oficina</span>
                              {c.tipo?.toUpperCase()}{c.detalhes ? ` - ${c.detalhes.toUpperCase()}` : ''}
                            </span>
                            <span className="font-semibold text-destructive">{formatCurrency(val)}</span>
                          </div>
                        );
                      })}
                      {custosOp
                        .filter(c => c.responsavel === 'Loja')
                        .map((c, i) => {
                          const val = parseCurrencyInput(c.valor);
                          if (val <= 0) return null;
                          return (
                            <div key={`op-${i}`} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                <span className="inline-block rounded bg-orange-100 text-orange-700 px-1.5 py-0.5 font-medium mr-1.5">Op. Loja</span>
                                {c.tipo}{c.descricao ? ` - ${c.descricao}` : ''}
                              </span>
                              <span className="font-semibold text-destructive">{formatCurrency(val)}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Valor de Repasse</span>
                  <span className={`text-lg font-bold ${repasseNum >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(repasseNum > 0 ? repasseNum : 0)}
                  </span>
                </div>
              </div>

              <Separator />

              {/* CUSTOS OPERACIONAIS */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Custos Operacionais</h3>
                <div className="grid grid-cols-[1fr_1fr_2fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs font-medium">Tipo</label>
                    <Select value={newCustoTipo} onValueChange={setNewCustoTipo}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Processo">Processo</SelectItem>
                        <SelectItem value="Agregado">Agregado</SelectItem>
                        <SelectItem value="Devolução">Devolução</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Responsável</label>
                    <Select value={newCustoResp} onValueChange={setNewCustoResp}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Loja">Loja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Descrição</label>
                    <Input className="mt-1 h-9" value={newCustoDesc} onChange={e => setNewCustoDesc(e.target.value)} placeholder="Descrição" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Valor</label>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input className="pl-7 h-9" value={newCustoValor} onChange={e => setNewCustoValor(formatCurrencyInput(e.target.value))} inputMode="numeric" placeholder="0,00" />
                    </div>
                  </div>
                  <Button size="sm" className="h-9" onClick={addCustoOp}><Plus className="h-4 w-4" /></Button>
                </div>

                {custosOp.length > 0 && (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {custosOp.map((c, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                        <span className="font-medium text-xs bg-muted px-2 py-0.5 rounded">{c.tipo}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${c.responsavel === 'Loja' ? 'border-destructive/30 text-destructive' : 'border-border text-muted-foreground'}`}>
                          {c.responsavel}
                        </span>
                        <span className="flex-1 truncate text-xs">{c.descricao || '-'}</span>
                        <span className="font-semibold text-sm whitespace-nowrap">R$ {c.valor}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCustoOp(idx)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* OBSERVAÇÕES */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Observações</h3>
                <div>
                  <label className="text-sm font-medium">Observações do Contrato</label>
                  <Textarea className="mt-1" rows={3} value={obsContrato} onChange={e => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
                </div>
                <div>
                  <label className="text-sm font-medium">Observações Internas</label>
                  <Textarea className="mt-1" rows={3} value={obsInternas} onChange={e => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                </div>
                <div>
                  <label className="text-sm font-medium">Data do Contrato</label>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !dataContrato && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dataContrato} onSelect={setDataContrato} initialFocus className="p-3 pointer-events-auto" />
                      <div className="border-t p-2 flex justify-end">
                        <Button size="sm" disabled={!dataContrato} onClick={() => setCalOpen(false)}>OK</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col gap-2 p-4 border-t shrink-0">
          {jaGerado && (
            <div className="flex justify-center">
              <Button variant="outline" className="min-w-[140px]" onClick={handleVisualizar} disabled={generating}>
                <Eye className="h-4 w-4 mr-1" /> Visualizar
              </Button>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="outline" className="min-w-[140px]" onClick={handleGerar} disabled={generating}>
              <Download className="h-4 w-4 mr-1" /> {generating ? 'Gerando...' : 'Gerar'}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
              <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoConsignanteDialog;
