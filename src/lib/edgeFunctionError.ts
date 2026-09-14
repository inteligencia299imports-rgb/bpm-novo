import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * `supabase.functions.invoke` só devolve "Edge Function returned a non-2xx
 * status code" em `error.message` — o corpo JSON de erro que a function
 * devolveu (ex.: `{ error: "..." }`) fica em `error.context` (a Response),
 * sem ler automaticamente. Usa isso pra extrair a mensagem real.
 */
export async function extrairErroFuncao(error: unknown, fallback = 'Erro ao chamar a função'): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return body?.error || body?.message || JSON.stringify(body);
    } catch {
      try {
        const text = await error.context.text();
        if (text) return text;
      } catch { /* ignora */ }
    }
  }
  return (error as any)?.message || fallback;
}
