import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Bike, Calendar, ArrowLeftRight, Thermometer } from 'lucide-react';
import type { Avaliacao, AppRole } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';

interface Props {
  avaliacao: Avaliacao;
  onOpen: () => void;
  role: AppRole | null;
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

const STATUS_HEX: Record<string, string> = {
  sem_avaliar: '#6B7280',
  em_aberto: '#2EC5FF',
  adquirida: '#169d53',
  dispensada: '#FF8C00',
  perdido: '#FF3B30',
};

// Using centralized getTipoAquisicaoLabel from lib

const AvaliacaoCard: React.FC<Props> = ({ avaliacao, onOpen }) => {
  const moto = avaliacao.moto_avaliacao;
  const at = avaliacao.atendimento;
  const statusColor = STATUS_HEX[avaliacao.situacao] || '#6B7280';

  // Build moto label: placa - marca modelo
  const motoLabel = (() => {
    if (!moto) return null;
    const parts: string[] = [];
    if (moto.placa) parts.push(moto.placa.replace(/-/g, ''));
    parts.push(`${moto.marca} ${(moto.modelo || '').toUpperCase()}`);
    return parts.join(' - ');
  })();

  return (
    <div
      className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
      onClick={onOpen}
    >
      <div className="flex">
        {/* Status bar */}
        <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />

        <div className="flex-1 p-3 space-y-2 min-w-0 overflow-hidden">
          {/* Header: client name + badges */}
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">
              {at?.cliente?.nome_razao_social}
            </h3>
            {at?.interesse && (
              <Badge variant="outline" className="text-[10px] shrink-0 whitespace-nowrap border-primary/30 text-primary">
                {getInteresseLabel(at.interesse)}
              </Badge>
            )}
          </div>

          {/* Moto reference */}
          {motoLabel && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary min-w-0">
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate min-w-0">{motoLabel}</span>
            </div>
          )}

          {/* Phone + Date */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {at?.cliente?.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(at.cliente.telefone)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(avaliacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* Store badge + temperature + tipo aquisição */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {at?.loja && (
                <Badge variant="secondary" className="text-[10px]">
                  {at.loja}
                </Badge>
              )}
              {at?.temperatura && (
                <span className={`flex items-center gap-1 text-[10px] font-medium ${
                  at.temperatura === 'Quente' ? 'text-destructive' :
                  at.temperatura === 'Morno' ? 'text-yellow-600' :
                  'text-[#2EC5FF]'
                }`}>
                  <Thermometer className="h-3 w-3" />
                  {at.temperatura}
                </span>
              )}
            </div>
            {avaliacao.situacao === 'adquirida' && (avaliacao as any).tipo_aquisicao && (
              <Badge variant="outline" className={`text-[10px] shrink-0 whitespace-nowrap ml-auto ${getTipoAquisicaoBadgeClass((avaliacao as any).tipo_aquisicao)}`}>
                {getTipoAquisicaoLabel((avaliacao as any).tipo_aquisicao)}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvaliacaoCard;
