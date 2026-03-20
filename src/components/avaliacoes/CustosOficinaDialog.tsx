import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface CustoOficina {
  id?: string;
  responsavel: string;
  tipo: string;
  valor_previsto: number | null;
  valor_executado: number | null;
  numero_os: string;
  detalhes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
}

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string): number | null => {
  if (!value) return null;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

const numberToCurrencyDisplay = (value: number | null): string => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const RESPONSAVEIS = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'loja', label: 'Loja' },
];

const TIPOS = [
  { value: 'peca', label: 'Peça' },
  { value: 'servico', label: 'Serviço' },
];

const CustosOficinaDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId }) => {
  const [custos, setCustos] = useState<CustoOficina[]>([]);
  const [loading, setLoading] = useState(false);

  // New item form
  const [responsavel, setResponsavel] = useState('');
  const [tipo, setTipo] = useState('');
  const [valorPrevisto, setValorPrevisto] = useState('');
  const [valorExecutado, setValorExecutado] = useState('');
  const [numeroOs, setNumeroOs] = useState('');
  const [detalhes, setDetalhes] = useState('');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('custos_oficina')
        .select('*')
        .eq('avaliacao_id', avaliacaoId)
        .order('created_at', { ascending: true });
      if (data) {
        setCustos(data.map((c: any) => ({
          id: c.id,
          responsavel: c.responsavel,
          tipo: c.tipo,
          valor_previsto: c.valor_previsto,
          valor_executado: c.valor_executado,
          numero_os: c.numero_os || '',
          detalhes: c.detalhes || '',
        })));
      }
      setLoading(false);
    };
    load();
  }, [open, avaliacaoId]);

  const resetForm = () => {
    setResponsavel('');
    setTipo('');
    setValorPrevisto('');
    setValorExecutado('');
    setNumeroOs('');
    setDetalhes('');
  };

  const handleAdd = async () => {
    if (!responsavel || !tipo) {
      toast.error('Selecione o responsável e o tipo');
      return;
    }

    const newCusto: any = {
      avaliacao_id: avaliacaoId,
      responsavel,
      tipo,
      valor_previsto: parseCurrencyInput(valorPrevisto),
      valor_executado: parseCurrencyInput(valorExecutado),
      numero_os: numeroOs || null,
      detalhes: detalhes || null,
    };

    const { data, error } = await supabase.from('custos_oficina').insert(newCusto).select().single();
    if (error) {
      toast.error('Erro ao adicionar custo');
      return;
    }
    setCustos(prev => [...prev, {
      id: data.id,
      responsavel: data.responsavel,
      tipo: data.tipo,
      valor_previsto: data.valor_previsto,
      valor_executado: data.valor_executado,
      numero_os: data.numero_os || '',
      detalhes: data.detalhes || '',
    }]);
    resetForm();
    toast.success('Custo adicionado');
  };

  const handleRemove = async (id: string) => {
    await supabase.from('custos_oficina').delete().eq('id', id);
    setCustos(prev => prev.filter(c => c.id !== id));
    toast.success('Custo removido');
  };

  const getResponsavelLabel = (val: string) => RESPONSAVEIS.find(r => r.value === val)?.label || val;
  const getTipoLabel = (val: string) => TIPOS.find(t => t.value === val)?.label || val;
  const formatCurrency = (v: number | null) => v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg font-bold">Custos de Oficina</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-4">
            {/* Existing costs */}
            {custos.length > 0 && (
              <div className="space-y-2">
                {custos.map((custo) => (
                  <div key={custo.id} className="flex items-start gap-3 bg-muted/50 rounded-lg p-3 border border-border">
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Responsável</span>
                        <p className="font-semibold">{getResponsavelLabel(custo.responsavel)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tipo</span>
                        <p className="font-semibold">{getTipoLabel(custo.tipo)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Nº OS</span>
                        <p className="font-semibold">{custo.numero_os || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Valor Previsto</span>
                        <p className="font-semibold">{formatCurrency(custo.valor_previsto)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Valor Executado</span>
                        <p className="font-semibold">{formatCurrency(custo.valor_executado)}</p>
                      </div>
                      {custo.detalhes && (
                        <div className="col-span-2 sm:col-span-3">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Detalhes</span>
                          <p className="font-medium text-muted-foreground">{custo.detalhes}</p>
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => custo.id && handleRemove(custo.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {custos.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum custo registrado</p>
            )}

            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            <Separator />

            {/* Add new cost form */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Adicionar Custo</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Responsável</label>
                  <Select value={responsavel} onValueChange={setResponsavel}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESPONSAVEIS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Valor Previsto</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      className="pl-10"
                      placeholder="0,00"
                      value={valorPrevisto}
                      onChange={(e) => setValorPrevisto(formatCurrencyInput(e.target.value))}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Executado</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      className="pl-10"
                      placeholder="0,00"
                      value={valorExecutado}
                      onChange={(e) => setValorExecutado(formatCurrencyInput(e.target.value))}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Nº OS</label>
                <Input
                  className="mt-1"
                  placeholder="Número da OS"
                  value={numeroOs}
                  onChange={(e) => setNumeroOs(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Detalhes</label>
                <Textarea
                  className="mt-1"
                  placeholder="Observações sobre o custo..."
                  value={detalhes}
                  onChange={(e) => setDetalhes(e.target.value)}
                  rows={2}
                />
              </div>
              <Button onClick={handleAdd} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Adicionar Custo
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CustosOficinaDialog;
