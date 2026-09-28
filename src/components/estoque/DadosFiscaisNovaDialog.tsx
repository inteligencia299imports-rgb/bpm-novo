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
        modelo: string | null;
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
        tipo_operacao?: string | null;
        condicao_veiculo?: string | null;
        tipo_combustivel?: string | null;
        especie_veiculo?: string | null;
        tipo_veiculo?: string | null;
        codigo_vin?: string | null;
        restricao_veiculo?: string | null;
        tipo_pintura?: string | null;
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
  tipo_operacao: string;
  condicao_veiculo: string;
  tipo_combustivel: string;
  especie_veiculo: string;
  tipo_veiculo: string;
  codigo_vin: string;
  restricao_veiculo: string;
  tipo_pintura: string;
};

// Defaults = mesmo valor que já estava fixo no código antes de virar campo
// por unidade (ver emitir-nfe-compra/payload.ts, veiculoProdMoto).
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
  tipo_operacao: '1',
  condicao_veiculo: '1',
  tipo_combustivel: '02',
  especie_veiculo: '1',
  tipo_veiculo: '04',
  codigo_vin: 'N',
  restricao_veiculo: '0',
  tipo_pintura: 'A',
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
      tipo_operacao: item.tipo_operacao ?? vazio.tipo_operacao,
      condicao_veiculo: item.condicao_veiculo ?? vazio.condicao_veiculo,
      tipo_combustivel: item.tipo_combustivel ?? vazio.tipo_combustivel,
      especie_veiculo: item.especie_veiculo ?? vazio.especie_veiculo,
      tipo_veiculo: item.tipo_veiculo ?? vazio.tipo_veiculo,
      codigo_vin: item.codigo_vin ?? vazio.codigo_vin,
      restricao_veiculo: item.restricao_veiculo ?? vazio.restricao_veiculo,
      tipo_pintura: item.tipo_pintura ?? vazio.tipo_pintura,
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
          tipo_operacao: strOrNull(form.tipo_operacao) ?? vazio.tipo_operacao,
          condicao_veiculo: strOrNull(form.condicao_veiculo) ?? vazio.condicao_veiculo,
          tipo_combustivel: strOrNull(form.tipo_combustivel) ?? vazio.tipo_combustivel,
          especie_veiculo: strOrNull(form.especie_veiculo) ?? vazio.especie_veiculo,
          tipo_veiculo: strOrNull(form.tipo_veiculo) ?? vazio.tipo_veiculo,
          codigo_vin: strOrNull(form.codigo_vin) ?? vazio.codigo_vin,
          restricao_veiculo: strOrNull(form.restricao_veiculo) ?? vazio.restricao_veiculo,
          tipo_pintura: strOrNull(form.tipo_pintura) ?? vazio.tipo_pintura,
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
            Demais códigos do <code>veicProd</code> — o mesmo valor serve pra quase toda moto, então já
            vem preenchido. Só ajuste se o DETRAN estiver rejeitando a transferência desta moto específica.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de operação</Label>
              <Input value={form.tipo_operacao} onChange={set('tipo_operacao')} />
            </div>
            <div className="space-y-1.5">
              <Label>Condição do veículo</Label>
              <Input value={form.condicao_veiculo} onChange={set('condicao_veiculo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de combustível</Label>
              <Input value={form.tipo_combustivel} onChange={set('tipo_combustivel')} />
            </div>
            <div className="space-y-1.5">
              <Label>Espécie do veículo</Label>
              <Input value={form.especie_veiculo} onChange={set('especie_veiculo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo do veículo</Label>
              <Input value={form.tipo_veiculo} onChange={set('tipo_veiculo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Restrição do veículo</Label>
              <Input value={form.restricao_veiculo} onChange={set('restricao_veiculo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Indicador VIN (N/R)</Label>
              <Input value={form.codigo_vin} onChange={set('codigo_vin')} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de pintura</Label>
              <Input value={form.tipo_pintura} onChange={set('tipo_pintura')} />
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
