import { supabase } from '@/lib/supabase';

/** Remove o arquivo do CRLV do storage (todas as extensões possíveis). */
export async function removerCrlvDoStorage(avaliacaoId: string): Promise<void> {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  await supabase.storage.from('moto-fotos').remove(exts.map((e) => `docs/${avaliacaoId}/crlv.${e}`));
}
