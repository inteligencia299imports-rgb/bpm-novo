import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface TimelineEntry {
  id: string;
  status: string;
  created_at: string;
  changed_by_name?: string | null;
  [key: string]: any;
}

interface StatusTimelineProps {
  history: TimelineEntry[];
  /** Optional extra content renderer for the popup (e.g. resultado_consulta) */
  renderPopupExtra?: (entry: TimelineEntry) => React.ReactNode;
  /** Optional custom label formatter for status_to values */
  formatLabel?: (raw: string) => string;
}

const defaultFormatStatusLabel = (raw: string): string => {
  return raw.replace(/_/g, ' ').replace(/\bavaliacao\b/gi, 'avaliação').replace(/\bpreparacao\b/gi, 'preparação').replace(/\breenviada\b/gi, 'reenviada').replace(/\bconcluida\b/gi, 'concluída');
};

const StatusTimeline: React.FC<StatusTimelineProps> = ({ history, renderPopupExtra, formatLabel }) => {
  const formatStatusLabel = formatLabel || defaultFormatStatusLabel;
  const [selected, setSelected] = useState<TimelineEntry | null>(null);

  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>;
  }

  const sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

        {sorted.map((h, idx) => {
          const isLatest = idx === 0;
          return (
            <div
              key={h.id}
              className="relative flex items-start gap-2 pb-4 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-md px-1.5 -mx-1.5"
              onClick={() => setSelected(h)}
            >
              {/* Dot */}
              <div className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 z-10 ${isLatest ? 'border-primary bg-primary' : 'border-primary bg-background'}`} />

              <div className="flex-1 min-w-0">
                <span className={`text-sm uppercase ${isLatest ? 'font-bold text-primary' : ''}`}>
                  {formatStatusLabel(h.status)}
                </span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(h.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                  {h.changed_by_name && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {h.changed_by_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Detalhes da Movimentação
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Movimentação</span>
                  <p className="text-sm font-medium uppercase">{formatStatusLabel(selected.status)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Data / Hora</span>
                  <p className="text-sm font-medium">
                    {format(new Date(selected.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Responsável</span>
                  <p className="text-sm font-medium">{selected.changed_by_name || '-'}</p>
                </div>
              </div>
              {renderPopupExtra && (
                <>
                  <Separator />
                  {renderPopupExtra(selected)}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusTimeline;
