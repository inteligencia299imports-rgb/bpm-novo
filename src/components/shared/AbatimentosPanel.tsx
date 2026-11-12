import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { listarAbatimentosForaDaOficina, recalcularRepasseCompra, type AbatimentoForaDaOficina } from '@/lib/abatimentosCliente';
import { toast } from 'sonner';

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseCurrencyInput = (value: string): number => parseInt(value.replace(/\D/g, '') || '0', 10) / 100;
const formatCurrency = (v: number | null | undefined) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const nz = (v: unknown) => Number(v) || 0;

type TipoAbatimento = 'abatimento' | 'quitacao';

interface Props {
  /** Avaliação da moto (compra no Pós-Compra; moto consignada na Intermediação Parte 2). */
  avaliacaoId: string | null | undefined;
  /** Mensagem quando não há avaliação vinculada. */
  semAvaliacaoMsg?: string;
}

/**
 * Abatimentos da moto — mesmo painel no Pós-Compra e na Intermediação (Parte 2).
 * Tipo (pedido do usuário, 2026-11-12):
 *  - Abatimento: custo do cliente em custos_oficina (como sempre foi), abate do repasse;
 *  - Quitação: substitui avaliacoes.valor_quitacao (o valor de quitação da moto,
 *    que vira a parcela QUITAÇÃO do compromisso de compra).
 * Repasse = fechamento − quitação − abatimentos (mesma conta do compromisso).
 */
