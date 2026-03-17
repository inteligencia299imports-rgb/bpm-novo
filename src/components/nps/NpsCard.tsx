import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Calendar, Send, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { STATUS_COLORS } from '@/types/crm';

interface NpsCardProps {
  atendimento: any;
  onRefresh: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const NpsCard: React.FC<NpsCardProps> = ({ atendimento, onRefresh }) => {
  const npsStatus = atendimento.nps_status || 'em_aberto';

  const handleMarkEnviado = async () => {
    const { error } = await supabase
      .from('atendimentos')
      .update({ nps_status: 'enviado', nps_enviado_at: new Date().toISOString() })
      .eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Marcado como Enviado');
      onRefresh();
    }
  };

  const handleMarkRespondido = async () => {
    const { error } = await supabase
      .from('atendimentos')
      .update({ nps_status: 'respondido', nps_respondido_at: new Date().toISOString() })
      .eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Marcado como Respondido');
      onRefresh();
    }
  };

  const vendidoColor = STATUS_COLORS.vendido;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: vendidoColor }}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-foreground truncate">{atendimento.nome_cliente}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">{atendimento.loja}</Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatPhone(atendimento.telefone)}
          </span>
        </div>

        {atendimento.updated_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Vendido em {format(new Date(atendimento.updated_at), "dd/MM HH:mm", { locale: ptBR })}
          </div>
        )}

        <div className="flex gap-1.5 pt-1">
          {npsStatus === 'em_aberto' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={handleMarkEnviado}>
              <Send className="h-3 w-3" /> Marcar Enviado
            </Button>
          )}
          {npsStatus === 'enviado' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={handleMarkRespondido}>
              <CheckCircle2 className="h-3 w-3" /> Marcar Respondido
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NpsCard;
