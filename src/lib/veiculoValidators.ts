// Validacao/normalizacao de chassi (VIN) e RENAVAM.
//
// Chassi: padrao ISO 3779 -- 17 caracteres alfanumericos, sem as letras
// I, O e Q (para nao confundir com 1 e 0). O digito verificador da posicao 9
// existe na norma, mas no Brasil nao e aplicado de forma consistente, entao
// validamos apenas formato/tamanho para nao rejeitar chassi valido.
//
// RENAVAM: 11 digitos, sendo o ultimo um digito verificador (modulo 11).
// Registros antigos tinham 9 digitos -- normalizamos preenchendo com zeros
// a esquerda ate 11 antes de validar.

export function normalizeChassi(value: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

export function normalizePlaca(value: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

export function normalizeRenavam(value: string): string {
  return (value || '').replace(/\D/g, '').slice(0, 11);
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateChassi(value: string): ValidationResult {
  const v = normalizeChassi(value);
  if (!v) return { valid: true };
  if (v.length !== 17) {
    return { valid: false, message: `Chassi deve ter 17 caracteres (tem ${v.length}).` };
  }
  if (/[IOQ]/.test(v)) {
    return { valid: false, message: 'Chassi não pode conter as letras I, O ou Q.' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) {
    return { valid: false, message: 'Chassi contém caractere inválido.' };
  }
  return { valid: true };
}

// Placa nao tem digito verificador -- so da para validar o formato:
//   - Antiga:          LLL + 4 digitos            (ABC1234)
//   - Mercosul carro:  LLL + digito + L + 2 dig.  (ABC1D23)
//   - Mercosul moto:   LLL + 2 dig. + L + digito  (ABC12D3)
const PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL_CARRO = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const PLACA_MERCOSUL_MOTO = /^[A-Z]{3}[0-9]{2}[A-Z][0-9]$/;

export function validatePlaca(value: string): ValidationResult {
  const v = normalizePlaca(value);
  if (!v) return { valid: true };
  if (v.length !== 7) {
    return { valid: false, message: `Placa deve ter 7 caracteres (tem ${v.length}).` };
  }
  if (PLACA_ANTIGA.test(v) || PLACA_MERCOSUL_CARRO.test(v) || PLACA_MERCOSUL_MOTO.test(v)) {
    return { valid: true };
  }
  return { valid: false, message: 'Formato de placa inválido (ex.: ABC1234 ou ABC1D23).' };
}

export function validateRenavam(value: string): ValidationResult {
  const digits = normalizeRenavam(value);
  if (!digits) return { valid: true };
  if (digits.length < 9) {
    return { valid: false, message: `RENAVAM deve ter 9 a 11 dígitos (tem ${digits.length}).` };
  }

  const full = digits.padStart(11, '0');
  if (/^(\d)\1{10}$/.test(full)) {
    return { valid: false, message: 'RENAVAM inválido.' };
  }

  const base = full.slice(0, 10).split('').reverse();
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const soma = base.reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;

  if (dv !== Number(full[10])) {
    return { valid: false, message: 'Dígito verificador do RENAVAM não confere.' };
  }
  return { valid: true };
}
