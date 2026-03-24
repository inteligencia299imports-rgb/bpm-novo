import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Bike, Calendar, ArrowLeftRight } from 'lucide-react';
import type { Avaliacao, AppRole } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  em_aberto: '#F2C94C',
  adquirida: '#27AE60',
  dispensada: '#FF3B30',
};

const getTipoAquisicaoLabel = (tipo: string | null) => {
  if (!tipo) return null;
  if (tipo === 'convertida') return 'Convertida';
  return tipo === 'propria' ? 'Própria' : 'Consignada';
};

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

        <div className="flex-1 p-3 space-y-2">
          {/* Header: client name + interesse badge */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm text-foreground truncate">
              {at?.nome_cliente}
            </h3>
            {at?.interesse && (
              <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary">
                {getInteresseLabel(at.interesse)}
              </Badge>
            )}
          </div>

          {/* Moto reference */}
          {motoLabel && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span className="truncate">{motoLabel}</span>
            </div>
          )}

          {/* Phone + Date */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {at?.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(at.telefone)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(avaliacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* Store badge + Tipo Aquisição */}
          <div className="flex items-center justify-between gap-2">
            {at?.loja && (
              <Badge variant="secondary" className="text-[10px]">
                {at.loja}
              </Badge>
            )}
            {avaliacao.situacao === 'adquirida' && (avaliacao as any).tipo_aquisicao && (
              <Badge variant="outline" className={`text-[10px] ${(avaliacao as any).tipo_aquisicao === 'consignada' ? 'border-purple-500 text-purple-600' : 'border-green-500 text-green-600'}`}>
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
