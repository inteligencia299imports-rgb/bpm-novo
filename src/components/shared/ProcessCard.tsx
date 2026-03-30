import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Calendar, Bike, AlertTriangle, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface EstoqueInfo {
  status: string;
  observacoes?: string | null;
}

const ESTOQUE_STATUS_DISPLAY: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
  indisponivel: { label: 'Serviço', className: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  indisponivel_manual: { label: 'Indisponível', className: 'bg-destructive/15 text-destructive border-destructive/30', icon: <AlertTriangle className="h-3 w-3" /> },
  bloqueio_juridico: { label: 'Bloqueio Jurídico', className: 'bg-muted text-muted-foreground border-muted-foreground/30', icon: <ShieldAlert className="h-3 w-3" /> },
};

interface ProcessCardProps {
  clientName: string;
  phone?: string;
  motoLabel?: string;
  loja?: string;
  date: string;
  statusColor: string;
  extraBadge?: { label: string; className?: string };
  estoqueInfo?: EstoqueInfo | null;
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
  clientName, phone, motoLabel, loja, date, statusColor, extraBadge, estoqueInfo, onClick,
}) => {
  const estDisplay = estoqueInfo ? ESTOQUE_STATUS_DISPLAY[estoqueInfo.status] : null;

  return (
    <div
      className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />
        <div className="flex-1 p-3 space-y-2">
          <h3 className="font-semibold text-sm text-foreground">{clientName}</h3>
          {motoLabel && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Bike className="h-3.5 w-3.5 shrink-0" />
              <span>{motoLabel}</span>
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
            {loja && <Badge variant="secondary" className="text-[10px]">{loja}</Badge>}
            {extraBadge && (
              <Badge variant="outline" className={`text-[10px] ${extraBadge.className || ''}`}>
                {extraBadge.label}
              </Badge>
            )}
          </div>
          {estDisplay && (
            <div className="space-y-1">
              <Badge variant="outline" className={`text-[10px] gap-1 ${estDisplay.className}`}>
                {estDisplay.icon}
                {estDisplay.label}
              </Badge>
              {estoqueInfo?.observacoes && (
                <p className="text-[10px] italic text-muted-foreground line-clamp-2">{estoqueInfo.observacoes}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcessCard;
