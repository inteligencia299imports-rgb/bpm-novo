import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileText, CalendarIcon, Save, Download, Percent } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoConsignacaoPdf } from '@/lib/generateContratoConsignacaoPdf';

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

const formatCep = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
  }
  return digits;
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

const ContratoConsignacaoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao }) => {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cep, setCep] = useState('');

  // Moto values
  const [valorQuitacao, setValorQuitacao] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');

  // Observations
  const [obsInternas, setObsInternas] = useState('');
  const [obsContrato, setObsContrato] = useState('');

  // Date
  const [dataContrato, setDataContrato] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  const moto = avaliacao?.moto || avaliacao?.motos_avaliacao;
  const atendimento = avaliacao?.atendimento || avaliacao?.atendimentos;

  useEffect(() => {
    if (!open || !avaliacao) return;
    const loadContrato = async () => {
      setLoading(true);
      const { data: contrato } = await supabase
        .from('contratos_consignacao')
        .select('*')
        .eq('avaliacao_id', avaliacao.id)
        .maybeSingle();

      if (contrato) {
        setContratoId(contrato.id);
        setCpfCnpj(contrato.cpf_cnpj || '');
        setEmail(contrato.email || '');
        setEndereco(contrato.endereco || '');
        setCep(contrato.cep || '');
        setValorQuitacao(contrato.valor_quitacao ? formatCurrencyInput(String(Math.round(contrato.valor_quitacao * 100))) : '');
        setValorFechamento(contrato.valor_fechamento ? formatCurrencyInput(String(Math.round(contrato.valor_fechamento * 100))) : '');
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataContrato(contrato.data_contrato ? new Date(contrato.data_contrato + 'T12:00:00') : undefined);
      } else {
        setContratoId(null);
        setCpfCnpj('');
        setEmail('');
        setEndereco('');
        setCep('');
        setValorQuitacao(avaliacao.valor_fechamento ? formatCurrencyInput(String(Math.round(avaliacao.valor_fechamento * 100))) : '');
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
    const payload: any = {
      avaliacao_id: avaliacao.id,
      cpf_cnpj: cpfCnpj || null,
      email: email || null,
      endereco: endereco || null,
      cep: cep || null,
      valor_quitacao: parseCurrencyInput(valorQuitacao) || null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      observacoes_internas: obsInternas || null,
      observacoes_contrato: obsContrato || null,
      data_contrato: dataContrato ? format(dataContrato, 'yyyy-MM-dd') : null,
    };

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

  const handleGerar = async (comPercentual?: number) => {
    setGenerating(true);
    const id = await saveContrato();
    if (!id) {
      setGenerating(false);
      return;
    }

    try {
      const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

      const formatCurrencyValue = (val: string) => {
        const num = parseCurrencyInput(val);
        return num ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
      };

      await generateContratoConsignacaoPdf({
        nomeCliente: atendimento?.nome_cliente || '',
        telefone: atendimento?.telefone || '',
        cpfCnpj: cpfCnpj || '-',
        email: email || '-',
        endereco: endereco || '-',
        cep: cep || '-',
        marca: moto?.marca || '',
        modelo: moto?.modelo || '',
        anoFabMod: ano || '-',
        placa: moto?.placa?.replace(/-/g, '') || '-',
        km: moto?.km || '-',
        valorQuitacao: formatCurrencyValue(valorQuitacao),
        valorNegociado: formatCurrencyValue(valorFechamento),
        observacoes: obsContrato || '',
        valorFechamento: formatCurrencyValue(valorFechamento),
        dataContrato: dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : '-',
        comPercentual5: !!comPercentual,
      });

      // Record in history
      if (user) {
        await supabase.from('status_history').insert({
          entity_type: 'consignacao',
          entity_id: avaliacao.id,
          status_from: avaliacao.consignacao_status || 'em_aberto',
          status_to: comPercentual ? 'contrato_consignacao_5' : 'contrato_consignacao',
          changed_by: user.id,
          changed_by_name: userName || 'Vendedor',
        });
      }

      toast.success(`Contrato de consignação ${comPercentual ? '(5%) ' : ''}gerado com sucesso!`);
    } catch (err) {
      console.error('Erro ao gerar contrato:', err);
      toast.error('Erro ao gerar o contrato');
    } finally {
      setGenerating(false);
    }
  };

  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Contrato de Consignação
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground px-6">Carregando...</div>
          ) : (
            <div className="space-y-8 pb-6 px-6">
              {/* DADOS DO CLIENTE */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Dados do Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <InfoDisplay label="Nome" value={atendimento?.nome_cliente} />
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">E-mail</label>
                    <Input
                      className="mt-1"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">CEP</label>
                    <Input
                      className="mt-1"
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => setCep(formatCep(e.target.value))}
                      maxLength={9}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Endereço</label>
                  <Input
                    className="mt-1"
                    placeholder="Rua, número, bairro, cidade - UF"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              {/* MOTO DO CLIENTE */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Moto do Cliente</h3>
                {moto && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="font-semibold text-foreground">{moto.marca} {(moto.modelo || '').toUpperCase()}</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {ano && <InfoDisplay label="Ano" value={ano} />}
                      {moto.cor && <InfoDisplay label="Cor" value={moto.cor} />}
                      {moto.placa && <InfoDisplay label="Placa" value={moto.placa?.replace(/-/g, '')} />}
                    </div>
                    {avaliacao.avaliacao_consignacao != null && (
                      <div className="grid grid-cols-3 gap-2 text-sm pt-2">
                        <InfoDisplay label="Aval. Consignação" value={formatCurrency(avaliacao.avaliacao_consignacao)} />
                        <InfoDisplay label="Custos Loja" value={formatCurrency(avaliacao.previsao_custos_loja)} />
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse Cliente</span>
                          <p className="text-sm font-bold text-primary">
                            {formatCurrency((avaliacao.avaliacao_consignacao ?? 0) - (avaliacao.previsao_custos_loja ?? 0))}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <CurrencyField label="Valor de Quitação" value={valorQuitacao} onChange={setValorQuitacao} />
                  <CurrencyField label="Valor de Fechamento" value={valorFechamento} onChange={setValorFechamento} />
                </div>
              </div>

              <Separator />

              {/* OBSERVAÇÕES */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Observações</h3>
                <div>
                  <label className="text-sm font-medium text-foreground">Observações Internas</label>
                  <Textarea className="mt-1" rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Observações do Contrato</label>
                  <Textarea className="mt-1" rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Data do Contrato</label>
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
        <div className="flex justify-end gap-2 p-4 border-t shrink-0">
          <Button variant="outline" onClick={() => handleGerar()} disabled={generating}>
            <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Gerar'}
          </Button>
          <Button variant="outline" onClick={() => handleGerar(5)} disabled={generating}>
            <Percent className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Gerar (5%)'}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md px-6">
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoConsignacaoDialog;
