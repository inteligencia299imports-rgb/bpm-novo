import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface Props {
  dataInicio: string;
  dataFim: string;
  onChange: (inicio: string, fim: string) => void;
  label?: string;
}

const NpsDateFilter: React.FC<Props> = ({ dataInicio, dataFim, onChange, label = 'Período' }) => {
  const clear = () => onChange('', '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Input
        type="date"
        value={dataInicio}
        onChange={(e) => onChange(e.target.value, dataFim)}
        className="h-8 w-[150px] text-xs bg-card border-border"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <Input
        type="date"
        value={dataFim}
        onChange={(e) => onChange(dataInicio, e.target.value)}
        className="h-8 w-[150px] text-xs bg-card border-border"
      />
      {(dataInicio || dataFim) && (
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={clear}>
          <X className="h-3 w-3 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
};

export default NpsDateFilter;
