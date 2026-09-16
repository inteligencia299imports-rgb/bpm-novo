/**
 * Lógica de ciclos de relatório.
 *
 * Relatórios só mostram dados a partir de 01/09/2026, em ciclos de mês
 * calendário fechado (dia 01 ao último dia do mês) — sem os ciclos legados
 * de 21 a 20 usados antes disso.
 */

export const DATA_INICIO_RELATORIOS = new Date(2026, 8, 1, 0, 0, 0, 0); // 01/09/2026

export interface CycleRange {
  start: Date;
  end: Date;
}

/** Retorna o mês calendário (dia 01 ao último dia) a que a data informada pertence. */
export function getCycleForDate(date: Date): CycleRange {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Ciclo atual (baseado em "hoje"). */
export function getCurrentCycle(): CycleRange {
  return getCycleForDate(new Date());
}

/** Data de início padrão para o filtro de "período em andamento": dia 01 do mês atual. */
export function getCurrentDefaultStart(): Date {
  return getCycleForDate(new Date()).start;
}
