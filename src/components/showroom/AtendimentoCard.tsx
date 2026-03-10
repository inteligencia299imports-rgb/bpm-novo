import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Bike, Calendar, ArrowLeftRight } from 'lucide-react';
import type { Atendimento, SituacaoShowroom } from '@/types/crm';
import { STATUS_COLORS } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  atendimento: Atendimento & { motos_interesse?: any[]; motos_avaliacao?: any[] };
  onClick: () => void;
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
  if (!motoInt?.modelo) return null;
  const parts: string[] = [];
  if (motoInt.origem !== 'externo' && motoInt.estoque_moto_id) {
    const motoAv = atendimento.motos_avaliacao?.[0];
    if (motoAv?.placa) parts.push(motoAv.placa);
  }
  parts.push(motoInt.modelo);
  return parts.join(' - ');
};

const getMotoClienteLabel = (atendimento: Props['atendimento']): string | null => {
  const motoAv = atendimento.motos_avaliacao?.[0];
  if (!motoAv) return null;
  const parts: string[] = [];
  if (motoAv.placa) parts.push(motoAv.placa);
  parts.push(`${motoAv.marca} ${motoAv.modelo}`);
  return parts.join(' - ');
};

const AtendimentoCard: React.FC<Props> = ({ atendimento, onClick }) => {
  const interesse = atendimento.interesse;
  const motoInteresse = (interesse === 'comprar' || interesse === 'trocar') ? getMotoInteresseLabel(atendimento) : null;
  const motoCliente = (interesse === 'vender' || interesse === 'trocar') ? getMotoClienteLabel(atendimento) : null;
  const statusColor = STATUS_COLORS[atendimento.situacao as SituacaoShowroom] || '#6B7280';


  return (
    <div
      className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="flex">
        {/* Status bar */}
        <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />

        <div className="flex-1 p-3 space-y-2">
          {/* Header: name + interest badge */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm text-foreground truncate">
              {atendimento.nome_cliente}
            </h3>
            <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary">
              {getInteresseLabel(atendimento.interesse)}
            </Badge>
          </div>

          {/* Moto reference */}
          {motoInteresse && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Bike className="h-3.5 w-3.5" />
              <span className="truncate">{motoInteresse}</span>
            </div>
          )}
          {motoCliente && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span className="truncate">{motoCliente}</span>
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
              {format(new Date(atendimento.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* Store badge */}
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px]">
              {atendimento.loja}
            </Badge>
            {atendimento.temperatura && (
              <Badge
                variant="secondary"
                className={`text-[10px] ${
                  atendimento.temperatura === 'Quente' ? 'bg-destructive/10 text-destructive' :
                  atendimento.temperatura === 'Morno' ? 'bg-warning/10 text-warning' :
                  'bg-info/10 text-info'
                }`}
              >
                {atendimento.temperatura}
              </Badge>
            )}
          </div>

          {/* Status change buttons */}
          {onStatusChange && availableButtons.length > 0 && (
            <div className="flex gap-1.5 pt-1 border-t border-border/50">
              {availableButtons.map(btn => (
                <Button
                  key={btn.value}
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-7 text-[10px] gap-1 px-1 hover:opacity-80"
                  style={{ color: btn.color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(atendimento.id, btn.value);
                  }}
                >
                  {btn.icon}
                  {btn.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AtendimentoCard;
