import { describe, it, expect } from "vitest";
import {
  normalizeChassi,
  normalizeRenavam,
  normalizePlaca,
  validateChassi,
  validateRenavam,
  validatePlaca,
} from "@/lib/veiculoValidators";

describe("normalizeChassi", () => {
  it("uppercases e remove separadores", () => {
    expect(normalizeChassi(" 9c2-kc08.00lr/000001 ")).toBe("9C2KC0800LR000001");
  });
  it("limita a 17 caracteres", () => {
    expect(normalizeChassi("9C2KC0800LR000001XYZ")).toHaveLength(17);
  });
});

describe("validateChassi", () => {
  it("aceita vazio (campo opcional)", () => {
    expect(validateChassi("").valid).toBe(true);
  });
  it("aceita 17 caracteres válidos", () => {
    expect(validateChassi("9C2KC0800LR000001").valid).toBe(true);
  });
  it("rejeita tamanho diferente de 17", () => {
    expect(validateChassi("9C2KC0800LR00001").valid).toBe(false);
  });
  it("rejeita I, O ou Q", () => {
    expect(validateChassi("9C2KC0800LO000001").valid).toBe(false);
  });
});

describe("normalizePlaca", () => {
  it("uppercases, remove separadores e limita a 7", () => {
    expect(normalizePlaca("abc-1d23")).toBe("ABC1D23");
    expect(normalizePlaca("abc12345")).toBe("ABC1234");
  });
});

describe("validatePlaca", () => {
  it("aceita vazio (campo opcional)", () => {
    expect(validatePlaca("").valid).toBe(true);
  });
  it("aceita placa antiga LLLNNNN", () => {
    expect(validatePlaca("ABC1234").valid).toBe(true);
  });
  it("aceita Mercosul carro LLLNLNN", () => {
    expect(validatePlaca("ABC1D23").valid).toBe(true);
  });
  it("aceita Mercosul moto LLLNNLN", () => {
    expect(validatePlaca("ABC12D3").valid).toBe(true);
  });
  it("rejeita formatos inválidos", () => {
    expect(validatePlaca("AB12345").valid).toBe(false);
    expect(validatePlaca("1234ABC").valid).toBe(false);
    expect(validatePlaca("ABCD123").valid).toBe(false);
    expect(validatePlaca("ABC123").valid).toBe(false);
  });
});

describe("normalizeRenavam", () => {
  it("mantém apenas dígitos e limita a 11", () => {
    expect(normalizeRenavam("006-360.356/97")).toBe("00636035697");
    expect(normalizeRenavam("123456789012345")).toBe("12345678901");
  });
});

describe("validateRenavam", () => {
  it("aceita vazio (campo opcional)", () => {
    expect(validateRenavam("").valid).toBe(true);
  });
  it("valida o dígito verificador (mod 11)", () => {
    expect(validateRenavam("00636035697").valid).toBe(true);
    expect(validateRenavam("79072338363").valid).toBe(true);
  });
  it("rejeita dígito verificador errado", () => {
    expect(validateRenavam("00636035691").valid).toBe(false);
    expect(validateRenavam("64744087724").valid).toBe(false);
  });
  it("aceita RENAVAM antigo de 9 dígitos completando com zeros", () => {
    // 636035697 -> 00636035697
    expect(validateRenavam("636035697").valid).toBe(true);
  });
  it("rejeita dígitos repetidos e comprimento inválido", () => {
    expect(validateRenavam("11111111111").valid).toBe(false);
    expect(validateRenavam("12345").valid).toBe(false);
  });
});
