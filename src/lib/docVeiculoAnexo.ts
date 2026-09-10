import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export type DocVeiculoTipo = 'atpv' | 'procuracao';

const ROTULO: Record<DocVeiculoTipo, string> = { atpv: 'ATPV-e', procuracao: 'Procuração' };

/** Remove o arquivo de um documento do bucket `moto-fotos` (todas as extensões). */
export async function removerDocDoStorage(bucketPath: string): Promise<void> {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  await supabase.storage.from('moto-fotos').remove(exts.map((e) => `${bucketPath}.${e}`));
}

/**
 * Confere, via IA, se o ATPV-e / Procuração anexado é realmente daquela moto.
 * Retorna `{ ok }`: `ok=false` só quando a IA tem CERTEZA de que é o documento
 * errado ou de outra moto (aí o chamador deve desfazer o anexo). Conferência
 * inconclusiva (`match=null`) mantém o anexo, só avisa. Nunca lança.
 */
export async function conferirDocVeiculo(
  avaliacaoId: string,
  url: string,
  tipo: DocVeiculoTipo,
): Promise<{ ok: boolean }> {
  const rotulo = ROTULO[tipo];
  const toastId = toast.loading(`Conferindo o ${rotulo}…`);
  try {
    const { data, error } = await supabase.functions.invoke('extrair-dados-doc-veiculo', {
      body: { avaliacao_id: avaliacaoId, url, tipo },
    });
    if (error || !data) {
      toast.warning(`Não foi possível conferir o ${rotulo} automaticamente — verifique manualmente.`, { id: toastId });
      return { ok: true };
    }
    if (data.match === false) {
      toast.error(data.motivo || `O ${rotulo} não é desta moto. Anexo removido.`, { id: toastId });
      return { ok: false };
    }
    if (data.match === null) {
      toast.warning(data.motivo || `Não foi possível confirmar que o ${rotulo} é desta moto — verifique manualmente.`, { id: toastId });
      return { ok: true };
    }
    toast.success(`${rotulo} conferido`, { id: toastId });
    return { ok: true };
  } catch {
    toast.warning(`Não foi possível conferir o ${rotulo} automaticamente — verifique manualmente.`, { id: toastId });
    return { ok: true };
  }
}
