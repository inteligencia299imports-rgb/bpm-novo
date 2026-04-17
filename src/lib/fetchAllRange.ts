import { supabase } from '@/lib/supabase';

const PAGE = 1000;

/**
 * Builds a query function and fetches all rows in batches of 1000 to bypass
 * Supabase's default 1000-row cap. The builder receives the supabase client
 * and must return a PostgrestFilterBuilder; range() will be applied here.
 */
export async function fetchAllRange<T = any>(
  builder: () => any,
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await builder().range(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}
