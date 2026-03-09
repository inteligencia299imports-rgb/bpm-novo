import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  origemMoto: string;
  setOrigemMoto: (v: string) => void;
  marca: string;
  setMarca: (v: string) => void;
  modelo: string;
  setModelo: (v: string) => void;
  ano: string;
  setAno: (v: string) => void;
}

const MotoCompraSection: React.FC<Props> = ({
  origemMoto, setOrigemMoto, marca, setMarca, modelo, setModelo, ano, setAno,
}) => {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">🏍️ Moto de Interesse (Compra)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Origem da Moto</Label>
          <Select value={origemMoto} onValueChange={setOrigemMoto}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estoque">Estoque</SelectItem>
              <SelectItem value="externo">Externo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {origemMoto === 'estoque' ? (
          <p className="text-sm text-muted-foreground">Busca no estoque será implementada em versão futura.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input value={marca} onChange={e => setMarca(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={modelo} onChange={e => setModelo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input value={ano} onChange={e => setAno(e.target.value)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MotoCompraSection;
