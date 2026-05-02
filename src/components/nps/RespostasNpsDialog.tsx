import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RespostasNpsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  nomeCliente?: string;
}

const LABELS: Record<string, string> = {
  atendimento: 'Atendimento',
  outros_setores: 'Outros Setores',
  produto: 'Produto',
  experiencia: 'Experiência',
  nps: 'NPS',
  melhorias: 'Melhorias',
  espaco_livre: 'Espaço Livre',
  origem: 'Origem',
};

const RespostasNpsDialog: React.FC<RespostasNpsDialogProps> = ({ open, onOpenChange, atendimentoId, nomeCliente }) => {
  const [resposta, setResposta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !atendimentoId) return;
    setLoading(true);
    supabase
      .from('respostas_nps')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .order('data_resposta', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setResposta(data);
        setLoading(false);
      });
  }, [open, atendimentoId]);

  const fields = ['atendimento', 'outros_setores', 'produto', 'experiencia', 'nps', 'melhorias', 'espaco_livre', 'origem'] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg text-primary">
            NPS{nomeCliente ? ` - ${nomeCliente}` : ''}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !resposta ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma resposta encontrada para este atendimento.</p>
        ) : (
          <div className="space-y-4">
            {resposta.data_resposta && (
              <p className="text-xs text-muted-foreground">
                Respondido em {format(new Date(resposta.data_resposta), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
            {fields.map(field => {
              const value = resposta[field];
              if (!value) return null;
              const isNps = field === 'nps';
              const npsNum = isNps ? Number(value) : NaN;
              let npsColor = '';
              if (isNps && !isNaN(npsNum)) {
                if (npsNum > 8) npsColor = 'text-green-700';
                else if (npsNum >= 7) npsColor = 'text-yellow-700';
                else npsColor = 'text-red-700';
              }
              return (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-semibold text-primary uppercase tracking-wide">{LABELS[field]}</label>
                  <p className="text-sm rounded-md p-3 border whitespace-pre-wrap text-foreground bg-muted/50 border-border/50">
                    {isNps ? <span className={`font-bold ${npsColor}`}>{value}</span> : value}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RespostasNpsDialog;
