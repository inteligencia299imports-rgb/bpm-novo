// Sexo do cliente: gravado SEMPRE em minúsculo ('masculino' / 'feminino') —
// padrão de todos os sistemas (crm-novo, sisfin, ofc, bpm-novo), garantido
// também pela trigger trg_normaliza_sexo_cliente em clientes_fornecedores.
// A tela mostra com inicial maiúscula (rotuloSexo).

/** Valor para gravar: 'masculino' | 'feminino' | null (aceita "M", "Masculino"...). */
export function sexoParaGravar(v: unknown): 'masculino' | 'feminino' | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.startsWith('m')) return 'masculino';
  if (s.startsWith('f')) return 'feminino';
  return null;
}

/** Rótulo para exibir: 'Masculino' | 'Feminino' | undefined. */
export function rotuloSexo(v: unknown): 'Masculino' | 'Feminino' | undefined {
  const s = sexoParaGravar(v);
  if (s === 'masculino') return 'Masculino';
  if (s === 'feminino') return 'Feminino';
  return undefined;
}
