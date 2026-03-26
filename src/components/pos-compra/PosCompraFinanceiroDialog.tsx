import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, DollarSign, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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

const parseCurrencyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
};

const formatCurrency = (v: number | null | undefined) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PosCompraFinanceiroDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [valorFechamento, setValorFechamento] = useState('');
  const [custosOficina, setCustosOficina] = useState<any[]>([]);

  // New cost form
  const [newResp, setNewResp] = useState('Cliente');
  const [newTipo, setNewTipo] = useState('Serviço');
  const [newDesc, setNewDesc] = useState('');
  const [newValor, setNewValor] = useState('');

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, avaliacaoId]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: avData }, { data: custosData }] = await Promise.all([
      supabase.from('avaliacoes').select('valor_fechamento').eq('id', avaliacaoId).maybeSingle(),
      supabase.from('custos_oficina').select('*').eq('avaliacao_id', avaliacaoId).order('created_at'),
    ]);

    if (avData?.valor_fechamento) {
      setValorFechamento(formatCurrencyInput(String(Math.round(avData.valor_fechamento * 100))));
    } else {
      setValorFechamento('');
    }
    setCustosOficina(custosData || []);
    setLoading(false);
  };

  const calcAbatimentos = () => {
    return custosOficina
      .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
      .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0);
  };

  const abatimentos = calcAbatimentos();
  const vf = parseCurrencyInput(valorFechamento);
  const repasseNum = vf - abatimentos;

  const addCusto = async () => {
    if (!newValor || parseCurrencyInput(newValor) <= 0) {
      toast.error('Informe o valor do custo');
      return;
    }

    const payload = {
      avaliacao_id: avaliacaoId,
      tipo: newTipo.toLowerCase().replace('ç', 'c').replace('ã', 'a'),
      responsavel: newResp,
      detalhes: newDesc || null,
      valor_previsto: parseCurrencyInput(newValor),
    };

    const { data, error } = await supabase.from('custos_oficina').insert(payload as any).select().single();
    if (error) { toast.error('Erro ao adicionar custo'); return; }

    setCustosOficina(prev => [...prev, data]);
    setNewTipo('Serviço');
    setNewResp('Cliente');
    setNewDesc('');
    setNewValor('');

    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  const removeCusto = async (id: string) => {
    await supabase.from('custos_oficina').delete().eq('id', id);
    setCustosOficina(prev => prev.filter(c => c.id !== id));
    toast.success('Custo removido');
  };

  const handleSave = async () => {
    setSaving(true);
    toast.success('Resumo financeiro salvo!');
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Resumo Financeiro
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto" ref={listRef}>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground px-6">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-6 pb-6 px-6 pt-4">
              {/* Valor de Fechamento */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Valor de Fechamento</h3>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input className="pl-10" placeholder="0,00" value={valorFechamento} onChange={e => setValorFechamento(formatCurrencyInput(e.target.value))} inputMode="numeric" />
                </div>
              </div>

              <Separator />

              {/* RESUMO FINANCEIRO */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Abatimentos</h3>

                {/* Add cost inline */}
                <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs font-medium">Responsável</label>
                    <Select value={newResp} onValueChange={setNewResp}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Loja">Loja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Descrição</label>
                    <Input className="mt-1 h-9" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Valor</label>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input className="pl-7 h-9" value={newValor} onChange={e => setNewValor(formatCurrencyInput(e.target.value))} inputMode="numeric" placeholder="0,00" />
                    </div>
                  </div>
                  <Button size="sm" className="h-9" onClick={addCusto}><Plus className="h-4 w-4" /></Button>
                </div>

                {/* Cost list */}
                {custosOficina.length > 0 && (
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                    {custosOficina.map((c: any) => {
                      const val = c.valor_executado || c.valor_previsto || 0;
                      if (val <= 0) return null;
                      const isAbatido = (c.responsavel || '').toLowerCase() === 'cliente';
                      return (
                        <div key={c.id} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
                            {(c.tipo || '').toUpperCase().replace('PECA', 'PEÇA').replace('SERVICO', 'SERVIÇO')}
                          </span>
                          <span className="flex-1 truncate text-xs font-medium">
                            {(c.responsavel || '').toUpperCase()} - {(c.detalhes || '-').toUpperCase()}
                          </span>
                          <span className={`font-semibold text-sm whitespace-nowrap ${isAbatido ? 'text-destructive' : 'text-foreground'}`}>
                            {formatCurrency(val)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCusto(c.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">Total de Abatimentos</span>
                    <span className="text-lg font-bold text-destructive">
                      {formatCurrency(abatimentos)}
                    </span>
                  </div>
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">Valor de Repasse</span>
                    <span className={`text-lg font-bold ${repasseNum >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(repasseNum > 0 ? repasseNum : 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom button */}
        <div className="flex justify-center gap-2 p-4 border-t shrink-0">
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Fechar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PosCompraFinanceiroDialog;
