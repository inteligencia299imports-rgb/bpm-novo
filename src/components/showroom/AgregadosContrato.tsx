import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Package } from 'lucide-react';

export interface Agregado {
  id: string;
  descricao: string;
  valor: number;
  empresa_id?: string | null;
}

export interface AgregadoLinha {
  agregado_id: string | null;
  descricao: string;
  valor: number;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInput = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseInput = (v: string) => parseInt(v.replace(/\D/g, '') || '0', 10) / 100;
const toInput = (n: number) => (n ? (Math.round(n * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

interface Props {
  value: AgregadoLinha[];
  onChange: (linhas: AgregadoLinha[]) => void;
  catalogo: Agregado[];
  /** Chamado quando um agregado novo é cadastrado no catálogo. */
  onNovoAgregado?: (ag: Agregado) => void;
  soLeitura?: boolean;
  /** master/gerente: pode cadastrar um agregado novo no catálogo. */
  podeCadastrar?: boolean;
  /** Empresa do contrato — o agregado novo é criado nela (agregados são por empresa). */
  empresaId?: string;
}

/**
 * Agregados do contrato: serviços cobrados à parte do cliente. Seleciona um
 * agregado do catálogo (agregados_motos) — o valor vem preenchido e pode ser
 * editado aqui no contrato (não altera o catálogo).
 */
const AgregadosContrato: React.FC<Props> = ({ value, onChange, catalogo, onNovoAgregado, soLeitura, podeCadastrar, empresaId }) => {
  const [selId, setSelId] = useState('');
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoDesc, setNovoDesc] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const disponiveis = useMemo(
    () => catalogo.filter((c) => !value.some((l) => l.agregado_id === c.id)),
    [catalogo, value],
  );
  const total = value.reduce((s, l) => s + (Number(l.valor) || 0), 0);

  const adicionar = () => {
    const ag = catalogo.find((c) => c.id === selId);
    if (!ag) return;
    onChange([...value, { agregado_id: ag.id, descricao: ag.descricao, valor: Number(ag.valor) || 0 }]);
    setSelId('');
  };

  const setValor = (i: number, v: string) => {
    const next = value.slice();
    next[i] = { ...next[i], valor: parseInput(v) };
    onChange(next);
  };

  const remover = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const criarNovo = async () => {
    const descricao = novoDesc.trim();
    if (!descricao) return;
    if (!empresaId) { toast.error('Selecione a empresa do contrato antes de cadastrar um agregado.'); return; }
    setSalvandoNovo(true);
    const valor = parseInput(novoValor);
    const { data, error } = await supabase
      .from('agregados_motos')
      .insert({ descricao, valor, empresa_id: empresaId })
      .select('id, descricao, valor, empresa_id')
      .single();
    setSalvandoNovo(false);
    if (error || !data) {
      toast.error('Não foi possível cadastrar o agregado. ' + (error?.message ?? ''));
      return;
    }
    const ag = { id: data.id, descricao: data.descricao, valor: Number(data.valor) || 0, empresa_id: (data as any).empresa_id };
    onNovoAgregado?.(ag);
    onChange([...value, { agregado_id: ag.id, descricao: ag.descricao, valor: ag.valor }]);
    setNovoDesc('');
    setNovoValor('');
    setNovoOpen(false);
    toast.success('Agregado cadastrado');
  };

  if (soLeitura) {
    if (value.length === 0) return null;
    return (
      <div className="space-y-1.5">
        {value.map((l, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{l.descricao}</span>
            <span className="font-medium text-foreground">{brl(Number(l.valor) || 0)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
          <span>Total de agregados</span>
          <span>{brl(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-muted-foreground">{l.descricao}</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    className="pl-10"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={toInput(l.valor)}
                    onChange={(e) => setValor(i, fmtInput(e.target.value))}
                  />
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => remover(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total de agregados</span>
            <span>{brl(total)}</span>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Label className="text-xs text-muted-foreground">Adicionar agregado</Label>
          <Select value={selId} onValueChange={setSelId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder={disponiveis.length ? 'Selecione' : 'Todos já adicionados'} /></SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.descricao}{c.valor ? ` — ${brl(Number(c.valor))}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" disabled={!selId} onClick={adicionar}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      {podeCadastrar && (
        novoOpen ? (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Novo agregado (catálogo)</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Descrição</Label>
                <Input className="mt-1" value={novoDesc} onChange={(e) => setNovoDesc(e.target.value)} placeholder="Ex.: Antifurto" />
              </div>
              <div className="w-40">
                <Label className="text-xs">Valor padrão</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input className="pl-10" inputMode="numeric" placeholder="0,00" value={novoValor} onChange={(e) => setNovoValor(fmtInput(e.target.value))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setNovoOpen(false); setNovoDesc(''); setNovoValor(''); }}>Cancelar</Button>
              <Button size="sm" disabled={!novoDesc.trim() || salvandoNovo} onClick={criarNovo}>Salvar agregado</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNovoOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Package className="h-3.5 w-3.5" /> Cadastrar novo agregado no catálogo
          </button>
        )
      )}
    </div>
  );
};

export default AgregadosContrato;
