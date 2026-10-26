import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Seletor com checkbox no mesmo padrão do de lojas (pedido do usuário,
// 2026-10-26): retângulo branco com o rótulo, lista com "Todos" no topo.
// Valor = lista separada por vírgula; 'todos' = sem filtro.

export interface OpcaoFiltro { value: string; label: string }

export const OPCOES_CIDADE: OpcaoFiltro[] = [
  { value: 'Brasília', label: 'Brasília' },
  { value: 'Florianópolis', label: 'Florianópolis' },
  { value: 'Porto Alegre', label: 'Porto Alegre' },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  opcoes: OpcaoFiltro[];
  /** Rótulo de "sem filtro" (ex.: "Todos os Tipos", "Todas Cidades"). */
  todosLabel: string;
  /** Plural do rótulo quando há várias marcadas (ex.: "tipos" -> "2 tipos"). */
  plural: string;
}

/** Valores marcados de um filtro ('todos' -> vazio). */
export const valoresDoFiltro = (v: string): string[] =>
  !v || v === 'todos' ? [] : v.split(',').map((s) => s.trim()).filter(Boolean);

export const FiltroMultiplo: React.FC<Props> = ({ value, onChange, opcoes, todosLabel, plural }) => {
  const marcados = valoresDoFiltro(value);
  const rotulo = marcados.length === 0 ? todosLabel
    : marcados.length === 1 ? (opcoes.find((o) => o.value === marcados[0])?.label ?? marcados[0])
    : `${marcados.length} ${plural}`;
  const alternar = (v: string, marcar: boolean) => {
    const prox = marcar ? [...new Set([...marcados, v])] : marcados.filter((m) => m !== v);
    onChange(prox.length ? opcoes.map((o) => o.value).filter((o) => prox.includes(o)).join(',') : 'todos');
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full sm:w-56 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className="truncate">{rotulo}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start">
        <label className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
          <Checkbox checked={marcados.length === 0} onCheckedChange={() => onChange('todos')} />
          {todosLabel}
        </label>
        {opcoes.map((o) => (
          <label key={o.value} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
            <Checkbox checked={marcados.includes(o.value)} onCheckedChange={(c) => alternar(o.value, c === true)} />
            {o.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export default FiltroMultiplo;
