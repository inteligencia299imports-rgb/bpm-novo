import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft } from 'lucide-react';

interface Props {
  onClose: () => void;
  cards?: number;
}

const DetailSkeleton: React.FC<Props> = ({ onClose, cards = 4 }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex-1 space-y-2">
        <div className="h-5 w-48 bg-muted animate-pulse rounded" />
        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
      </div>
    </div>
    <Separator />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6 space-y-3">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-full bg-muted animate-pulse rounded" />
            <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export default DetailSkeleton;
