import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { firstLastName } from '@/lib/utils';

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
  /** Optional custom label formatter for status values */
  formatLabel?: (raw: string) => string;
}

const defaultFormatStatusLabel = (raw: string): string => {
  return raw.replace(/_/g, ' ').replace(/\bavaliacao\b/gi, 'avaliação').replace(/\bpreparacao\b/gi, 'preparação').replace(/\breenviada\b/gi, 'reenviada').replace(/\bconcluida\b/gi, 'concluída');
};

const MIRROR_WINDOW_MS = 15000;

/**
 * Alguns status (ex.: "dispensada", "em_aberto") são gravados em dois entity_types
 * ao mesmo tempo (avaliação + showroom). Mostra só uma linha por movimentação.
 */
const dedupeMirrorEntries = (entries: TimelineEntry[]): TimelineEntry[] => {
  const asc = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const kept: TimelineEntry[] = [];
  for (const h of asc) {
    const isMirror = kept.some((k) =>
      k.status === h.status &&
      (k.changed_by ?? k.changed_by_name ?? null) === (h.changed_by ?? h.changed_by_name ?? null) &&
      (k.entity_type ?? null) !== (h.entity_type ?? null) &&
      Math.abs(new Date(k.created_at).getTime() - new Date(h.created_at).getTime()) < MIRROR_WINDOW_MS,
    );
    if (!isMirror) kept.push(h);
  }
  return kept;
};

const StatusTimeline: React.FC<StatusTimelineProps> = ({ history, renderPopupExtra, formatLabel }) => {
  const formatStatusLabel = formatLabel || defaultFormatStatusLabel;
  const [selected, setSelected] = useState<TimelineEntry | null>(null);

  const deduped = dedupeMirrorEntries(history);

  if (deduped.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>;
  }

  const sorted = [...deduped].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      <div className="relative">
        {/* Vertical line: centrada no gutter de 20px onde ficam as bolinhas */}
        <div className="absolute left-[9.5px] top-2 bottom-2 w-px bg-primary/40" />

        {sorted.map((h, idx) => {
          const isLatest = idx === 0;
          return (
            <div
              key={h.id}
              className="flex items-start gap-2 pb-4 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-md px-1.5 -mx-1.5"
              onClick={() => setSelected(h)}
            >
              {/* Gutter: centraliza a bolinha sobre a linha */}
              <div className="w-5 shrink-0 flex justify-center pt-1">
                <div className={`w-2.5 h-2.5 rounded-full border-2 z-10 ${isLatest ? 'border-primary bg-primary' : 'border-primary bg-background'}`} />
              </div>

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
                      {firstLastName(h.changed_by_name)}
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
                  <p className="text-sm font-medium">{firstLastName(selected.changed_by_name) || '-'}</p>
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
