import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MARCAS_MOTO, MODELOS_POR_MARCA, ANOS_MOTO, CATEGORIAS_MOTO, CORES_MOTO } from '@/types/crm';
import type { Interesse } from '@/types/crm';
import PhotoUpload from './PhotoUpload';

interface Props {
  marca: string; setMarca: (v: string) => void;
  modelo: string; setModelo: (v: string) => void;
  anoFab: string; setAnoFab: (v: string) => void;
  anoMod: string; setAnoMod: (v: string) => void;
  categoria: string; setCategoria: (v: string) => void;
  cor: string; setCor: (v: string) => void;
  placa: string; setPlaca: (v: string) => void;
  km: string; setKm: (v: string) => void;
  obs: string; setObs: (v: string) => void;
  motoAvaliacaoId: string | null;
  atendimentoId: string | null;
  interesse: Interesse;
}

const MotoVendaSection: React.FC<Props> = ({
  marca, setMarca, modelo, setModelo, anoFab, setAnoFab,
  anoMod, setAnoMod, categoria, setCategoria, cor, setCor,
  placa, setPlaca, km, setKm, obs, setObs,
  motoAvaliacaoId, atendimentoId, interesse,
}) => {
  const modelos = marca ? (MODELOS_POR_MARCA[marca] || ['Outro']) : [];

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 7).toUpperCase();
    setPlaca(val);
  };

  const formatKm = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const handleKmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKm(formatKm(e.target.value));
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Moto do Cliente ({interesse === 'trocar' ? 'Troca' : 'Venda'})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Marca *</Label>
            <Select value={marca} onValueChange={(v) => { setMarca(v); setModelo(''); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{MARCAS_MOTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo *</Label>
            <Select value={modelo} onValueChange={setModelo} disabled={!marca}>
              <SelectTrigger><SelectValue placeholder={marca ? "Selecione" : "Selecione a marca primeiro"} /></SelectTrigger>
              <SelectContent>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ano Fabricação *</Label>
            <Select value={anoFab} onValueChange={setAnoFab}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ano Modelo *</Label>
            <Select value={anoMod} onValueChange={setAnoMod}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria *</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{CATEGORIAS_MOTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cor *</Label>
            <Select value={cor} onValueChange={setCor}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{CORES_MOTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Placa *</Label>
            <Input value={placa} onChange={handlePlacaChange} maxLength={7} placeholder="ABC1D23" />
          </div>
          <div className="space-y-1.5">
            <Label>KM *</Label>
            <Input value={km} onChange={handleKmChange} placeholder="12.000" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observações da Moto *</Label>
          <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} />
        </div>
        {motoAvaliacaoId && <PhotoUpload motoAvaliacaoId={motoAvaliacaoId} />}
      </CardContent>
    </Card>
  );
};

export default MotoVendaSection;
