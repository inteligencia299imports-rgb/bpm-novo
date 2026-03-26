import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Calendar, Send, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SituacaoNps } from '@/types/crm';

interface NpsCardProps {
  title: string;
  subtitle: string;
  loja?: string;
  date?: string;
  npsStatus: SituacaoNps;
  onUpdateStatus: (status: SituacaoNps) => void;
  onClick?: () => void;
  accentColor: string;
  badge?: string;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const NpsCard: React.FC<NpsCardProps> = ({ title, subtitle, loja, date, npsStatus, onUpdateStatus, accentColor, badge }) => {
  const isPhone = /^\d{10,11}$/.test(subtitle.replace(/\D/g, ''));

  return (
    <Card className="hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: accentColor }}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-foreground truncate">{title}</span>
          <div className="flex gap-1 shrink-0">
            {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
            {loja && <Badge variant="outline" className="text-[10px]">{loja}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isPhone ? (
            <>
              <Phone className="h-3 w-3" />
              {formatPhone(subtitle)}
            </>
          ) : (
            <span className="truncate">{subtitle}</span>
          )}
        </div>

        {date && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
        )}

        <div className="flex gap-1.5 pt-1">
          {npsStatus === 'em_aberto' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={() => onUpdateStatus('enviado')}>
              <Send className="h-3 w-3" /> Marcar Enviado
            </Button>
          )}
          {npsStatus === 'enviado' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={() => onUpdateStatus('respondido')}>
              <CheckCircle2 className="h-3 w-3" /> Marcar Respondido
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NpsCard;
