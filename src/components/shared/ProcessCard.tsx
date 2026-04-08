import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Calendar, Bike } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface EstoqueInfo {
  status: string;
  observacoes?: string | null;
}

interface ProcessCardProps {
  clientName: string;
  phone?: string;
  motoLabel?: string;
  loja?: string;
  date: string;
  statusColor: string;
  extraBadge?: { label: string; className?: string };
  readyIndicator?: 'ready' | 'not_ready' | null;
  onClick?: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const ProcessCard: React.FC<ProcessCardProps> = ({
  clientName, phone, motoLabel, loja, date, statusColor, extraBadge, readyIndicator, onClick,
}) => (
  <div
    className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
    onClick={onClick}
  >
    <div className="flex">
      <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />
      <div className="flex-1 p-3 space-y-2 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">{clientName}</h3>
          {readyIndicator && (
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${readyIndicator === 'ready' ? 'bg-green-500' : 'bg-red-500'}`}
              title={readyIndicator === 'ready' ? 'Apta para liberação' : 'Pendências para liberação'}
            />
          )}
        </div>
        {motoLabel && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary min-w-0">
            <Bike className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate min-w-0">{motoLabel}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhone(phone)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(date), 'dd/MM HH:mm', { locale: ptBR })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          {loja && (
            <Badge variant="secondary" className="text-[10px]">{loja}</Badge>
          )}
          {extraBadge && (
            <Badge variant="outline" className={`text-[10px] shrink-0 whitespace-nowrap ml-auto ${extraBadge.className || ''}`}>
              {extraBadge.label}
            </Badge>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default ProcessCard;
