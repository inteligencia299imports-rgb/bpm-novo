import React from 'react';
import { Button } from '@/components/ui/button';
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
    // Grupos "abertos": os que têm alguma loja marcada. As lojas só aparecem
    // pra esses grupos (em "Todas Lojas" nada aparece) — pedido do usuário, 2026-10-20.
    const gruposAbertos = (['299', 'Ducati'] as const).filter((g) => SUB_LOJAS[g].some((l) => selecionadas.includes(l)));
    const grupoAtivo = (g: 'todos' | '299' | 'Ducati') =>
      g === 'todos' ? value === 'todos' : gruposAbertos.includes(g);
    const aplicar = (prox: string[]) => {
      if (prox.length === 0 || mesmoConjunto(prox, todasLojas)) return onChange('todos');
      if (mesmoConjunto(prox, SUB_LOJAS['299'])) return onChange('299');
      if (mesmoConjunto(prox, SUB_LOJAS.Ducati)) return onChange('Ducati');
      onChange(todasLojas.filter((l) => prox.includes(l)).join(','));
    };
    const alternar = (loja: string) =>
      aplicar(selecionadas.includes(loja) ? selecionadas.filter((l) => l !== loja) : [...selecionadas, loja]);
    // Grupo: abre somando as lojas dele à seleção (dá pra combinar 299 + Ducati);
    // clicar de novo num grupo aberto tira as lojas dele.
    const clicarGrupo = (g: 'todos' | '299' | 'Ducati') => {
      if (g === 'todos') return onChange('todos');
      if (gruposAbertos.includes(g)) return aplicar(selecionadas.filter((l) => !SUB_LOJAS[g].includes(l)));
      aplicar([...selecionadas, ...SUB_LOJAS[g]]);
    };
    const lojasVisiveis = todasLojas.filter((l) => gruposAbertos.some((g) => SUB_LOJAS[g].includes(l)));
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {groups.map(g => (
            <Button
              key={g}
              size="sm"
              variant={grupoAtivo(g) ? 'default' : 'outline'}
              className={cn('rounded-full px-4 h-8 text-xs font-medium', grupoAtivo(g) && 'shadow-sm')}
              onClick={() => clicarGrupo(g)}
            >
              {g === 'todos' ? 'Todas Lojas' : g}
            </Button>
          ))}
        </div>
        {lojasVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pl-1">
          <span className="text-xs text-muted-foreground mr-1">Lojas:</span>
          {lojasVisiveis.map(s => {
            const ativa = selecionadas.includes(s);
            return (
              <Button
                key={s}
                size="sm"
                variant={ativa ? 'default' : 'outline'}
                className={cn('rounded-full px-3 h-7 text-xs', ativa && 'shadow-sm')}
                onClick={() => alternar(s)}
              >
                {s}
              </Button>
            );
          })}
        </div>
        )}
      </div>
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
            className={cn('rounded-full px-4 h-8 text-xs font-medium', group === g && 'shadow-sm')}
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
            className={cn('rounded-full px-3 h-7 text-xs', value === group && 'shadow-sm')}
            onClick={() => onChange(group!)}
          >
            Todas
          </Button>
          {subs.map(s => (
            <Button
              key={s}
              size="sm"
              variant={value === s ? 'default' : 'outline'}
              className={cn('rounded-full px-3 h-7 text-xs', value === s && 'shadow-sm')}
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
