/** Valida CPF pelos dígitos verificadores. Espera só dígitos (11). */
export function validarCpf(valor: string): boolean {
  const cpf = (valor || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

  const dv = (base: string) => {
    let soma = 0;
    let peso = base.length + 1;
    for (const c of base) {
      soma += Number(c) * peso;
      peso--;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = dv(cpf.slice(0, 9));
  const dv2 = dv(cpf.slice(0, 9) + dv1);
  return cpf.slice(9) === `${dv1}${dv2}`;
}
