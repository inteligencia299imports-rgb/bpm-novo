import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Bike, Phone, Calendar, User } from 'lucide-react';
import type { Avaliacao, AppRole } from '@/types/crm';
import { SITUACOES_AVALIACAO } from '@/types/crm';
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

const AvaliacaoCard: React.FC<Props> = ({ avaliacao, onOpen }) => {
  const sit = SITUACOES_AVALIACAO.find(s => s.value === avaliacao.situacao);
  const moto = avaliacao.moto_avaliacao;
  const at = avaliacao.atendimento;
  const statusColor = avaliacao.situacao === 'sem_avaliar' ? '#6B7280' : avaliacao.situacao === 'em_aberto' ? '#F2C94C' : '#27AE60';

  return (
    <div
      className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
      onClick={onOpen}
    >
      <div className="flex">
        {/* Status bar */}
        <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: statusColor }} />

        <div className="flex-1 p-3 space-y-2">
          {/* Moto info */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground truncate">
              <Bike className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{moto?.marca} {moto?.modelo}</span>
            </div>
            {moto?.placa && (
              <Badge variant="outline" className="text-[10px] shrink-0 font-mono border-primary/30 text-primary">
                {moto.placa}
              </Badge>
            )}
          </div>

          {/* Year / KM */}
          {(moto?.ano_fabricacao || moto?.km) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {moto?.ano_fabricacao && <span>{moto.ano_fabricacao}/{moto.ano_modelo}</span>}
              {moto?.km && <span>{moto.km} km</span>}
              {moto?.cor && <span>{moto.cor}</span>}
            </div>
          )}

          {/* Client */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <User className="h-3 w-3 shrink-0" />
              {at?.nome_cliente}
            </span>
            {at?.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(at.telefone)}
              </span>
            )}
          </div>

          {/* Footer: store + date */}
          <div className="flex items-center justify-between">
            {at?.loja && (
              <Badge variant="secondary" className="text-[10px]">
                {at.loja}
              </Badge>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(avaliacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvaliacaoCard;
