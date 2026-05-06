import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CIDADE_LOJAS: Record<string, string[]> = {
  'Brasília': ['299i', '299s', 'Aventura', 'Ducati BSB'],
  'Florianópolis': ['299f', 'Ducati FLN'],
  'Porto Alegre': ['299p', 'Ducati POA'],
};

export type CidadeFilterValue = 'todos' | 'Brasília' | 'Florianópolis' | 'Porto Alegre';

export const matchesCidade = (loja: string | null | undefined, cidade: CidadeFilterValue): boolean => {
  if (cidade === 'todos') return true;
  if (!loja) return false;
  return CIDADE_LOJAS[cidade].includes(loja);
};

interface Props {
  value: CidadeFilterValue;
  onChange: (v: CidadeFilterValue) => void;
  className?: string;
}

const CidadeFilter: React.FC<Props> = ({ value, onChange, className }) => (
  <div className={cn('flex flex-wrap items-center gap-1', className)}>
    {(['todos', 'Brasília', 'Florianópolis', 'Porto Alegre'] as const).map(c => (
      <Button
        key={c}
        size="sm"
        variant={value === c ? 'default' : 'outline'}
        className={cn('rounded-full px-4 h-8 text-xs font-medium', value === c && 'shadow-sm')}
        onClick={() => onChange(c)}
      >
        {c === 'todos' ? 'Todas Cidades' : c}
      </Button>
    ))}
  </div>
);

export default CidadeFilter;
