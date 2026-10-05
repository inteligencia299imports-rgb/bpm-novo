import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Trash2, Plus, Wallet, Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Card "Formas de Pagamento" no mesmo layout da tela de venda (ContratoDialog),
// gravando em formas_pagamento_contrato. Usado na proposta de compra
// (ContratoCompraDialog) e na intermediação (ContratoConsignanteDialog, via
// contrato_consignante_id), onde as formas cobrem o repasse ao cliente.

/** Forma cujo nome é "Financiamento" ganha o bloco de campos extras (entrada/parcelas). */
export const ehFinanciamento = (nome: string | null | undefined) =>
  String(nome ?? '').trim().toLowerCase() === 'financiamento';

/** Forma cujo nome é "Consórcio". */
const ehConsorcio = (nome: string | null | undefined) =>
  ['consórcio', 'consorcio'].includes(String(nome ?? '').trim().toLowerCase());

/** Formas que se vinculam a uma instituição (banco / administradora) e têm observação editável. */
const ehFinInstituicao = (nome: string | null | undefined) =>
  ehFinanciamento(nome) || ehConsorcio(nome);

interface InstituicaoOpt {
  /** id da linha em formas_pagamento_instituicoes */
  id: string;
  cliente_fornecedor_id: string;
  nome: string;
  observacoes_contrato: string | null;
}

export interface FormaPagamento {
  id?: string;
  forma_pagamento_id: string | null;
  /** nome da forma (denormalizado) */
  tipo: string;
  valor_total: number | null;
  valor_entrada: number | null;
  financeira: string | null;
  numero_parcelas: number | null;
  valor_parcelas: number | null;
  valor_financiado: number | null;
  /** Taxa de retorno (%) — só para Financiamento. */
  taxa_retorno_pct: number | null;
  /** data do pagamento (yyyy-MM-dd) — vira data_vencimento da parcela do compromisso */
  data_pagamento: string | null;
  /** instituição (banco / administradora) escolhida — só para Financiamento / Consórcio */
  cliente_fornecedor_id: string | null;
  observacoes: string | null;
}

/** Converte uma linha de formas_pagamento_contrato (insert/update/select) para o formato usado no estado. */
export const mapFormaRow = (data: any): FormaPagamento => ({
  id: data.id,
  forma_pagamento_id: data.forma_pagamento_id ?? null,
  tipo: data.tipo || '',
  valor_total: data.valor_total,
  valor_entrada: data.valor_entrada,
  financeira: data.financeira,
  numero_parcelas: data.numero_parcelas,
  valor_parcelas: data.valor_parcelas,
  valor_financiado: data.valor_financiado,
  taxa_retorno_pct: data.taxa_retorno_pct != null ? Number(data.taxa_retorno_pct) : null,
  data_pagamento: data.data_pagamento ?? null,
  cliente_fornecedor_id: data.cliente_fornecedor_id ?? null,
  observacoes: data.observacoes ?? '',
});

/** Quanto uma forma cobre: financiamento = só o valor financiado (a entrada é lançada à parte); demais = valor total. */
const contribuicao = (fp: Pick<FormaPagamento, 'tipo' | 'valor_total' | 'valor_financiado'>) =>
  ehFinanciamento(fp.tipo) ? (Number(fp.valor_financiado) || 0) : (Number(fp.valor_total) || 0);

export const somaFormasPagamento = (formas: FormaPagamento[]) =>
  formas.reduce((s, fp) => s + contribuicao(fp), 0);

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

/**
 * Percentual: "." e "," são sempre separador decimal. Aceita "12,5", "12.5",
 * "1.234,5" (o último separador é o decimal; os anteriores são milhar).
 */
