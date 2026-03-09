import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MARCAS_MOTO, MODELOS_POR_MARCA, ANOS_MOTO } from '@/types/crm';

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
  const modelos = marca ? (MODELOS_POR_MARCA[marca] || ['Outro']) : [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Moto de Interesse (Compra)</CardTitle></CardHeader>
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
              <Select value={marca} onValueChange={(v) => { setMarca(v); setModelo(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{MARCAS_MOTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modelo} onValueChange={setModelo} disabled={!marca}>
                <SelectTrigger><SelectValue placeholder={marca ? "Selecione" : "Selecione a marca primeiro"} /></SelectTrigger>
                <SelectContent>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MotoCompraSection;
