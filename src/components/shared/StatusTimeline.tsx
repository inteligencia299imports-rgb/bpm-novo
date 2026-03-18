import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User } from 'lucide-react';

interface TimelineEntry {
  id: string;
  status_to: string;
  created_at: string;
  changed_by_name?: string | null;
  [key: string]: any;
}

interface StatusTimelineProps {
  history: TimelineEntry[];
  onEntryClick?: (entry: TimelineEntry) => void;
  isClickable?: (entry: TimelineEntry) => boolean;
}

const StatusTimeline: React.FC<StatusTimelineProps> = ({ history, onEntryClick, isClickable }) => {
  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>;
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

      {history.map((h) => {
        const clickable = isClickable?.(h) ?? false;
        return (
          <div
            key={h.id}
            className={`relative flex items-start gap-3 pb-5 last:pb-0 ${clickable ? 'cursor-pointer hover:bg-muted/50 rounded-md px-2 -mx-2' : ''}`}
            onClick={() => clickable && onEntryClick?.(h)}
          >
            {/* Dot */}
            <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background z-10" />

            <div className="flex-1 min-w-0">
              <span className="text-sm uppercase">{h.status_to.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
  );
};

export default StatusTimeline;
