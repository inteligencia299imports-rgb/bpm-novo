import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { formatPersonName } from '@/lib/utils';

interface Autoria {
  nome: string | null;
  em: string;
}

/** Linha "Nome - dd/MM/yyyy HH:mm" com um separador acima. */
export const ConsultaAutoriaLinha: React.FC<{ nome?: string | null; em?: string | null; className?: string }> = ({ nome, em, className }) => {
  if (!em) return null;
  const quando = format(new Date(em), 'dd/MM/yyyy HH:mm');
  return (
    <div className={className}>
      <Separator className="mb-2" />
      <p className="text-xs text-muted-foreground">
        {[nome ? formatPersonName(nome) : null, quando].filter(Boolean).join(' - ')}
      </p>
    </div>
  );
};

/**
 * Quem disponibilizou o resultado da consulta da moto e quando: último
 * status_history 'consulta_realizada' da avaliação (gravado pela tela de
 * Consulta). Sem registro (consultas antigas) não mostra nada.
 */
const ConsultaAutoria: React.FC<{ avaliacaoId?: string | null; className?: string }> = ({ avaliacaoId, className }) => {
  const [autoria, setAutoria] = useState<Autoria | null>(null);

  useEffect(() => {
    let ativo = true;
    setAutoria(null);
    if (!avaliacaoId) return;
    supabase
      .from('status_history')
      .select('changed_by_name, created_at')
      .eq('entity_id', avaliacaoId)
      .eq('status', 'consulta_realizada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo && data) setAutoria({ nome: (data as any).changed_by_name ?? null, em: (data as any).created_at });
      });
    return () => { ativo = false; };
  }, [avaliacaoId]);

  if (!autoria) return null;
  return <ConsultaAutoriaLinha nome={autoria.nome} em={autoria.em} className={className} />;
};

export default ConsultaAutoria;
