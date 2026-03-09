import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Phone, MapPin, ShoppingCart, Tag } from 'lucide-react';
import type { Atendimento } from '@/types/crm';
import type { AppRole } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  atendimento: Atendimento;
  onEdit: () => void;
  role: AppRole | null;
}

const AtendimentoCard: React.FC<Props> = ({ atendimento, onEdit, role }) => {
  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{atendimento.nome_cliente}</h3>
              <Badge variant="outline" className="text-xs">{atendimento.loja}</Badge>
              {sit && <span className={`status-badge ${sit.color}`}>{sit.label}</span>}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {atendimento.telefone}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {atendimento.uf}
              </span>
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3.5 w-3.5" />
                {int?.label}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {atendimento.tipo_atendimento}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AtendimentoCard;
