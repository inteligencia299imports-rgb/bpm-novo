import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, MapPin, ShoppingCart, Tag, Bike } from 'lucide-react';
import type { Atendimento } from '@/types/crm';
import { INTERESSES } from '@/types/crm';
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

const getMotoLabel = (atendimento: Props['atendimento']): string | null => {
  const interesse = atendimento.interesse;
  const label = interesse === 'comprar' ? 'Comprar' : interesse === 'vender' ? 'Vender' : 'Trocar';
  const motoInt = atendimento.motos_interesse?.[0];
  const motoAv = atendimento.motos_avaliacao?.[0];

  // Sempre prioriza moto de interesse (compra)
  if (motoInt?.modelo) {
    if (motoInt.origem === 'estoque' && motoAv?.placa) {
      return `${label} - ${motoAv.placa} - ${motoInt.modelo}`;
    }
    return `${label} - ${motoInt.modelo}`;
  }

  // Se for apenas vender, mostra moto do cliente
  if (interesse === 'vender' && motoAv) {
    const parts = [label, motoAv.placa, motoAv.modelo].filter(Boolean);
    return parts.join(' - ');
  }

  return label;
};

const AtendimentoCard: React.FC<Props> = ({ atendimento, onClick }) => {
  const int = INTERESSES.find(i => i.value === atendimento.interesse);
  const motoLabel = getMotoLabel(atendimento);

  return (
    <Card
      className="hover:shadow-md transition-all cursor-pointer hover:border-primary/30 group"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm truncate">{atendimento.nome_cliente}</h3>
            <Badge variant="outline" className="text-[10px] shrink-0">{atendimento.loja}</Badge>
          </div>
          {motoLabel && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Bike className="h-3 w-3" />
              <span className="truncate">{motoLabel}</span>
            </div>
          )}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              {formatPhone(atendimento.telefone)}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {atendimento.uf}
              </span>
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {int?.label}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {atendimento.tipo_atendimento}
              </span>
            </div>
          </div>
          {atendimento.temperatura && (
            <Badge
              variant="secondary"
              className={`text-[10px] ${
                atendimento.temperatura === 'Quente' ? 'bg-destructive/15 text-destructive' :
                atendimento.temperatura === 'Morno' ? 'bg-warning/15 text-warning' :
                'bg-info/15 text-info'
              }`}
            >
              {atendimento.temperatura}
            </Badge>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AtendimentoCard;
