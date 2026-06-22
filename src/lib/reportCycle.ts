/**
 * Lógica de ciclos de relatório.
 *
 * Histórico:
 * - Até 20/05/2026: ciclos do dia 21 ao dia 20 do mês seguinte
 *   (ex: 21/12-20/01, 21/01-20/02, ..., 21/04-20/05).
 * - Ciclo de transição: 21/05/2026 a 30/06/2026 (estendido).
 * - A partir de 01/07/2026: ciclos mensais normais (dia 01 ao último dia do mês).
 */

const TRANSITION_START = new Date(2026, 4, 21, 0, 0, 0, 0); // 21/05/2026
const TRANSITION_END = new Date(2026, 5, 30, 23, 59, 59, 999); // 30/06/2026
const MONTHLY_START = new Date(2026, 6, 1, 0, 0, 0, 0); // 01/07/2026

export interface CycleRange {
  start: Date;
  end: Date;
}

/** Retorna o ciclo a que pertence a data informada. */
export function getCycleForDate(date: Date): CycleRange {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  // Ciclos mensais (a partir de 01/07/2026)
  if (date >= MONTHLY_START) {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // Ciclo de transição
  if (date >= TRANSITION_START && date <= TRANSITION_END) {
    return { start: new Date(TRANSITION_START), end: new Date(TRANSITION_END) };
  }

  // Ciclos legados 21 → 20
  const start = d >= 21
    ? new Date(y, m, 21, 0, 0, 0, 0)
    : new Date(y, m - 1, 21, 0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 20, 23, 59, 59, 999);
  return { start, end };
}

/** Retorna o ciclo imediatamente anterior ao que começa em `cycleStart`. */
export function getPreviousCycle(cycleStart: Date): CycleRange {
  const dayBefore = new Date(cycleStart);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(12, 0, 0, 0);
  return getCycleForDate(dayBefore);
}

/** Ciclo atual (baseado em "hoje"). */
export function getCurrentCycle(): CycleRange {
  return getCycleForDate(new Date());
}

/**
 * Data de início padrão para o filtro de "período em andamento".
 * - A partir de 01/07/2026: dia 01 do mês atual (ciclo mensal).
 * - Antes disso: dia 21 do mês atual (se hoje >= 21) ou do mês anterior.
 *   Mantém a âncora histórica do dia 21 mesmo dentro do ciclo de transição
 *   estendido, para o filtro default não retroceder demais.
 */
export function getCurrentDefaultStart(): Date {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (now >= MONTHLY_START) {
    return new Date(y, m, 1, 0, 0, 0, 0);
  }
  return d >= 21
    ? new Date(y, m, 21, 0, 0, 0, 0)
    : new Date(y, m - 1, 21, 0, 0, 0, 0);
}

/** Verifica se um intervalo arbitrário corresponde exatamente a um ciclo. */
export function isCycleAligned(from: Date, to: Date): boolean {
  const cycle = getCycleForDate(from);
  return (
    cycle.start.getFullYear() === from.getFullYear() &&
    cycle.start.getMonth() === from.getMonth() &&
    cycle.start.getDate() === from.getDate() &&
    cycle.end.getFullYear() === to.getFullYear() &&
    cycle.end.getMonth() === to.getMonth() &&
    cycle.end.getDate() === to.getDate()
  );
}
