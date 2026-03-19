import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileText, CalendarIcon, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Atendimento, MotoInteresse, MotoAvaliacao } from '@/types/crm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento: Atendimento;
  motosInteresse: MotoInteresse[];
  motosAvaliacao: MotoAvaliacao[];
  estoqueData: Record<string, any>;
  avaliacoes: Record<string, any>;
}

const FINANCEIRAS = ['Santander', 'Bradesco', 'Safra', 'BV', 'Pan', 'Omni', 'Volkswagen', 'C6 Bank', 'Próprio (299)'];
const TIPOS_PAGAMENTO = [
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'consorcio', label: 'Consórcio' },
  { value: 'ted_doc_pix', label: 'Ted/Doc/Pix' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'outros', label: 'Outros' },
];

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

const CurrencyField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
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

const InfoDisplay = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  ) : null
);

interface FormaPagamento {
  id?: string;
  tipo: string;
  valor_total: number | null;
  valor_entrada: number | null;
  financeira: string | null;
  numero_parcelas: number | null;
  valor_parcelas: number | null;
  valor_financiado: number | null;
}

const ContratoDialog: React.FC<Props> = ({
  open, onOpenChange, atendimento, motosInteresse, motosAvaliacao, estoqueData, avaliacoes,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');

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

  // Formas de pagamento
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [novaPagamentoTipo, setNovaPagamentoTipo] = useState('');
  // Financiamento fields
  const [finValorEntrada, setFinValorEntrada] = useState('');
  const [finFinanceira, setFinFinanceira] = useState('');
  const [finParcelas, setFinParcelas] = useState('');
  const [finValorParcelas, setFinValorParcelas] = useState('');
  const [finValorFinanciado, setFinValorFinanciado] = useState('');
  // Other payment valor
  const [outroValor, setOutroValor] = useState('');

  const hasTroca = atendimento.interesse === 'trocar' && motosAvaliacao.length > 0;

  // Load existing contract data
  useEffect(() => {
    if (!open) return;
    const loadContrato = async () => {
      setLoading(true);
      const { data: contrato } = await supabase
        .from('contratos')
        .select('*')
        .eq('atendimento_id', atendimento.id)
        .maybeSingle();

      if (contrato) {
        setContratoId(contrato.id);
        setCpfCnpj(contrato.cpf_cnpj || '');
        setIpvaTipo(contrato.ipva_tipo || '');
        setIpvaCotas(contrato.ipva_cotas ? String(contrato.ipva_cotas) : '');
        setIpvaValor(contrato.ipva_valor ? formatCurrencyInput(String(Math.round(contrato.ipva_valor * 100))) : '');
        setTransferenciaTipo(contrato.transferencia_tipo || '');
        setTransferenciaValor(contrato.transferencia_valor ? formatCurrencyInput(String(Math.round(contrato.transferencia_valor * 100))) : '');
        setValorQuitacao(contrato.valor_quitacao ? formatCurrencyInput(String(Math.round(contrato.valor_quitacao * 100))) : '');
        setValorFechamento(contrato.valor_fechamento ? formatCurrencyInput(String(Math.round(contrato.valor_fechamento * 100))) : '');
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataSinal(contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined);
        setDataVencimento(contrato.data_vencimento_sinal ? new Date(contrato.data_vencimento_sinal + 'T12:00:00') : undefined);

        // Load formas de pagamento
        const { data: formas } = await supabase
          .from('formas_pagamento')
          .select('*')
          .eq('contrato_id', contrato.id)
          .order('created_at', { ascending: true });
        if (formas) {
          setFormasPagamento(formas.map((f: any) => ({
            id: f.id,
            tipo: f.tipo,
            valor_total: f.valor_total,
            valor_entrada: f.valor_entrada,
            financeira: f.financeira,
            numero_parcelas: f.numero_parcelas,
            valor_parcelas: f.valor_parcelas,
            valor_financiado: f.valor_financiado,
          })));
        }
      } else {
        // Reset
        setContratoId(null);
        setCpfCnpj('');
        setIpvaTipo('');
        setIpvaCotas('');
        setIpvaValor('');
        setTransferenciaTipo('');
        setTransferenciaValor('');
        setValorQuitacao('');
        setValorFechamento('');
        setObsInternas('');
        setObsContrato('');
        setDataSinal(undefined);
        setDataVencimento(undefined);
        setFormasPagamento([]);
      }
      setLoading(false);
    };
    loadContrato();
  }, [open, atendimento.id]);

  const resetPagamentoForm = () => {
    setNovaPagamentoTipo('');
    setFinValorEntrada('');
    setFinFinanceira('');
    setFinParcelas('');
    setFinValorParcelas('');
    setFinValorFinanciado('');
    setOutroValor('');
  };

  const handleAddPagamento = async () => {
    if (!novaPagamentoTipo) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    // Ensure contrato exists first
    let cId = contratoId;
    if (!cId) {
      cId = await saveContrato();
      if (!cId) return;
    }

    const newForma: any = {
      contrato_id: cId,
      tipo: novaPagamentoTipo,
    };

    if (novaPagamentoTipo === 'financiamento') {
      newForma.valor_entrada = parseCurrencyInput(finValorEntrada) || null;
      newForma.financeira = finFinanceira || null;
      newForma.numero_parcelas = finParcelas ? parseInt(finParcelas) : null;
      newForma.valor_parcelas = parseCurrencyInput(finValorParcelas) || null;
      newForma.valor_financiado = parseCurrencyInput(finValorFinanciado) || null;
    } else {
      newForma.valor_total = parseCurrencyInput(outroValor) || null;
    }

    const { data, error } = await supabase.from('formas_pagamento').insert(newForma).select().single();
    if (error) {
      toast.error('Erro ao adicionar forma de pagamento');
      return;
    }
    setFormasPagamento(prev => [...prev, {
      id: data.id,
      tipo: data.tipo,
      valor_total: data.valor_total,
      valor_entrada: data.valor_entrada,
      financeira: data.financeira,
      numero_parcelas: data.numero_parcelas,
      valor_parcelas: data.valor_parcelas,
      valor_financiado: data.valor_financiado,
    }]);
    resetPagamentoForm();
    toast.success('Forma de pagamento adicionada');
  };

  const handleRemovePagamento = async (id: string) => {
    await supabase.from('formas_pagamento').delete().eq('id', id);
    setFormasPagamento(prev => prev.filter(f => f.id !== id));
    toast.success('Forma de pagamento removida');
  };

  const saveContrato = async (): Promise<string | null> => {
    setSaving(true);
    const payload: any = {
      atendimento_id: atendimento.id,
      cpf_cnpj: cpfCnpj || null,
      ipva_tipo: ipvaTipo || null,
      ipva_cotas: ipvaTipo === 'ambos' && ipvaCotas ? parseInt(ipvaCotas) : null,
      ipva_valor: ipvaTipo === 'loja' ? parseCurrencyInput(ipvaValor) || null : null,
      transferencia_tipo: transferenciaTipo || null,
      transferencia_valor: ['cliente', 'loja', 'ambos'].includes(transferenciaTipo) ? parseCurrencyInput(transferenciaValor) || null : null,
      valor_quitacao: parseCurrencyInput(valorQuitacao) || null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      observacoes_internas: obsInternas || null,
      observacoes_contrato: obsContrato || null,
      data_sinal: dataSinal ? format(dataSinal, 'yyyy-MM-dd') : null,
      data_vencimento_sinal: dataVencimento ? format(dataVencimento, 'yyyy-MM-dd') : null,
    };

    if (contratoId) {
      const { error } = await supabase.from('contratos').update(payload).eq('id', contratoId);
      if (error) {
        toast.error('Erro ao salvar contrato');
        setSaving(false);
        return null;
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
    if (id) toast.success('Contrato salvo com sucesso!');
  };

  const tipoLabel = (tipo: string) => TIPOS_PAGAMENTO.find(t => t.value === tipo)?.label || tipo;

  // Get moto de interesse data
  const motoInt = motosInteresse[0];
  const estItem = motoInt?.origem === 'estoque' && motoInt?.estoque_moto_id ? estoqueData[motoInt.estoque_moto_id] : null;

  // Get moto do cliente data
  const motoAv = motosAvaliacao[0];
  const avaliacaoData = motoAv ? avaliacoes[motoAv.id] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Emissão de Contrato
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] px-6">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : (
            <div className="space-y-6 pb-6">
              {/* DADOS DO CLIENTE */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dados do Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <InfoDisplay label="Nome" value={atendimento.nome_cliente} />
                  <InfoDisplay label="Telefone" value={formatPhone(atendimento.telefone)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">CPF/CNPJ</label>
                  <Input
                    className="mt-1"
                    placeholder="000.000.000-00"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                    maxLength={18}
                  />
                </div>
              </div>

              <Separator />

              {/* MOTO DE INTERESSE */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Moto de Interesse</h3>
                {estItem ? (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="font-semibold text-foreground">{estItem.marca} {estItem.modelo}</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <InfoDisplay label="Ano" value={[estItem.ano_fabricacao, estItem.ano_modelo].filter(Boolean).join('/')} />
                      <InfoDisplay label="Cor" value={estItem.cor} />
                      <InfoDisplay label="Placa" value={estItem.placa} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <InfoDisplay label="Preço" value={formatCurrency(estItem.preco)} />
                      <InfoDisplay label="Preço Ação" value={formatCurrency(estItem.preco_acao)} />
                    </div>
                  </div>
                ) : motoInt ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="font-semibold text-foreground">{motoInt.marca} {motoInt.modelo}</p>
                    <p className="text-xs text-muted-foreground">{motoInt.ano}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma moto de interesse</p>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <InfoDisplay label="Valor do Sinal" value={formatCurrency((atendimento as any).valor_sinal ?? null)} />
                  <InfoDisplay label="Valor da Venda" value={formatCurrency((atendimento as any).valor_venda ?? null)} />
                </div>

                {/* IPVA */}
                <div>
                  <label className="text-sm font-medium text-foreground">IPVA</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {['ambos', 'cliente', 'loja'].map(opt => (
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
                      <label className="text-sm text-muted-foreground">Número de cotas</label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={ipvaCotas}
                        onChange={(e) => setIpvaCotas(e.target.value)}
                        placeholder="Ex: 3"
                      />
                    </div>
                  )}
                  {ipvaTipo === 'loja' && (
                    <div className="mt-2">
                      <CurrencyField label="Valor do IPVA" value={ipvaValor} onChange={setIpvaValor} />
                    </div>
                  )}
                </div>

                {/* Transferência */}
                <div>
                  <label className="text-sm font-medium text-foreground">Transferência</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {['cliente', 'loja', 'outra_uf', 'ambos'].map(opt => (
                      <Button
                        key={opt}
                        size="sm"
                        variant={transferenciaTipo === opt ? 'default' : 'outline'}
                        onClick={() => setTransferenciaTipo(opt)}
                      >
                        {opt === 'cliente' ? 'Cliente' : opt === 'loja' ? 'Loja' : opt === 'outra_uf' ? 'Outra UF' : 'Ambos'}
                      </Button>
                    ))}
                  </div>
                  {['cliente', 'loja', 'ambos'].includes(transferenciaTipo) && (
                    <div className="mt-2">
                      <CurrencyField label="Valor da Transferência" value={transferenciaValor} onChange={setTransferenciaValor} />
                    </div>
                  )}
                </div>
              </div>

              {/* MOTO DO CLIENTE (Em casos de troca) */}
              {hasTroca && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Moto do Cliente</h3>
                    {motoAv && (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <p className="font-semibold text-foreground">{motoAv.marca} {motoAv.modelo}</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <InfoDisplay label="Ano" value={[motoAv.ano_fabricacao, motoAv.ano_modelo].filter(Boolean).join('/')} />
                          <InfoDisplay label="Cor" value={motoAv.cor} />
                          <InfoDisplay label="Placa" value={motoAv.placa} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <CurrencyField label="Valor de Quitação" value={valorQuitacao} onChange={setValorQuitacao} />
                      <CurrencyField label="Valor de Fechamento" value={valorFechamento} onChange={setValorFechamento} />
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* NEGOCIAÇÃO */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Negociação</h3>

                {/* Lista de formas já adicionadas */}
                {formasPagamento.length > 0 && (
                  <div className="space-y-2">
                    {formasPagamento.map((fp) => (
                      <div key={fp.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{tipoLabel(fp.tipo)}</Badge>
                            {fp.financeira && <span className="text-xs text-muted-foreground">{fp.financeira}</span>}
                          </div>
                          {fp.tipo === 'financiamento' ? (
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
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => fp.id && handleRemovePagamento(fp.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar nova forma */}
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Adicionar Forma de Pagamento</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {TIPOS_PAGAMENTO.map(tp => (
                      <Button
                        key={tp.value}
                        size="sm"
                        variant={novaPagamentoTipo === tp.value ? 'default' : 'outline'}
                        onClick={() => { setNovaPagamentoTipo(tp.value); setOutroValor(''); setFinValorEntrada(''); setFinFinanceira(''); setFinParcelas(''); setFinValorParcelas(''); setFinValorFinanciado(''); }}
                        className="text-xs"
                      >
                        {tp.label}
                      </Button>
                    ))}
                  </div>

                  {novaPagamentoTipo === 'financiamento' && (
                    <div className="space-y-3">
                      <CurrencyField label="Valor de Entrada" value={finValorEntrada} onChange={setFinValorEntrada} />
                      <div>
                        <label className="text-sm font-medium text-foreground">Financeira</label>
                        <Select value={finFinanceira} onValueChange={setFinFinanceira}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {FINANCEIRAS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
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

                  {novaPagamentoTipo && novaPagamentoTipo !== 'financiamento' && (
                    <CurrencyField label="Valor Total" value={outroValor} onChange={setOutroValor} />
                  )}

                  {novaPagamentoTipo && (
                    <Button size="sm" onClick={handleAddPagamento} className="w-full">
                      Adicionar
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* OBSERVAÇÕES */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Observações</h3>
                <div>
                  <label className="text-sm font-medium text-foreground">Observações Internas</label>
                  <Textarea className="mt-1" rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Observações do Contrato</label>
                  <Textarea className="mt-1" rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Data do Sinal</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !dataSinal && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataSinal ? format(dataSinal, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dataSinal} onSelect={setDataSinal} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Data Vencimento do Sinal</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !dataVencimento && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataVencimento ? format(dataVencimento, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dataVencimento} onSelect={setDataVencimento} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Bottom buttons */}
        <div className="flex justify-end gap-2 p-6 pt-0 border-t mt-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant="outline" disabled>Gerar</Button>
          <Button variant="outline" disabled>Visualizar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoDialog;
