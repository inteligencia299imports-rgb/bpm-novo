import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface Props {
  dateFrom?: Date;
  dateTo?: Date;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
}

const NpsDateFilter: React.FC<Props> = ({ dateFrom, dateTo, onChange }) => (
  <div className="flex items-center gap-2">
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0',
            !dateFrom && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data Início'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={dateFrom}
          onSelect={(d) => onChange(d, dateTo)}
          locale={ptBR}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
    <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">até</span>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'rounded-full h-9 px-4 text-sm font-normal whitespace-nowrap shrink-0',
            !dateTo && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data Fim'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={dateTo}
          onSelect={(d) => onChange(dateFrom, d)}
          locale={ptBR}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  </div>
);

export default NpsDateFilter;
