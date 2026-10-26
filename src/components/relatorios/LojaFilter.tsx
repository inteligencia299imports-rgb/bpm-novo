import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface LojaFilterProps {
  /** 'todos' | '299' | 'Ducati' | loja | várias lojas separadas por vírgula ("299i,Ducati BSB"). */
  value: string;
  onChange: (loja: string) => void;
  hideDucati?: boolean;
  /** Permite marcar mais de uma loja (inclusive de grupos diferentes). Só para
   * relatórios que filtram no cliente — os que mandam a loja pra RPC usam uma só. */
  multiple?: boolean;
}

export const SUB_LOJAS: Record<'299' | 'Ducati', string[]> = {
  '299': ['299i', '299s', '299f', '299p', 'Aventura'],
  Ducati: ['Ducati BSB', 'Ducati FLN', 'Ducati POA'],
};

const getGroup = (v: string): 'todos' | '299' | 'Ducati' | null => {
  if (v === 'todos') return 'todos';
  if (v === '299' || SUB_LOJAS['299'].includes(v)) return '299';
  if (v === 'Ducati' || SUB_LOJAS.Ducati.includes(v)) return 'Ducati';
  return null;
};

/** Lojas selecionadas por um valor do filtro ('todos' -> vazio = sem filtro). */
export const lojasDoFiltro = (v: string): string[] => {
  if (!v || v === 'todos') return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean)
    .flatMap((s) => (s === '299' || s === 'Ducati' ? SUB_LOJAS[s] : [s]));
};

const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const LojaFilter: React.FC<LojaFilterProps> = ({ value, onChange, hideDucati, multiple }) => {
  const groups = (hideDucati ? ['todos', '299'] : ['todos', '299', 'Ducati']) as Array<'todos' | '299' | 'Ducati'>;

  if (multiple) {
    const selecionadas = lojasDoFiltro(value);
    const todasLojas = hideDucati ? SUB_LOJAS['299'] : [...SUB_LOJAS['299'], ...SUB_LOJAS.Ducati];
    const aplicar = (prox: string[]) => {
      if (prox.length === 0) return onChange('todos');
      if (mesmoConjunto(prox, SUB_LOJAS['299'])) return onChange('299');
      if (mesmoConjunto(prox, SUB_LOJAS.Ducati)) return onChange('Ducati');
      onChange(todasLojas.filter((l) => prox.includes(l)).join(','));
    };
    const toggleLojas = (unidades: string[], marcar: boolean) =>
      aplicar(marcar ? [...new Set([...selecionadas, ...unidades])] : selecionadas.filter((l) => !unidades.includes(l)));
    const gruposVisiveis = (hideDucati ? ['299'] : ['299', 'Ducati']) as Array<'299' | 'Ducati'>;
    const rotulo = selecionadas.length === 0 ? 'Todas Lojas' : selecionadas.length === 1 ? selecionadas[0] : `${selecionadas.length} lojas`;
    // Mesmo seletor do CRM (pedido do usuário, 2026-10-26): várias unidades,
    // agrupadas por marca; marcar a marca (299 / Ducati) marca todas as dela.
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full sm:w-56 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <span className="truncate">{rotulo}</span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1" align="start">
          <label className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
            <Checkbox checked={selecionadas.length === 0} onCheckedChange={() => onChange('todos')} />
            Todas Lojas
          </label>
          {gruposVisiveis.map((g) => {
            const unidades = SUB_LOJAS[g];
            const marcadas = unidades.filter((u) => selecionadas.includes(u)).length;
            return (
              <React.Fragment key={g}>
                <label className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium cursor-pointer hover:bg-muted">
                  <Checkbox
                    checked={marcadas === 0 ? false : marcadas === unidades.length ? true : 'indeterminate'}
                    onCheckedChange={() => toggleLojas(unidades, marcadas < unidades.length)}
                  />
                  {g}
                </label>
                {unidades.map((u) => (
                  <label key={u} className="flex items-center gap-2 rounded-sm pl-8 pr-2 py-1.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted">
                    <Checkbox checked={selecionadas.includes(u)} onCheckedChange={(c) => toggleLojas([u], c === true)} />
                    {u}
                  </label>
                ))}
              </React.Fragment>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  const group = getGroup(value);
  const subs = group && group !== 'todos' ? SUB_LOJAS[group] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {groups.map(g => (
          <Button
            key={g}
            size="sm"
            variant={group === g ? 'default' : 'outline'}
            className={cn('rounded-full w-24 px-0 h-8 text-xs font-medium justify-center', group === g ? 'shadow-sm' : 'bg-white')}
            onClick={() => onChange(g)}
          >
            {g === 'todos' ? 'Todas Lojas' : g}
          </Button>
        ))}
      </div>
      {subs && (
        <div className="flex flex-wrap items-center gap-1 pl-1">
          <span className="text-xs text-muted-foreground mr-1">Filial:</span>
          <Button
            size="sm"
            variant={value === group ? 'default' : 'outline'}
            className={cn('rounded-full w-24 px-0 h-8 text-xs justify-center', value === group ? 'shadow-sm' : 'bg-white')}
            onClick={() => onChange(group!)}
          >
            Todas
          </Button>
          {subs.map(s => (
            <Button
              key={s}
              size="sm"
              variant={value === s ? 'default' : 'outline'}
              className={cn('rounded-full w-24 px-0 h-8 text-xs justify-center', value === s ? 'shadow-sm' : 'bg-white')}
              onClick={() => onChange(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
