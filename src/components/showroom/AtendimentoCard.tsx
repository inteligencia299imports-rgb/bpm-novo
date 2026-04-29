import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Bike, Calendar, ArrowLeftRight, Thermometer } from 'lucide-react';
import type { Atendimento, SituacaoShowroom } from '@/types/crm';
import { STATUS_COLORS } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPlaca, formatModelo } from '@/lib/utils';


interface Props {
  atendimento: Atendimento & { motos_interesse?: any[]; motos_avaliacao?: any[] };
  onClick: () => void;
  actions?: React.ReactNode;
  statusColorOverride?: string;
  dateOverride?: string;
  readyIndicator?: 'ready' | 'not_ready' | null;
  readyReason?: string;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const getInteresseLabel = (interesse: string) => {
  switch (interesse) {
    case 'comprar': return 'Comprar';
    case 'vender': return 'Vender';
    case 'trocar': return 'Trocar';
    default: return interesse;
  }
};

const getMotoInteresseLabel = (atendimento: Props['atendimento']): string | null => {
  const motoInt = atendimento.motos_interesse?.[0];
  if (!motoInt) return null;

  // For estoque motos, use attached _estoque data
  if (motoInt.origem === 'estoque' && motoInt._estoque) {
    const est = motoInt._estoque;
    const parts: string[] = [];
    if (est.placa) parts.push(formatPlaca(est.placa)!);
    if (est.modelo) parts.push(formatModelo(est.modelo));
    return parts.join(' - ') || null;
  }

  if (!motoInt.modelo) return null;
  return formatModelo(motoInt.modelo);
};

const getMotoClienteLabel = (atendimento: Props['atendimento']): string | null => {
  const motoAv = atendimento.motos_avaliacao?.[0];
  if (!motoAv) return null;
  const parts: string[] = [];
  if (motoAv.placa) parts.push(formatPlaca(motoAv.placa)!);
  parts.push(`${motoAv.marca} ${formatModelo(motoAv.modelo)}`);
  return parts.join(' - ');
};

const AtendimentoCard: React.FC<Props> = ({ atendimento, onClick, actions, statusColorOverride, dateOverride, readyIndicator, readyReason }) => {
  const interesse = atendimento.interesse;
  const motoInteresse = (interesse === 'comprar' || interesse === 'trocar') ? getMotoInteresseLabel(atendimento) : null;
  const motoCliente = (interesse === 'vender' || interesse === 'trocar') ? getMotoClienteLabel(atendimento) : null;
  const statusColor = statusColorOverride || STATUS_COLORS[atendimento.situacao as SituacaoShowroom] || '#6B7280';


  return (
    <div
      className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="flex">
        {/* Status bar */}
        <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />

        <div className="flex-1 p-3 space-y-2 min-w-0 overflow-hidden">
          {/* Header: name + interest badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">
              {atendimento.nome_cliente}
            </h3>
            {readyIndicator && (
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${readyIndicator === 'ready' ? 'bg-green-500' : 'bg-red-500'}`}
                title={readyIndicator === 'ready' ? 'Entrega da moto concluída' : 'Entrega da moto pendente'}
              />
            )}
            <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary whitespace-nowrap">
              {getInteresseLabel(atendimento.interesse)}
            </Badge>
          </div>

          {/* Moto reference */}
          {motoInteresse && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary min-w-0">
              <Bike className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate min-w-0">{motoInteresse}</span>
            </div>
          )}
          {motoCliente && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary min-w-0">
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate min-w-0">{motoCliente}</span>
            </div>
          )}

          {/* Details */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhone(atendimento.telefone)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(dateOverride || atendimento.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* Store badge */}
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px]">
              {atendimento.loja}
            </Badge>
            {atendimento.temperatura && (
              <span className={`flex items-center gap-1 text-[10px] font-medium ${
                atendimento.temperatura === 'Quente' ? 'text-destructive' :
                atendimento.temperatura === 'Morno' ? 'text-yellow-600' :
                'text-[#2EC5FF]'
              }`}>
                <Thermometer className="h-3 w-3" />
                {atendimento.temperatura}
              </span>
            )}
          </div>

          {actions && <div className="pt-1">{actions}</div>}


        </div>
      </div>
    </div>
  );
};

export default AtendimentoCard;
