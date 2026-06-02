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

export const getCidadeFromLoja = (loja: string | null | undefined): string | null => {
  if (!loja) return null;
  for (const [cidade, lojas] of Object.entries(CIDADE_LOJAS)) {
    if (lojas.includes(loja)) return cidade;
  }
  return null;
};

export const LOJA_SIGLA: Record<string, string> = {
  '299i': 'BSB', '299s': 'BSB', 'Aventura': 'BSB', 'Ducati BSB': 'BSB',
  '299f': 'FLN', 'Ducati FLN': 'FLN',
  '299p': 'POA', 'Ducati POA': 'POA',
};

export const getSiglaFromLoja = (loja: string | null | undefined): string | null => {
  if (!loja) return null;
  return LOJA_SIGLA[loja] || null;
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