const AbatimentosPanel: React.FC<Props> = ({ avaliacaoId, semAvaliacaoMsg }) => {
  const [loading, setLoading] = useState(true);
  const [valorFechamento, setValorFechamento] = useState(0);
  const [valorQuitacao, setValorQuitacao] = useState(0);
  const [custosOficina, setCustosOficina] = useState<any[]>([]);
  const [itensForaOficina, setItensForaOficina] = useState<AbatimentoForaDaOficina[]>([]);
  const [newTipo, setNewTipo] = useState<TipoAbatimento>('abatimento');
  const [newResp, setNewResp] = useState('Cliente');
  const [newDesc, setNewDesc] = useState('');
  const [newValor, setNewValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!avaliacaoId) { setLoading(false); return; }
    let ativo = true;
    setLoading(true);
    (async () => {
      const [{ data: av }, { data: custos }, fora] = await Promise.all([
        supabase.from('avaliacoes').select('valor_fechamento, valor_quitacao').eq('id', avaliacaoId).maybeSingle(),
        supabase.from('custos_oficina').select('*').eq('avaliacao_id', avaliacaoId).order('created_at'),
        listarAbatimentosForaDaOficina(avaliacaoId),
      ]);
      if (!ativo) return;
      setValorFechamento(nz((av as any)?.valor_fechamento));
      setValorQuitacao(nz((av as any)?.valor_quitacao));
      setCustosOficina((custos as any[]) || []);
      setItensForaOficina(fora);
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [avaliacaoId]);

  if (!avaliacaoId) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{semAvaliacaoMsg || 'Moto sem avaliação vinculada.'}</p>;
  }
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const abatimentos = custosOficina
    .filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente')
    .reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0)
    + itensForaOficina.reduce((s, i) => s + i.valor, 0);
  const repasseNum = valorFechamento - valorQuitacao - abatimentos;
  const ehQuitacao = newTipo === 'quitacao';

  const gravarQuitacao = async (novo: number) => {
    const { error } = await supabase.from('avaliacoes').update({ valor_quitacao: novo > 0 ? novo : null } as any).eq('id', avaliacaoId);
    if (error) throw error;
    setValorQuitacao(novo);
  };

  const adicionar = async () => {
    const valor = parseCurrencyInput(newValor);
    if (valor <= 0) { toast.error('Informe o valor'); return; }
    setSalvando(true);
    try {
      if (ehQuitacao) {
        await gravarQuitacao(Math.round(valor * 100) / 100);
        toast.success('Valor de quitação atualizado');
      } else {
        const { data, error } = await supabase.from('custos_oficina').insert({
          avaliacao_id: avaliacaoId,
          tipo: 'servico',
          responsavel: newResp,
          detalhes: newDesc || null,
          valor_previsto: valor,
        } as any).select().single();
        if (error) throw error;
        setCustosOficina(prev => [...prev, data]);
      }
      recalcularRepasseCompra(avaliacaoId);
      setNewResp('Cliente');
      setNewDesc('');
      setNewValor('');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message || err));
    } finally {
      setSalvando(false);
    }
  };

  const removerCusto = async (id: string) => {
    await supabase.from('custos_oficina').delete().eq('id', id);
    setCustosOficina(prev => prev.filter(c => c.id !== id));
    recalcularRepasseCompra(avaliacaoId);
    toast.success('Custo removido');
  };

  const removerQuitacao = async () => {
    if (!window.confirm('Zerar o valor de quitação desta moto?')) return;
    try {
      await gravarQuitacao(0);
      recalcularRepasseCompra(avaliacaoId);
      toast.success('Valor de quitação zerado');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message || err));
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Abatimentos</h3>
      <div className="grid grid-cols-[150px_130px_1fr_150px_auto] gap-2 items-end">
        <div>
          <label className="text-xs font-medium">Tipo</label>
          <Select value={newTipo} onValueChange={(v) => setNewTipo(v as TipoAbatimento)}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abatimento">Abatimento</SelectItem>
              <SelectItem value="quitacao">Quitação</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Responsável</label>
          <Select value={ehQuitacao ? 'Cliente' : newResp} onValueChange={setNewResp} disabled={ehQuitacao}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Cliente">Cliente</SelectItem>
              <SelectItem value="Loja">Loja</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Descrição</label>
          <Input
            className="mt-1 h-9"
            value={ehQuitacao ? '' : newDesc}
            disabled={ehQuitacao}
            onChange={e => { const v = e.target.value; setNewDesc(v.charAt(0).toUpperCase() + v.slice(1)); }}
            placeholder={ehQuitacao ? 'Substitui o valor de quitação da moto' : 'Descrição'}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Valor</label>
          <div className="relative mt-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
            <Input className="pl-7 h-9" value={newValor} onChange={e => setNewValor(formatCurrencyInput(e.target.value))} inputMode="numeric" placeholder="0,00" />
          </div>
        </div>
        {/* Quitação já preenchida: o botão atualiza (substitui) o valor — ícone de atualizar. */}
        <Button size="sm" className="h-9" onClick={adicionar} disabled={salvando} title={ehQuitacao && valorQuitacao > 0 ? 'Atualizar quitação' : 'Adicionar'}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ehQuitacao && valorQuitacao > 0 ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {(valorQuitacao > 0 || custosOficina.length > 0 || itensForaOficina.length > 0) && (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {valorQuitacao > 0 && (
            <div className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm" title="Valor de quitação da moto (avaliação)">
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">QUITAÇÃO</span>
              <span className="flex-1 truncate text-xs font-medium">CLIENTE - VALOR DE QUITAÇÃO DA MOTO</span>
              <span className="font-semibold text-sm whitespace-nowrap text-destructive">{formatCurrency(valorQuitacao)}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={removerQuitacao}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )}
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
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removerCusto(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
          {/* Abatimentos de fora da oficina (intermediação / previsão / comissão): só leitura. */}
          {itensForaOficina.map((it, i) => (
            <div key={`fora-${i}`} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm" title={it.origem === 'intermediacao' ? 'Lançado no contrato de intermediação' : it.origem === 'comissao' ? 'Percentual do contrato de consignação sobre o valor de fechamento' : 'Previsão de custos do cliente da avaliação'}>
              <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">
                {it.origem === 'intermediacao' ? 'INTERMEDIAÇÃO' : it.origem === 'comissao' ? 'COMISSÃO' : 'PREVISÃO'}
              </span>
              <span className="flex-1 truncate text-xs font-medium">CLIENTE - {it.descricao.toUpperCase()}</span>
              <span className="font-semibold text-sm whitespace-nowrap text-destructive">{formatCurrency(it.valor)}</span>
              <span className="h-7 w-7 shrink-0" />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border-2 border-muted bg-muted/30 p-3 flex flex-col justify-center">
          <span className="text-xs font-semibold text-muted-foreground">Valor de Fechamento</span>
          <span className="text-lg font-bold">{formatCurrency(valorFechamento)}</span>
        </div>
        <div className="rounded-lg border-2 border-amber-300/50 bg-amber-50/60 p-3 flex flex-col justify-center">
          <span className="text-xs font-semibold text-muted-foreground">Quitação</span>
          <span className="text-lg font-bold text-amber-700">{formatCurrency(valorQuitacao)}</span>
        </div>
        <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 flex flex-col justify-center">
          <span className="text-xs font-semibold text-muted-foreground">Total de Abatimentos</span>
          <span className="text-lg font-bold text-destructive">{formatCurrency(abatimentos)}</span>
        </div>
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col justify-center">
          <span className="text-xs font-semibold text-muted-foreground">Valor de Repasse</span>
          <span className={`text-lg font-bold ${repasseNum >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatCurrency(repasseNum > 0 ? repasseNum : 0)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AbatimentosPanel;
