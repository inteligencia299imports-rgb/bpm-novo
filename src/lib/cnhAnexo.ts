import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface CnhExtracaoResultado {
  extraido: boolean;
  match?: boolean;
  motivo?: string;
  nome?: string | null;
  cpf?: string | null;
  atualizou_cpf?: boolean;
  rg?: string | null;
  atualizou_rg?: boolean;
  data_nascimento?: string | null;
  atualizou_nascimento?: boolean;
  divergencias?: string[];
}

/** Remove o arquivo da CNH do storage (todas as extensões possíveis). */
export async function removerCnhDoStorage(bucketPath: string): Promise<void> {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  await supabase.storage.from('moto-fotos').remove(exts.map((e) => `${bucketPath}.${e}`));
}

/**
 * Grava a linha de CNH em clientes_fornecedores_documentos por upsert (chave
 * cliente_fornecedor_id + tipo_documento), em vez de decidir insert-ou-update
 * a partir de um docId guardado localmente na tela — várias telas anexam CNH
 * (AtendimentoDetail, AvaliacaoForm, ClienteEditDialog...) e cada uma tem seu
 * próprio estado; se uma tela não sabe do doc criado por outra, um insert
 * "às cegas" duplica a linha e quebra a leitura seguinte (.maybeSingle() com
 * mais de uma linha). O upsert é sempre seguro, não importa quem criou antes.
 * Retorna o id da linha, ou null se a gravação falhar.
 */
export async function upsertCnhDoc(clienteId: string, url: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clientes_fornecedores_documentos')
    .upsert(
      { cliente_fornecedor_id: clienteId, tipo_documento: 'cnh', arquivo_url: url },
      { onConflict: 'cliente_fornecedor_id,tipo_documento' },
    )
    .select('id')
    .single();
  if (error) {
    console.error('upsertCnhDoc error', error);
    return null;
  }
  return data?.id || null;
}

/**
 * Processa uma CNH recém-anexada: chama a extração via IA, confere se o nome
 * bate com o cliente e — se bater — atualiza nome (e CPF, quando o cliente
 * não tem CPF cadastrado). Se NÃO bater, faz rollback do anexo e avisa.
 *
 * Retorna `true` se a CNH foi aceita, `false` se foi rejeitada (rollback feito).
 */
export async function processarCnhAnexada(params: {
  clienteId: string;
  url: string;
  bucketPath: string;
  /** desfaz o anexo no app (limpar estado + apagar o doc row) */
  rollback: () => Promise<void>;
}): Promise<{ aceita: boolean; resultado: CnhExtracaoResultado | null }> {
  const { clienteId, url, bucketPath, rollback } = params;
  const toastId = toast.loading('Conferindo a CNH…');
  try {
    const { data, error } = await supabase.functions.invoke('extrair-dados-cnh', {
      body: { cliente_id: clienteId, url },
    });

    if (error || !data) {
      // Extração é best-effort: se a função falhar, mantém o anexo — mas avisa que não deu pra validar.
      toast.warning('Não foi possível validar a CNH automaticamente. Anexo mantido — confira nome e CPF do cliente manualmente.', { id: toastId });
      return { aceita: true, resultado: null };
    }

    const res = data as CnhExtracaoResultado;

    if (res.match === false) {
      await removerCnhDoStorage(bucketPath);
      await rollback();
      toast.error(res.motivo || 'A CNH anexada não parece ser do cliente. Anexo removido.', { id: toastId });
      return { aceita: false, resultado: res };
    }

    if (res.extraido) {
      const campos = ['nome'];
      if (res.atualizou_cpf) campos.push('CPF');
      if (res.atualizou_rg) campos.push('RG');
      if (res.atualizou_nascimento || res.data_nascimento) campos.push('data de nascimento');
      const lista = campos.length === 1 ? campos[0] : `${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}`;
      toast.success(`CNH conferida — ${lista} do cliente ${campos.length > 1 ? 'atualizados' : 'atualizado'}`, { id: toastId });
      if (res.divergencias?.length) {
        toast.warning(`CNH: ${res.divergencias.join('; ')}. Ajuste manualmente se necessário.`);
      }
    } else {
      toast.warning('Não foi possível validar a CNH automaticamente. Anexo mantido — confira nome e CPF do cliente manualmente.', { id: toastId });
    }
    return { aceita: true, resultado: res };
  } catch {
    toast.warning('Não foi possível validar a CNH automaticamente. Anexo mantido — confira nome e CPF do cliente manualmente.', { id: toastId });
    return { aceita: true, resultado: null };
  }
}
