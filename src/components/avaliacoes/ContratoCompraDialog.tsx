import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileText, CalendarIcon, Save, Download, Eye } from 'lucide-react';
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

const ContratoCompraDialog: React.FC<Props> = ({ open, onOpenChange, avaliacao }) => {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);

  // Client data
  const [cpfCnpj, setCpfCnpj] = useState('');

  // Values
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
      const atendimentoId = atendimento?.id;
      if (!atendimentoId) {
        setLoading(false);
        return;
      }
      // Buscar contratos vinculados ao atendimento (pode haver de venda também),
      // pegamos o que tem observação 'CONTRATO_COMPRA' nas observacoes_internas marker,
      // ou criamos um novo. Para diferenciar do contrato de venda, usamos um marcador na coluna ipva_tipo='COMPRA'.
      const [{ data: contratosList }, { data: histGerado }, { data: atFresh }] = await Promise.all([
        supabase
          .from('contratos')
          .select('*')
          .eq('atendimento_id', atendimentoId)
          .eq('ipva_tipo', 'COMPRA'),
        supabase
          .from('status_history')
          .select('id')
          .eq('entity_type', 'compra')
          .eq('entity_id', avaliacao.id)
          .like('status', 'CONTRATO COMPRA GERADO%')
          .limit(1),
        supabase.from('atendimentos_motos').select('cliente_id, cliente:clientes_fornecedores(cpf_cnpj)').eq('id', atendimentoId).maybeSingle(),
      ]);

      setJaGerado(!!(histGerado && histGerado.length > 0));

      const contrato = contratosList && contratosList.length > 0 ? contratosList[0] : null;
      const atFreshCpf = (atFresh as any)?.cliente?.cpf_cnpj;

      if (contrato) {
        setContratoId(contrato.id);
        setCpfCnpj(contrato.cpf_cnpj || atFreshCpf || '');
        setValorQuitacao(contrato.valor_quitacao ? formatCurrencyInput(String(Math.round(contrato.valor_quitacao * 100))) : '');
        setValorFechamento(contrato.valor_fechamento ? formatCurrencyInput(String(Math.round(contrato.valor_fechamento * 100))) : '');
        setObsInternas(contrato.observacoes_internas || '');
        setObsContrato(contrato.observacoes_contrato || '');
        setDataContrato(contrato.data_sinal ? new Date(contrato.data_sinal + 'T12:00:00') : undefined);
      } else {
        setContratoId(null);
        setCpfCnpj(atFreshCpf || '');
        setValorQuitacao('');
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

    // Sync CPF back to o cliente vinculado
    if (cpfCnpj) {
      const { data: atRow } = await supabase.from('atendimentos_motos').select('cliente_id').eq('id', atendimentoId).maybeSingle();
      if (atRow?.cliente_id) {
        await supabase.from('clientes_fornecedores').update({ cpf_cnpj: cpfCnpj || null }).eq('id', atRow.cliente_id);
      }
    }

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
    return true;
  };

  const buildPdfData = () => {
    const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
    const formatCurrencyValue = (val: string) => {
      const num = parseCurrencyInput(val);
      return num ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
    };
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
          entity_type: 'compra',
          entity_id: avaliacao.id,
          status: 'CONTRATO COMPRA GERADO',
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
      await generateContratoCompraPdf(buildPdfData());
      toast.success('PDF visualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao visualizar contrato:', err);
      toast.error('Erro ao visualizar o contrato');
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
            <FileText className="h-5 w-5 text-primary" /> Contrato de Compra
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
                  <InfoDisplay label="Nome" value={atendimento?.cliente?.nome_razao_social} />
                  <InfoDisplay label="Telefone" value={(() => {
                    const t = atendimento?.cliente?.telefone || '';
                    const d = t.replace(/\D/g, '');
                    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
                    return t;
                  })()} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">CPF/CNPJ <span className="text-destructive">*</span></label>
                    <Input
                      className="mt-1"
                      placeholder="000.000.000-00"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                      maxLength={18}
                    />
                  </div>
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
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <CurrencyField label="Valor de Quitação" value={valorQuitacao} onChange={setValorQuitacao} />
                  <CurrencyField label="Valor de Fechamento *" value={valorFechamento} onChange={setValorFechamento} />
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
                  <label className="text-sm font-medium text-foreground">Data do Contrato <span className="text-destructive">*</span></label>
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
            <div className="flex justify-center gap-2">
              <Button variant="outline" className="min-w-[140px]" onClick={handleVisualizar} disabled={generating}>
                <Eye className="h-4 w-4 mr-1" />Visualizar
              </Button>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="outline" className="min-w-[140px]" onClick={handleGerar} disabled={generating}>
              <Download className="h-4 w-4 mr-1" />{generating ? 'Gerando...' : 'Gerar'}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoCompraDialog;
