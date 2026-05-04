import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LojaFilterProps {
  value: string;
  onChange: (loja: string) => void;
}

const SUB_LOJAS: Record<string, string[]> = {
  '299': ['299i', '299s', 'Aventura'],
  Ducati: ['Ducati BSB', 'Ducati FLN', 'Ducati POA'],
};

const getGroup = (v: string): 'todos' | '299' | 'Ducati' | null => {
  if (v === 'todos') return 'todos';
  if (v === '299' || SUB_LOJAS['299'].includes(v)) return '299';
  if (v === 'Ducati' || SUB_LOJAS.Ducati.includes(v)) return 'Ducati';
  return null;
};

export const LojaFilter: React.FC<LojaFilterProps> = ({ value, onChange }) => {
  const group = getGroup(value);
  const subs = group && group !== 'todos' ? SUB_LOJAS[group] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {(['todos', '299', 'Ducati'] as const).map(g => (
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
