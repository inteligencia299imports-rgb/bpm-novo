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
      const [{ data: marcasData }, { data: modelosData }] = await Promise.all([
        supabase.from('marcas_motos').select('id, nome').order('nome'),
        supabase.from('modelos_motos').select('id, marca_id, nome').order('nome'),
      ]);
      setMarcas(marcasData || []);
      setModelos(modelosData || []);
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
