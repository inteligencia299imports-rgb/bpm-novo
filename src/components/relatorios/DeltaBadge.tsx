import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeDelta, formatDeltaPct } from '@/lib/reportComparison';

interface Props {
  current: number | null | undefined;
  previous: number | null | undefined;
  /** Quando true, queda é positiva (ex: tempo de preparação) */
  invert?: boolean;
  className?: string;
}

const DeltaBadge: React.FC<Props> = ({ current, previous, invert = false, className }) => {
  // Não exibe quando não há período anterior carregado
  if (previous === undefined || previous === null) return null;
  const { pct, diff } = computeDelta(current, previous);
  if (pct === null) return null;
  const isUp = diff > 0;
  const isFlat = diff === 0;
  const goodWhenUp = !invert;
  const isGood = isFlat ? true : (isUp ? goodWhenUp : !goodWhenUp);
  const color = isFlat
    ? 'text-muted-foreground bg-muted'
    : isGood
      ? 'text-[#3a8f6a] bg-[#3a8f6a]/10'
      : 'text-red-500 bg-red-500/10';
  const Icon = isFlat ? Minus : (isUp ? ArrowUpRight : ArrowDownRight);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        color,
        className,
      )}
      title={`Período anterior: ${previous ?? 0}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {formatDeltaPct(pct)}
    </span>
  );
};

export default DeltaBadge;
