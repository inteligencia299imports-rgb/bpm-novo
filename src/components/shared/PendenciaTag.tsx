import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Tag de pendências de um card na tela de emissão de NF-e.
 * Lista os campos que faltam para emitir. Sem pendências -> não renderiza nada.
 */
const PendenciaTag: React.FC<{ itens: string[]; className?: string }> = ({ itens, className }) => {
  if (!itens || itens.length === 0) return null;
  return (
    <span
      className={`inline-flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium leading-tight text-amber-700 dark:text-amber-400 ${className ?? ''}`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
      <span>Pendente p/ NF: {itens.join(', ')}</span>
    </span>
  );
};

export default PendenciaTag;
