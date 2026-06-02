import { toSaoPauloEndOfDayIso, toSaoPauloStartOfDayIso } from './reportDateRange';

const MS_DAY = 86400000;

/**
 * Calcula o período equivalente no mês anterior (mesmos dias, um mês antes).
 *
 * Ex: 21/05/2026 a 20/06/2026 -> 21/04/2026 a 20/05/2026
 */
export const getPreviousPeriod = (
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
): { prevFrom: Date | undefined; prevTo: Date | undefined } => {
  if (!dateFrom || !dateTo) return { prevFrom: undefined, prevTo: undefined };
  const prevFrom = new Date(dateFrom.getFullYear(), dateFrom.getMonth() - 1, dateFrom.getDate());
  const prevTo = new Date(dateTo.getFullYear(), dateTo.getMonth() - 1, dateTo.getDate());
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
