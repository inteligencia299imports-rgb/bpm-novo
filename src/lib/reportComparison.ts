import { subMonths } from 'date-fns';
import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from './reportDateRange';

/**
 * Calcula o período de comparação anterior: sempre o mesmo intervalo de dias,
 * um mês antes, independente de o período selecionado corresponder a um ciclo.
 */
export const getPreviousPeriod = (
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
): { prevFrom: Date | undefined; prevTo: Date | undefined } => {
  if (!dateFrom || !dateTo) return { prevFrom: undefined, prevTo: undefined };
  const prevFrom = subMonths(dateFrom, 1);
  const prevTo = subMonths(dateTo, 1);
  return { prevFrom, prevTo };
};

export const getPreviousPeriodIso = (dateFrom: Date | undefined, dateTo: Date | undefined) => {
  const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
  return {
    prevFromIso: toSaoPauloStartOfDayIso(prevFrom),
    prevToIso: toSaoPauloEndOfDayIso(prevTo),
  };
};

/**
 * Para o relatório de Estoque (data única): retorna o mesmo dia do mês anterior.
 */
export const getPreviousMonthDate = (date: Date | undefined): Date | undefined => {
  if (!date) return undefined;
  return subMonths(date, 1);
};

export interface DeltaInfo {
  pct: number | null; // null quando não calculável
  diff: number;
  positive: boolean;
}

export const computeDelta = (current: number | null | undefined, previous: number | null | undefined): DeltaInfo => {
  const cur = Number(current ?? 0);
  const prev = Number(previous ?? 0);
  const diff = cur - prev;
  if (!prev) {
    return { pct: cur === 0 ? 0 : null, diff, positive: diff >= 0 };
  }
  const pct = (diff / Math.abs(prev)) * 100;
  return { pct, diff, positive: diff >= 0 };
};

export const formatDeltaPct = (pct: number | null): string => {
  if (pct === null) return '—';
  if (!isFinite(pct)) return '—';
  const rounded = Math.round(pct);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
};

/**
 * Divide um payload retornado pelos RPCs `*_comparado` (colunas com sufixo
 * `_atual` / `_anterior`) em dois objetos limpos.
 */
export const splitComparado = (
  data: Record<string, unknown> | null | undefined,
): { atual: Record<string, any>; anterior: Record<string, any> } => {
  const atual: Record<string, any> = {};
  const anterior: Record<string, any> = {};
  if (!data) return { atual, anterior };
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith('_atual')) atual[key.slice(0, -6)] = value;
    else if (key.endsWith('_anterior')) anterior[key.slice(0, -9)] = value;
  }
  return { atual, anterior };
};
