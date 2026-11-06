import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIAS_MOTO } from '@/types/crm';

// Mesmo layout e lógica do "Editar Dados da Moto" do Pós-Compra (AvaliacaoForm), mas na Publicação só
// Categoria, Cilindrada, KM, Manual, Chave, Revisão e Acessórios podem mudar; o resto aparece travado.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moto: any;
  onSaved: () => void;
}

const milhar = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? parseInt(d, 10).toLocaleString('pt-BR') : '';
};

const SimNao = ({ id, label, valor, set }: { id: string; label: string; valor: boolean; set: (v: boolean) => void }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <RadioGroup value={valor ? 'sim' : 'nao'} onValueChange={(v) => set(v === 'sim')} className="flex gap-4">
      <div className="flex items-center gap-1.5">
        <RadioGroupItem value="sim" id={`${id}-sim`} />
        <Label htmlFor={`${id}-sim`} className="cursor-pointer font-normal">Sim</Label>
      </div>
      <div className="flex items-center gap-1.5">
        <RadioGroupItem value="nao" id={`${id}-nao`} />
        <Label htmlFor={`${id}-nao`} className="cursor-pointer font-normal">Não</Label>
      </div>
    </RadioGroup>
  </div>
);

const EditarMotoPublicacaoDialog: React.FC<Props> = ({ open, onOpenChange, moto, onSaved }) => {
  const [km, setKm] = useState('');
  const [cilindrada, setCilindrada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [temManual, setTemManual] = useState(false);
  const [temChaveReserva, setTemChaveReserva] = useState(false);
  const [manutencaoVencida, setManutencaoVencida] = useState(false);
  const [temAcessorios, setTemAcessorios] = useState(false);
  const [acessoriosDescricao, setAcessoriosDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !moto) return;
    setKm(milhar(moto.km));
    setCilindrada(milhar(moto.cilindrada));
    setCategoria(moto.categoria || '');
    setTemManual(moto.tem_manual ?? false);
    setTemChaveReserva(moto.tem_chave_reserva ?? false);
    setManutencaoVencida(moto.manutencao_vencida ?? false);
    setTemAcessorios(moto.tem_acessorios ?? false);
    setAcessoriosDescricao(moto.acessorios_descricao || '');
  }, [open, moto]);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from('avaliacoes').update({
      km: km.replace(/\D/g, '') || null,
      cilindrada: cilindrada.replace(/\D/g, '') || null,
      categoria: categoria.trim() || null,
      tem_manual: temManual,
      tem_chave_reserva: temChaveReserva,
      manutencao_vencida: manutencaoVencida,
      tem_acessorios: temAcessorios,
      acessorios_descricao: temAcessorios ? (acessoriosDescricao.trim() || null) : null,
    } as any).eq('id', moto.id);
    setSalvando(false);
    if (error) {
      toast.error('Erro ao salvar dados da moto');
      console.error(error);
      return;
    }
    toast.success('Dados da moto atualizados!');
    onOpenChange(false);
    onSaved();
  };

  if (!moto) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85dvh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>Editar Dados da Moto</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 pr-7" style={{ scrollbarWidth: 'thin' }}>
          <div className="space-y-3 pb-4">
            <p className="text-xs text-muted-foreground">
              Aqui só mudam categoria, cilindrada, KM, manual, chave, revisão e acessórios. Os demais dados se alteram na avaliação.
            </p>
            <div>
              <Label>Marca</Label>
              <Input value={moto.marca || ''} disabled />
            </div>
            <div>
              <Label>Modelo</Label>
              <Input value={(moto.modelo || '').toUpperCase()} disabled />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Placa</Label>
                <Input value={String(moto.placa || '').replace(/-/g, '').toUpperCase()} disabled />
              </div>
              <div>
                <Label>KM</Label>
                <Input value={km} onChange={(e) => setKm(milhar(e.target.value))} placeholder="0" inputMode="numeric" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ano Fab.</Label>
                <Input value={moto.ano_fabricacao || ''} disabled />
              </div>
              <div>
                <Label>Ano Mod.</Label>
                <Input value={moto.ano_modelo || ''} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cor</Label>
                <Input value={moto.cor || ''} disabled />
              </div>
              <div>
                <Label>Cilindrada</Label>
                <Input value={cilindrada} onChange={(e) => setCilindrada(milhar(e.target.value))} placeholder="0" inputMode="numeric" />
              </div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CATEGORIAS_MOTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <SimNao id="pub-moto-manual" label="Manual" valor={temManual} set={setTemManual} />
              <SimNao id="pub-moto-chave" label="Chave Reserva" valor={temChaveReserva} set={setTemChaveReserva} />
              <SimNao id="pub-moto-manut" label="Revisão Vencida" valor={manutencaoVencida} set={setManutencaoVencida} />
              <SimNao id="pub-moto-acess" label="Acessórios" valor={temAcessorios} set={setTemAcessorios} />
            </div>
            {temAcessorios && (
              <div className="space-y-1.5">
                <Label>Quais acessórios?</Label>
                <Input value={acessoriosDescricao} onChange={(e) => setAcessoriosDescricao(e.target.value.toUpperCase())} placeholder="Ex: BAÚ, PROTETOR DE MOTOR..." />
              </div>
            )}
            <div className="space-y-1.5 pt-3">
              <Label>Observações</Label>
              <Textarea value={moto.observacoes || ''} disabled rows={3} className="uppercase" />
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t bg-background px-6 py-4">
          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditarMotoPublicacaoDialog;
