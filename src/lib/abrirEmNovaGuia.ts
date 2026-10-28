// Abre uma aba do BPM em nova guia do navegador, usando os deep links que o
// Dashboard lê da URL (?tab=...&atendimento=... / &avaliacao=...).
export const abrirEmNovaGuia = (tab: string, params: Record<string, string | null | undefined> = {}) => {
  const qs = new URLSearchParams({ tab });
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  window.open(`${window.location.origin}/?${qs.toString()}`, '_blank', 'noopener');
};
