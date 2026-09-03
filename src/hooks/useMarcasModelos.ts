import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Marca {
  id: string;
  nome: string;
}

interface Modelo {
  id: string;
  marca_id: string;
  nome: string;
}

export function useMarcasModelos() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch all modelos in pages to bypass the 1000-row default limit
      const { data: marcasData } = await supabase.from('marcas_motos').select('id, nome').order('nome');

      let allModelos: Modelo[] = [];
      let from = 0;
      const pageSize = 1000;
      let keepFetching = true;

      while (keepFetching) {
        const { data } = await supabase
          .from('modelos_motos')
          .select('id, marca_id, nome')
          .order('nome')
          .range(from, from + pageSize - 1);

        if (data && data.length > 0) {
          allModelos = [...allModelos, ...data];
          from += pageSize;
          if (data.length < pageSize) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }

      setMarcas(marcasData || []);
      setModelos(allModelos);
      setLoading(false);
    };
    fetchData();
  }, []);

  const marcaById = useMemo(() => {
    const m = new Map<string, Marca>();
    marcas.forEach((x) => m.set(x.id, x));
    return m;
  }, [marcas]);

  const modeloById = useMemo(() => {
    const m = new Map<string, Modelo>();
    modelos.forEach((x) => m.set(x.id, x));
    return m;
  }, [modelos]);

  const modelosByMarcaId = useMemo(() => {
    const m = new Map<string, Modelo[]>();
    modelos.forEach((x) => {
      const arr = m.get(x.marca_id) ?? [];
      arr.push(x);
      m.set(x.marca_id, arr);
    });
    return m;
  }, [modelos]);

  // ---- acessores por id (novo padrão) ----
  const getModelosByMarcaId = useCallback(
    (marcaId: string | null | undefined) => (marcaId ? modelosByMarcaId.get(marcaId) ?? [] : []),
    [modelosByMarcaId],
  );
  const nomeMarcaId = useCallback((id: string | null | undefined) => (id ? marcaById.get(id)?.nome ?? '' : ''), [marcaById]);
  const nomeModeloId = useCallback((id: string | null | undefined) => (id ? modeloById.get(id)?.nome ?? '' : ''), [modeloById]);
  const marcaIdByNome = useCallback(
    (nome: string | null | undefined) =>
      marcas.find((m) => m.nome.trim().toUpperCase() === (nome ?? '').trim().toUpperCase())?.id ?? null,
    [marcas],
  );

  // ---- acessores por nome (legado, ainda usados em telas não migradas) ----
  const getMarcaNomes = () => marcas.map((m) => m.nome);
  const getModelosPorMarca = (marcaNome: string) => {
    const marca = marcas.find((m) => m.nome === marcaNome);
    if (!marca) return [];
    return modelos.filter((m) => m.marca_id === marca.id).map((m) => m.nome);
  };

  return {
    marcas,
    modelos,
    loading,
    getMarcaNomes,
    getModelosPorMarca,
    getModelosByMarcaId,
    nomeMarcaId,
    nomeModeloId,
    marcaIdByNome,
  };
}
