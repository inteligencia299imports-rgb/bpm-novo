import React from 'react';
import { ChevronDown } from 'lucide-react';
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

  // Uma opção só (relatórios que mandam a loja pra RPC): mesmo seletor
  // retangular, mas marcar algo desmarca o resto (todas / grupo / loja).
  const rotuloUnico = value === 'todos' ? 'Todas Lojas' : value;
  const linha = (v: string, texto: string, cls: string) => (
    <label key={v} className={cn('flex items-center gap-2 rounded-sm py-1.5 text-sm cursor-pointer hover:bg-muted', cls)}>
      <Checkbox checked={value === v} onCheckedChange={() => onChange(v)} />
      {texto}
    </label>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full sm:w-56 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className="truncate">{rotuloUnico}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start">
        {linha('todos', 'Todas Lojas', 'px-2')}
        {groups.filter((g) => g !== 'todos').map((g) => (
          <React.Fragment key={g}>
            {linha(g, g, 'px-2 font-medium')}
            {SUB_LOJAS[g as '299' | 'Ducati'].map((u) => linha(u, u, 'pl-8 pr-2 text-muted-foreground'))}
          </React.Fragment>
        ))}
      </PopoverContent>
    </Popover>
  );
};
