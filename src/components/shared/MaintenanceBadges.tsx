import React from 'react';
import { Badge } from '@/components/ui/badge';
import { BookOpen, KeyRound, Wrench } from 'lucide-react';

interface MaintenanceBadgesProps {
  temManual: boolean | null | undefined;
  temChaveReserva: boolean | null | undefined;
  manutencaoVencida: boolean | null | undefined;
  className?: string;
}

const MaintenanceBadges: React.FC<MaintenanceBadgesProps> = ({ temManual, temChaveReserva, manutencaoVencida, className = '' }) => {
  if (temManual == null && temChaveReserva == null && manutencaoVencida == null) return null;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {temManual != null && (
        <Badge variant="outline" className={`text-[10px] ${temManual ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}>
          <BookOpen className="h-3 w-3 mr-0.5" />
          Manual
        </Badge>
      )}
      {temChaveReserva != null && (
        <Badge variant="outline" className={`text-[10px] ${temChaveReserva ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}>
          <KeyRound className="h-3 w-3 mr-0.5" />
          Chave
        </Badge>
      )}
      {manutencaoVencida != null && (
        <Badge variant="outline" className={`text-[10px] ${manutencaoVencida ? 'border-red-500 text-red-600' : 'border-green-500 text-green-600'}`}>
          <Wrench className="h-3 w-3 mr-0.5" />
          Revisão
        </Badge>
      )}
    </div>
  );
};

export default MaintenanceBadges;
