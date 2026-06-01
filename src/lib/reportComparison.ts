import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from './reportDateRange';

const MS_DAY = 86400000;

/**
 * Calcula o período anterior ao atual mantendo a mesma quantidade de dias.
 * O período anterior termina 1 dia antes do início do período atual.
 *
 * Ex: 21/05/2026 a 20/06/2026 (31 dias) -> 20/04/2026 a 20/05/2026
 */
export const getPreviousPeriod = (
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
): { prevFrom: Date | undefined; prevTo: Date | undefined } => {
  if (!dateFrom || !dateTo) return { prevFrom: undefined, prevTo: undefined };
  const from = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate());
  const to = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate());
  const days = Math.round((to.getTime() - from.getTime()) / MS_DAY) + 1;
  const prevTo = new Date(from.getTime() - MS_DAY);
  const prevFrom = new Date(from.getTime() - days * MS_DAY);
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
  const d = new Date(date.getFullYear(), date.getMonth() - 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return d;
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
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};
