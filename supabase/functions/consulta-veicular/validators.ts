// Placa antiga: LLLNNNN (3 letras + 4 numeros).
// Placa Mercosul: LLLNLNN (3 letras + 1 numero + 1 letra + 2 numeros).
const PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function normalizarPlaca(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

export function placaValida(raw: string): boolean {
  const placa = normalizarPlaca(raw);
  return PLACA_ANTIGA.test(placa) || PLACA_MERCOSUL.test(placa);
}
