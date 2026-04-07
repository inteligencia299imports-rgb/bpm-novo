import { useState, useEffect } from 'react';
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

  const getMarcaNomes = () => marcas.map(m => m.nome);

  const getModelosPorMarca = (marcaNome: string) => {
    const marca = marcas.find(m => m.nome === marcaNome);
    if (!marca) return [];
    return modelos.filter(m => m.marca_id === marca.id).map(m => m.nome);
  };

  return { marcas, modelos, loading, getMarcaNomes, getModelosPorMarca };
}
