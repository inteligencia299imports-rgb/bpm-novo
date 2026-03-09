import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Bike } from 'lucide-react';
import type { Avaliacao, AppRole } from '@/types/crm';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  avaliacao: Avaliacao;
  onOpen: () => void;
  role: AppRole | null;
}

const AvaliacaoCard: React.FC<Props> = ({ avaliacao, onOpen }) => {
  const sit = SITUACOES_AVALIACAO.find(s => s.value === avaliacao.situacao);
  const moto = avaliacao.moto_avaliacao;
  const at = avaliacao.atendimento;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Bike className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">
                {moto?.marca} {moto?.modelo}
              </h3>
              {moto?.placa && <Badge variant="outline" className="text-xs font-mono">{moto.placa}</Badge>}
              {sit && <span className={`status-badge ${sit.color}`}>{sit.label}</span>}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span>Cliente: {at?.nome_cliente}</span>
              {at?.loja && <span>Loja: {at.loja}</span>}
              {moto?.ano_fabricacao && <span>Ano: {moto.ano_fabricacao}/{moto.ano_modelo}</span>}
              {moto?.km && <span>{moto.km} km</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(avaliacao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onOpen} title="Abrir avaliação">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AvaliacaoCard;
