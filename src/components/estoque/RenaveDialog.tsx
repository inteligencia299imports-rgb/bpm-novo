import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * RENAVE (SERPRO) — entrada em estoque do 0km (gera o TEV e o RENAVAM).
 * A saída de estoque / ATPV-e acontece no pós-venda, após a NF-e de venda
 * autorizada em produção (ação 'saida' da edge function `renave`).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any | null;
  onDone?: () => void;
}

const RenaveDialog: React.FC<Props> = ({ open, onOpenChange, item, onDone }) => {
  const [km, setKm] = useState('0');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  if (!item) return null;
  const jaEntrou = !!item.renave_id_estoque;

  const fazerEntrada = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: {
          acao: 'entrada',
          estoque_moto_nova_id: item.id,
          quilometragem_hodometro: parseInt(km || '0', 10) || 0,
          data_entrada_estoque: new Date(data + 'T12:00:00').toISOString(),
        },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || error?.message || 'Falha na entrada RENAVE');
        return;
      }
      toast.success(`Entrada RENAVE OK — RENAVAM ${res?.estoque?.renavam ?? '—'}`);
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>RENAVE — {[item.marca, item.modelo].filter(Boolean).join(' ')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground">Chassi: <span className="font-mono">{item.chassi || '—'}</span></div>

          {jaEntrou ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-emerald-700 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Em estoque no RENAVE
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">idEstoque</span><span>{item.renave_id_estoque}</span>
                <span className="text-muted-foreground">Estado</span><span>{item.renave_estado || '—'}</span>
                <span className="text-muted-foreground">RENAVAM</span><span>{item.renave_renavam || '—'}</span>
                <span className="text-muted-foreground">Placa</span><span>{item.renave_placa || '—'}</span>
                <span className="text-muted-foreground">Nº CRV</span><span>{item.renave_numero_crv || '—'}</span>
                <span className="text-muted-foreground">Termo entrada</span><span>{item.renave_num_termo_entrada || '—'}</span>
              </div>
              {item.renave_atpv_url && (
                <a href={item.renave_atpv_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-xs font-medium">
                  <ExternalLink className="h-3.5 w-3.5" /> ATPV-e {item.renave_atpv_numero ? `(${item.renave_atpv_numero})` : ''}
                </a>
              )}
              {item.renave_ultimo_erro && (
                <p className="text-xs text-destructive">{item.renave_ultimo_erro}</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Faz a <strong>entrada em estoque no RENAVE</strong> usando a NF-e de faturamento
                da montadora (já vinculada a esta moto). Gera o Termo de Entrada e o RENAVAM.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Hodômetro (km)</Label>
                  <Input className="mt-1" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data da entrada</Label>
                  <Input className="mt-1" type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </div>
              </div>
              {item.renave_ultimo_erro && (
                <p className="text-xs text-destructive">Última tentativa: {item.renave_ultimo_erro}</p>
              )}
              <Button className="w-full" onClick={fazerEntrada} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Fazer entrada no RENAVE
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RenaveDialog;