const parsePct = (v: string): number | null => {
  const cleaned = v.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const s = cleaned.replace(/[.,](?=.*[.,])/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
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

interface Props {
  formas: FormaPagamento[];
  setFormas: React.Dispatch<React.SetStateAction<FormaPagamento[]>>;
  contratoId: string | null;
  /** Coluna que liga a forma ao contrato: `contratos` (venda/compra) ou `contratos_consignante` (intermediação). */
  vinculo?: 'contrato_id' | 'contrato_consignante_id';
  /** Garante que o contrato existe (salva se preciso) e devolve o id. */
  garantirContrato: () => Promise<string | null>;
  /** Valor que as formas de pagamento devem cobrir. */
  valorTotal: number;
  soLeitura: boolean;
  /** Chamado após adicionar/editar/remover uma forma. */
  onAlterado?: () => void;
}

const FormasPagamentoCard: React.FC<Props> = ({ formas, setFormas, contratoId, vinculo = 'contrato_id', garantirContrato, valorTotal, soLeitura, onAlterado }) => {
  const [formasPagOpcoes, setFormasPagOpcoes] = useState<{ id: string; nome: string }[]>([]);
  const [instituicoesByForma, setInstituicoesByForma] = useState<Record<string, InstituicaoOpt[]>>({});
  // id do registro de formas_pagamento_contrato em edição (null = formulário está em modo "adicionar")
  const [editingId, setEditingId] = useState<string | null>(null);
  const [novaPagamentoTipo, setNovaPagamentoTipo] = useState('');
  const novaFormaNome = formasPagOpcoes.find(f => f.id === novaPagamentoTipo)?.nome ?? '';
  const [novaInstituicaoId, setNovaInstituicaoId] = useState('');
  const [novaObservacoes, setNovaObservacoes] = useState('');
  const [finValorEntrada, setFinValorEntrada] = useState('');
  const [finParcelas, setFinParcelas] = useState('');
  const [finValorParcelas, setFinValorParcelas] = useState('');
  const [finValorFinanciado, setFinValorFinanciado] = useState('');
  const [finTaxaRetorno, setFinTaxaRetorno] = useState('');
  const [novaDataPagamento, setNovaDataPagamento] = useState('');
  const [outroValor, setOutroValor] = useState('');
  const [pagCalOpen, setPagCalOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancel = false;
    // Tabelas fora dos tipos gerados do Supabase -> cast (mesmo caso da tela de venda).
    const sb = supabase as any;
    Promise.all([
      sb.from('formas_pagamento').select('id, nome').eq('bpm', true).eq('ativo', true).order('ordem'),
      sb
        .from('formas_pagamento_instituicoes')
        .select('id, forma_pagamento_id, cliente_fornecedor_id, observacoes_contrato, instituicao:cliente_fornecedor_id(nome_razao_social, nome_fantasia)')
        .eq('ativo', true),
    ]).then(([{ data: formasOpts }, { data: instOpts }]) => {
      if (cancel) return;
      setFormasPagOpcoes((formasOpts as any[]) || []);
      const byForma: Record<string, InstituicaoOpt[]> = {};
      for (const r of ((instOpts ?? []) as any[])) {
        (byForma[r.forma_pagamento_id] ??= []).push({
          id: r.id,
          cliente_fornecedor_id: r.cliente_fornecedor_id,
          nome: r.instituicao?.nome_fantasia || r.instituicao?.nome_razao_social || 'Instituição',
          observacoes_contrato: r.observacoes_contrato ?? null,
        });
      }
      for (const k of Object.keys(byForma)) byForma[k].sort((a, b) => a.nome.localeCompare(b.nome));
      setInstituicoesByForma(byForma);
    });
    return () => { cancel = true; };
  }, []);

  const soma = somaFormasPagamento(formas);
  const faltante = valorTotal - soma;

  const resetPagamentoForm = () => {
    setNovaPagamentoTipo('');
    setNovaInstituicaoId('');
    setNovaObservacoes('');
    setFinValorEntrada('');
    setFinParcelas('');
    setFinValorParcelas('');
    setFinValorFinanciado('');
    setFinTaxaRetorno('');
    setNovaDataPagamento('');
    setOutroValor('');
  };

  /** Preenche o formulário com os dados de uma forma já lançada, para edição. */
  const handleEditPagamento = (fp: FormaPagamento) => {
    setEditingId(fp.id || null);
    setNovaPagamentoTipo(fp.forma_pagamento_id || '');
    // novaInstituicaoId guarda o id da linha em formas_pagamento_instituicoes, não o cliente_fornecedor_id.
    const instMatch = fp.cliente_fornecedor_id
      ? (instituicoesByForma[fp.forma_pagamento_id || ''] || []).find(i => i.cliente_fornecedor_id === fp.cliente_fornecedor_id)
      : undefined;
    setNovaInstituicaoId(instMatch?.id || '');
    setNovaObservacoes(fp.observacoes || '');
    setFinValorEntrada(fp.valor_entrada != null ? formatCurrencyInput(String(Math.round(fp.valor_entrada * 100))) : '');
    setFinParcelas(fp.numero_parcelas != null ? String(fp.numero_parcelas) : '');
    setFinValorParcelas(fp.valor_parcelas != null ? formatCurrencyInput(String(Math.round(fp.valor_parcelas * 100))) : '');
    setFinValorFinanciado(fp.valor_financiado != null ? formatCurrencyInput(String(Math.round(fp.valor_financiado * 100))) : '');
    setFinTaxaRetorno(fp.taxa_retorno_pct != null ? String(fp.taxa_retorno_pct) : '');
    setNovaDataPagamento(fp.data_pagamento || '');
    setOutroValor(fp.valor_total != null ? formatCurrencyInput(String(Math.round(fp.valor_total * 100))) : '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    resetPagamentoForm();
  };

  const handleAddPagamento = async () => {
    if (!novaPagamentoTipo) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    const ehInst = ehFinInstituicao(novaFormaNome);
    const instSel = ehInst
      ? (instituicoesByForma[novaPagamentoTipo] || []).find(i => i.id === novaInstituicaoId)
      : undefined;
    if (ehInst && !instSel) {
      toast.error('Selecione o banco / administradora');
      return;
    }
    if (!novaDataPagamento) {
      toast.error('Informe a data do pagamento');
      return;
    }

    // Campos zerados por padrão para não deixar resíduo de outra forma ao editar (ex.: trocar Financiamento -> Pix).
    const formaData: any = {
      forma_pagamento_id: novaPagamentoTipo,
      tipo: novaFormaNome,
      valor_total: null,
      valor_entrada: null,
      numero_parcelas: null,
      valor_parcelas: null,
      valor_financiado: null,
      taxa_retorno_pct: null,
      data_pagamento: novaDataPagamento,
      cliente_fornecedor_id: null,
      financeira: null,
      observacoes: novaObservacoes.trim() || null,
    };

    if (ehFinanciamento(novaFormaNome)) {
      formaData.valor_entrada = parseCurrencyInput(finValorEntrada) || null;
      formaData.numero_parcelas = finParcelas ? parseInt(finParcelas) : null;
      formaData.valor_parcelas = parseCurrencyInput(finValorParcelas) || null;
      formaData.valor_financiado = parseCurrencyInput(finValorFinanciado) || null;
      formaData.taxa_retorno_pct = parsePct(finTaxaRetorno);
    } else {
      formaData.valor_total = parseCurrencyInput(outroValor) || null;
    }

    if (ehInst && instSel) {
      formaData.cliente_fornecedor_id = instSel.cliente_fornecedor_id;
      formaData.financeira = instSel.nome; // denormalizado p/ lista
    }

    // A soma das formas de pagamento não pode passar do Valor Total.
    if (valorTotal > 0.005) {
      const fpAntiga = editingId ? formas.find((f) => f.id === editingId) : undefined;
      const jaPago = soma - (fpAntiga ? contribuicao(fpAntiga) : 0);
      if (jaPago + contribuicao(formaData) > valorTotal + 0.005) {
        const restante = Math.max(valorTotal - jaPago, 0);
        toast.error(`A soma das formas de pagamento não pode passar do Valor Total (${formatCurrency(valorTotal)}). Restante: ${formatCurrency(restante)}.`);
        return;
      }
    }

    setSalvando(true);
    try {
      if (editingId) {
        const { data, error } = await supabase.from('formas_pagamento_contrato').update(formaData).eq('id', editingId).select().single();
        if (error) {
          toast.error('Erro ao salvar forma de pagamento');
          return;
        }
        setFormas(prev => prev.map(f => f.id === editingId ? mapFormaRow(data) : f));
        setEditingId(null);
        resetPagamentoForm();
        onAlterado?.();
        toast.success('Forma de pagamento atualizada');
        return;
      }

      // O contrato precisa existir antes da primeira forma.
      const cId = contratoId || await garantirContrato();
      if (!cId) return;

      const { data, error } = await supabase.from('formas_pagamento_contrato').insert({ ...formaData, [vinculo]: cId } as any).select().single();
      if (error) {
        toast.error('Erro ao adicionar forma de pagamento');
        return;
      }
      setFormas(prev => [...prev, mapFormaRow(data)]);
      resetPagamentoForm();
      onAlterado?.();
      toast.success('Forma de pagamento adicionada');
    } finally {
      setSalvando(false);
    }
  };

  const handleRemovePagamento = async (id: string) => {
    const { error } = await supabase.from('formas_pagamento_contrato').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover forma de pagamento');
      return;
    }
    setFormas(prev => prev.filter(f => f.id !== id));
    if (editingId === id) handleCancelEdit();
    onAlterado?.();
    toast.success('Forma de pagamento removida');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Formas de Pagamento
        </CardTitle>
        <Separator className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">

      {/* Adicionar / editar forma — bloqueado quando o Valor Total já está coberto */}
      {!soLeitura && !editingId && valorTotal > 0.005 && faltante <= 0.005 && (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
          Valor Total já coberto pelas formas de pagamento. Para ajustar, edite ou remova uma forma abaixo.
        </p>
      )}
      {!soLeitura && (editingId || valorTotal <= 0.005 || faltante > 0.005) && (
      <div className={cn('rounded-lg border p-3 space-y-3', editingId && 'border-primary')}>
        <div className="flex items-center gap-2">
          {editingId ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{editingId ? 'Editar Forma de Pagamento' : 'Adicionar Forma de Pagamento'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {formasPagOpcoes.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma forma de pagamento habilitada para o BPM.</p>
          )}
          {formasPagOpcoes.map(fp => (
            <Button
              key={fp.id}
              size="sm"
              variant={novaPagamentoTipo === fp.id ? 'default' : 'outline'}
              onClick={() => { setNovaPagamentoTipo(fp.id); setNovaInstituicaoId(''); setNovaObservacoes(''); setNovaDataPagamento(''); setOutroValor(''); setFinValorEntrada(''); setFinParcelas(''); setFinValorParcelas(''); setFinValorFinanciado(''); setFinTaxaRetorno(''); }}
              className="text-xs"
            >
              {fp.nome}
            </Button>
          ))}
        </div>

        {ehFinInstituicao(novaFormaNome) && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Banco / Administradora</label>
            <Select
              value={novaInstituicaoId}
              onValueChange={(v) => {
                setNovaInstituicaoId(v);
                const sel = (instituicoesByForma[novaPagamentoTipo] || []).find(i => i.id === v);
                setNovaObservacoes(sel?.observacoes_contrato ?? '');
              }}
            >
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(instituicoesByForma[novaPagamentoTipo] || []).map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(instituicoesByForma[novaPagamentoTipo] || []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum banco / administradora vinculado a esta forma de pagamento.
              </p>
            )}
          </div>
        )}

        {ehFinanciamento(novaFormaNome) && (
          <div className="space-y-3">
            <CurrencyField label="Valor de Entrada" value={finValorEntrada} onChange={setFinValorEntrada} />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Nº Parcelas</label>
                <Input className="mt-1" type="number" value={finParcelas} onChange={e => setFinParcelas(e.target.value)} placeholder="48" />
              </div>
              <CurrencyField label="Valor Parcelas" value={finValorParcelas} onChange={setFinValorParcelas} />
              <CurrencyField label="Valor Financiado" value={finValorFinanciado} onChange={setFinValorFinanciado} />
            </div>
            <div className="max-w-[10rem]">
              <label className="text-sm font-medium text-foreground">Taxa de Retorno (%)</label>
              <div className="relative mt-1">
                <Input className="pr-7" inputMode="decimal" placeholder="0" value={finTaxaRetorno} onChange={e => setFinTaxaRetorno(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        )}

        {novaPagamentoTipo && !ehFinanciamento(novaFormaNome) && (
          <CurrencyField label="Valor Total" value={outroValor} onChange={setOutroValor} />
        )}

        {novaPagamentoTipo && (
          <div className="max-w-[14rem] space-y-1.5">
            <label className="text-sm font-medium text-foreground">Data do Pagamento <span className="text-destructive">*</span></label>
            <Popover open={pagCalOpen} onOpenChange={setPagCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !novaDataPagamento && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {novaDataPagamento ? format(new Date(`${novaDataPagamento}T00:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={novaDataPagamento ? new Date(`${novaDataPagamento}T00:00:00`) : undefined}
                  onSelect={(d) => { setNovaDataPagamento(d ? format(d, "yyyy-MM-dd") : ''); setPagCalOpen(false); }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                {novaDataPagamento && (
                  <div className="border-t p-2 flex justify-between">
                    <Button size="sm" variant="ghost" onClick={() => { setNovaDataPagamento(''); setPagCalOpen(false); }}>Limpar</Button>
                    <Button size="sm" onClick={() => setPagCalOpen(false)}>OK</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}

        {novaPagamentoTipo && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <Textarea
              rows={3}
              value={novaObservacoes}
              onChange={(e) => setNovaObservacoes(e.target.value)}
              placeholder="Observações desta forma de pagamento..."
            />
          </div>
        )}

        {novaPagamentoTipo && (
          <div className="flex justify-center gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1 max-w-[10.5rem]" onClick={handleCancelEdit}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleAddPagamento} disabled={salvando} className="flex-1 max-w-[10.5rem]">
              <Plus className="h-4 w-4 mr-1" />
              {editingId ? 'Salvar Alterações' : 'Registrar'}
            </Button>
          </div>
        )}
      </div>
      )}

      {soLeitura && formas.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma forma de pagamento lançada.</p>
      )}

      {/* Lista de formas já adicionadas */}
      {formas.length > 0 && (
        <div className="space-y-2">
          {formas.map((fp) => (
            <div key={fp.id} className={cn('flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2', editingId === fp.id && 'border-primary')}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{fp.tipo || '—'}</span>
                  {fp.financeira && <span className="text-xs text-muted-foreground">{fp.financeira}</span>}
                </div>
                {ehFinanciamento(fp.tipo) || ehConsorcio(fp.tipo) ? (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {fp.valor_entrada != null && <div>Entrada: {formatCurrency(fp.valor_entrada)}</div>}
                    {fp.numero_parcelas != null && fp.valor_parcelas != null && (
                      <div>{fp.numero_parcelas}x de {formatCurrency(fp.valor_parcelas)}</div>
                    )}
                    {fp.valor_financiado != null && <div>Financiado: {formatCurrency(fp.valor_financiado)}</div>}
                    {fp.taxa_retorno_pct != null && <div>Taxa de Retorno: {fp.taxa_retorno_pct}%</div>}
                    {fp.valor_total != null && <div>Valor: {formatCurrency(fp.valor_total)}</div>}
                  </div>
                ) : (
                  fp.valor_total != null && <p className="text-xs text-muted-foreground">Valor: {formatCurrency(fp.valor_total)}</p>
                )}
                {fp.data_pagamento && (
                  <p className="text-xs text-muted-foreground">
                    Pagamento: {format(new Date(`${fp.data_pagamento}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                )}
                {fp.observacoes && (
                  <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">{fp.observacoes}</p>
                )}
              </div>
              {!soLeitura && (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditPagamento(fp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => fp.id && handleRemovePagamento(fp.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </CardContent>
    </Card>
  );
};

export default FormasPagamentoCard;
