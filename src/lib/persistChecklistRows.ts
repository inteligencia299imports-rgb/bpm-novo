import { supabase } from '@/lib/supabase';

type ChecklistTable = 'pos_compra_processos' | 'pos_venda_processos' | 'consignacao_processos';

type ChecklistRow = {
  id?: string;
  etapa: string;
  concluida: boolean;
  data_conclusao: string | null;
} & Record<string, string | boolean | null | undefined>;

interface PersistChecklistRowsParams<T extends ChecklistRow> {
  table: ChecklistTable;
  rows: T[];
}

export const persistChecklistRows = async <T extends ChecklistRow>({
  table,
  rows,
}: PersistChecklistRowsParams<T>) => {
  const rowsToUpdate = rows.filter((row): row is T & { id: string } => Boolean(row.id));
  const rowsToInsert = rows
    .filter((row) => !row.id)
    .map(({ id, ...row }) => row);

  if (rowsToUpdate.length > 0) {
    const updateResults = await Promise.all(
      rowsToUpdate.map(({ id, ...row }) =>
        supabase
          .from(table as any)
          .update(row as any)
          .eq('id', id),
      ),
    );

    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) {
      return { error: updateError };
    }
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from(table as any).insert(rowsToInsert as any);
    if (error) {
      return { error };
    }
  }

  return { error: null };
};