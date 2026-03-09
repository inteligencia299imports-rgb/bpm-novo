import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
}

const MotoVendaSection: React.FC<Props> = ({
  marca, setMarca, modelo, setModelo, anoFab, setAnoFab,
  anoMod, setAnoMod, categoria, setCategoria, cor, setCor,
  placa, setPlaca, km, setKm, obs, setObs,
  motoAvaliacaoId, atendimentoId,
}) => {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">🔄 Moto do Cliente (Venda/Troca)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Marca *</Label>
            <Input value={marca} onChange={e => setMarca(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo *</Label>
            <Input value={modelo} onChange={e => setModelo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ano Fabricação</Label>
            <Input value={anoFab} onChange={e => setAnoFab(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ano Modelo</Label>
            <Input value={anoMod} onChange={e => setAnoMod(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Input value={categoria} onChange={e => setCategoria(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input value={cor} onChange={e => setCor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Placa</Label>
            <Input value={placa} onChange={e => setPlaca(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>KM</Label>
            <Input value={km} onChange={e => setKm(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observações da Moto</Label>
          <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} />
        </div>
        {motoAvaliacaoId && <PhotoUpload motoAvaliacaoId={motoAvaliacaoId} />}
      </CardContent>
    </Card>
  );
};

export default MotoVendaSection;
