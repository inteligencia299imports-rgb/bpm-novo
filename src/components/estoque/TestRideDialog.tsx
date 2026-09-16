import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Bike, Loader2 } from 'lucide-react';

interface TestRideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: { id: string; tipo_unidade?: string | null } | null;
  onSuccess: () => void;
}

const TestRideDialog: React.FC<TestRideDialogProps> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const [isTestRide, setIsTestRide] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsTestRide(estoqueItem?.tipo_unidade === 'test_ride');
  }, [estoqueItem]);

  const handleSalvar = async () => {
    if (!estoqueItem) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('estoque_motos_novas' as any)
        .update({ tipo: isTestRide ? 'test_ride' : 'nova' })
        .eq('id', estoqueItem.id);
      if (error) throw error;
      toast.success(isTestRide ? 'Moto marcada como Test-Ride' : 'Moto removida de Test-Ride');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao alterar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-primary" /> Test-Ride
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Label htmlFor="test-ride-switch" className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer">
            <span>Moto de Test-Ride</span>
            <Switch id="test-ride-switch" checked={isTestRide} onCheckedChange={setIsTestRide} />
          </Label>

          <Button onClick={handleSalvar} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TestRideDialog;
