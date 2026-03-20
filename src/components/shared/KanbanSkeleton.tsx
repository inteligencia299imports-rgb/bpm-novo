import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  columns?: number;
  cardsPerColumn?: number;
}

const KanbanSkeleton: React.FC<Props> = ({ columns = 4, cardsPerColumn = 3 }) => (
  <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
    <div className="flex gap-4 min-w-max md:min-w-0 md:grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }).map((_, colIdx) => (
        <div key={colIdx} className="min-w-[280px] md:min-w-0 space-y-3">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          {Array.from({ length: cardsPerColumn }).map((_, cardIdx) => (
            <Card key={cardIdx}>
              <CardContent className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default KanbanSkeleton;
