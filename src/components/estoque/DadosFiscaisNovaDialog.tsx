import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, CheckCircle, FileText } from 'lucide-react';
import { pendenciasVeicProd } from '@/lib/veicProd';

/**
 * Cadastro das specs do veículo (grupo `veicProd` da NF-e) por unidade de estoque
 * 0km. Sem esses campos a NF-e de venda de 0km sai sem o grupo estruturado — ver
 * `supabase/functions/emitir-nfe-compra/payload.ts` (`veiculoProdMoto`).
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item:
    | {
        id: string;
        modelo: string;
        potencia_motor?: string | number | null;
        peso_liquido?: string | number | null;
        peso_bruto?: string | number | null;
        numero_motor?: string | null;
        codigo_cor_fabricante?: string | null;
        codigo_cor_denatran?: string | null;
        codigo_marca_modelo_denatran?: string | null;
        icms_st_bc_retido?: string | number | null;
        icms_st_valor_substituto?: string | number | null;
        icms_st_valor_retido?: string | number | null;
      }
    | null;
  onSuccess: () => void;
}

type FormState = {
  potencia_motor: string;
  peso_liquido: string;
  peso_bruto: string;
  numero_motor: string;
  codigo_cor_fabricante: string;
  codigo_cor_denatran: string;
  codigo_marca_modelo_denatran: string;
  icms_st_bc_retido: string;
  icms_st_valor_substituto: string;
  icms_st_valor_retido: string;
};

const vazio: FormState = {
  potencia_motor: '',
  peso_liquido: '',
  peso_bruto: '',
  numero_motor: '',
  codigo_cor_fabricante: '',
  codigo_cor_denatran: '',
  codigo_marca_modelo_denatran: '',
  icms_st_bc_retido: '',
  icms_st_valor_substituto: '',
  icms_st_valor_retido: '',
};

const DadosFiscaisNovaDialog: React.FC<Props> = ({ open, onOpenChange, item, onSuccess }) => {
  const [form, setForm] = useState<FormState>(vazio);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm({
      potencia_motor: item.potencia_motor != null ? String(item.potencia_motor) : '',
      peso_liquido: item.peso_liquido != null ? String(item.peso_liquido) : '',
      peso_bruto: item.peso_bruto != null ? String(item.peso_bruto) : '',
      numero_motor: item.numero_motor ?? '',
      codigo_cor_fabricante: item.codigo_cor_fabricante ?? '',
      codigo_cor_denatran: item.codigo_cor_denatran ?? '',
      codigo_marca_modelo_denatran: item.codigo_marca_modelo_denatran ?? '',
      icms_st_bc_retido: item.icms_st_bc_retido != null ? String(item.icms_st_bc_retido) : '',
      icms_st_valor_substituto: item.icms_st_valor_substituto != null ? String(item.icms_st_valor_substituto) : '',
      icms_st_valor_retido: item.icms_st_valor_retido != null ? String(item.icms_st_valor_retido) : '',
    });
  }, [item]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const numOrNull = (v: string) => {
        const t = v.trim().replace(',', '.');
        return t === '' ? null : Number(t);
      };
      const strOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
      const { error } = await supabase
        .from('estoque_motos_novas')
        .update({
          potencia_motor: strOrNull(form.potencia_motor),
          peso_liquido: numOrNull(form.peso_liquido),
          peso_bruto: numOrNull(form.peso_bruto),
          numero_motor: strOrNull(form.numero_motor),
          codigo_cor_fabricante: strOrNull(form.codigo_cor_fabricante),
          codigo_cor_denatran: strOrNull(form.codigo_cor_denatran),
          codigo_marca_modelo_denatran: strOrNull(form.codigo_marca_modelo_denatran),
          icms_st_bc_retido: numOrNull(form.icms_st_bc_retido),
          icms_st_valor_substituto: numOrNull(form.icms_st_valor_substituto),
          icms_st_valor_retido: numOrNull(form.icms_st_valor_retido),
        })
        .eq('id', item.id);
      if (error) throw error;
      toast.success('Dados fiscais salvos');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  const faltando = pendenciasVeicProd({
    potencia_motor: form.potencia_motor,
    peso_liquido: form.peso_liquido,
    peso_bruto: form.peso_bruto,
    numero_motor: form.numero_motor,
    codigo_cor_fabricante: form.codigo_cor_fabricante,
    codigo_cor_denatran: form.codigo_cor_denatran,
    codigo_marca_modelo_denatran: form.codigo_marca_modelo_denatran,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Dados fiscais (NF-e) — {item?.modelo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Specs exigidas pela SEFAZ no grupo do veículo (<code>veicProd</code>) da NF-e de venda
            de 0km. A maioria sai da NF de entrada da fábrica. Enquanto faltar algum, a NF é emitida
            sem o grupo estruturado.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Potência do motor (CV)</Label>
              <Input value={form.potencia_motor} onChange={set('potencia_motor')} inputMode="numeric" placeholder="Ex.: 115" />
            </div>
            <div className="space-y-1.5">
              <Label>Nº do motor</Label>
              <Input value={form.numero_motor} onChange={set('numero_motor')} />
            </div>
            <div className="space-y-1.5">
              <Label>Peso líquido (kg)</Label>
              <Input value={form.peso_liquido} onChange={set('peso_liquido')} inputMode="decimal" placeholder="Ex.: 207.54" />
            </div>
            <div className="space-y-1.5">
              <Label>Peso bruto (kg)</Label>
              <Input value={form.peso_bruto} onChange={set('peso_bruto')} inputMode="decimal" placeholder="Ex.: 243.54" />
            </div>
            <div className="space-y-1.5">
              <Label>Código de cor (fabricante)</Label>
              <Input value={form.codigo_cor_fabricante} onChange={set('codigo_cor_fabricante')} />
            </div>
            <div className="space-y-1.5">
              <Label>Código de cor DENATRAN</Label>
              <Input value={form.codigo_cor_denatran} onChange={set('codigo_cor_denatran')} placeholder="Ex.: 14" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Código Marca/Modelo DENATRAN</Label>
              <Input value={form.codigo_marca_modelo_denatran} onChange={set('codigo_marca_modelo_denatran')} placeholder="Ex.: 000496" />
            </div>
          </div>

          <p className="pt-1 text-xs text-muted-foreground">
            ICMS-ST retido anteriormente (grupo <code>&lt;ICMS60&gt;</code> da NF-e de venda). Transcreva
            da NF-e de entrada da moto. Em branco, a NF é emitida com um valor aproximado sobre a venda.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>BC ST retida (R$)</Label>
              <Input value={form.icms_st_bc_retido} onChange={set('icms_st_bc_retido')} inputMode="decimal" placeholder="Ex.: 123199.79" />
            </div>
            <div className="space-y-1.5">
              <Label>ICMS do substituto (R$)</Label>
              <Input value={form.icms_st_valor_substituto} onChange={set('icms_st_valor_substituto')} inputMode="decimal" placeholder="Ex.: 11032.82" />
            </div>
            <div className="space-y-1.5">
              <Label>ICMS-ST retido (R$)</Label>
              <Input value={form.icms_st_valor_retido} onChange={set('icms_st_valor_retido')} inputMode="decimal" placeholder="Ex.: 3751.15" />
            </div>
          </div>

          {faltando.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Pendente p/ NF: {faltando.join(', ')}
            </p>
          )}

          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><CheckCircle className="h-4 w-4" /> Salvar</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DadosFiscaisNovaDialog;
