import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { DATA_INICIO_RELATORIOS } from '@/lib/reportCycle';

// Período (Data Início / Data Fim) na mesma linha dos demais filtros, em
// retângulo branco igual aos seletores (pedido do usuário, 2026-10-26).
// Relatórios só mostram dados a partir de 01/09/2026 (ver reportCycle.ts).

interface Props {
  dateFrom?: Date;
  dateTo?: Date;
  setDateFrom: (d: Date | undefined) => void;
  setDateTo: (d: Date | undefined) => void;
}

const CAIXA = 'flex h-9 w-full sm:w-40 min-w-0 items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export const PeriodoFilter: React.FC<Props> = ({ dateFrom, dateTo, setDateFrom, setDateTo }) => {
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 59, 999);
  const foraDoIntervalo = (d: Date) => d < DATA_INICIO_RELATORIOS || d > fimHoje;
  return (
    <div className="flex w-full sm:w-auto items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(CAIXA, !dateFrom && 'text-muted-foreground')}>
            <CalendarIcon className="h-4 w-4 opacity-60 shrink-0" />
            <span className="truncate">{dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data Início'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} disabled={foraDoIntervalo} locale={ptBR} className="p-3 pointer-events-auto" defaultMonth={dateFrom ?? DATA_INICIO_RELATORIOS} />
        </PopoverContent>
      </Popover>
      <span className="text-sm text-muted-foreground shrink-0">até</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(CAIXA, !dateTo && 'text-muted-foreground')}>
            <CalendarIcon className="h-4 w-4 opacity-60 shrink-0" />
            <span className="truncate">{dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data Fim'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={dateTo} onSelect={setDateTo} disabled={(d: Date) => foraDoIntervalo(d) || (dateFrom ? d < dateFrom : false)} locale={ptBR} className="p-3 pointer-events-auto" defaultMonth={dateTo ?? DATA_INICIO_RELATORIOS} />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PeriodoFilter;
