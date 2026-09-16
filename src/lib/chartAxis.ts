/**
 * Rótulo do eixo X dos gráficos de barra/linha dos Relatórios: horizontal
 * quando cabe, diagonal só quando não cabe (evita cortar/ocultar nomes).
 *
 * Não dá pra medir a largura real disponível do Recharts sem DOM — a
 * decisão é por quantidade de barras (limite mais baixo no mobile, onde o
 * card é mais estreito).
 */
export interface XTickStyle {
  tick: { fontSize: number; fill: string; angle?: -35; textAnchor?: 'end'; dy?: number };
  /** Espaço extra embaixo do gráfico — só precisa quando o rótulo está na diagonal. */
  marginBottom: number;
}

export function getXTickStyle(dataLength: number, isMobile: boolean, baseFontSize = 9): XTickStyle {
  const limiteHorizontal = isMobile ? 4 : 7;
  const diagonal = dataLength > limiteHorizontal;
  const fontSize = isMobile ? Math.max(baseFontSize - 1, 8) : baseFontSize;
  if (!diagonal) {
    return { tick: { fontSize, fill: 'hsl(var(--foreground))' }, marginBottom: 0 };
  }
  return {
    tick: { fontSize, fill: 'hsl(var(--foreground))', angle: -35, textAnchor: 'end', dy: 5 },
    marginBottom: 40,
  };
}
