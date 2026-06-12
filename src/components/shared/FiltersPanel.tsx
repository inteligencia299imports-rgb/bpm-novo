import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Mobile-first filters panel.
 * - Mobile (< md): renders as a bordered Card stacking children vertically.
 *   Visibility controlled by `show`.
 * - Desktop (>= md): always visible, no card chrome, children rendered in
 *   the parent's flow (parent provides its own layout/grid).
 */
const FiltersPanel: React.FC<Props> = ({ show, children, className }) => (
  <div className={cn(show ? 'block' : 'hidden md:block', className)}>
    <Card className="animate-fade-in border-border shadow-soft md:border-0 md:shadow-none md:bg-transparent">
      <CardContent className="p-3 space-y-3 md:p-0 md:space-y-0">
        {children}
      </CardContent>
    </Card>
  </div>
);

export default FiltersPanel;
