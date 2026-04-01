import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ANOS_MOTO } from '@/types/crm';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { supabase } from '@/lib/supabase';

interface EstoqueOption {
  id: string;
  modelo: string;
  cor: string | null;
  placa: string | null;
  marca: string;
}

interface Props {
  origemMoto: string;
  setOrigemMoto: (v: string) => void;
  marca: string;
  setMarca: (v: string) => void;
  modelo: string;
  setModelo: (v: string) => void;
  ano: string;
  setAno: (v: string) => void;
  estoqueMotoId: string;
  setEstoqueMotoId: (v: string) => void;
  loja?: string;
  chassi?: string;
  setChassi?: (v: string) => void;
}

const MotoCompraSection: React.FC<Props> = ({
  origemMoto, setOrigemMoto, marca, setMarca, modelo, setModelo, ano, setAno,
  estoqueMotoId, setEstoqueMotoId, loja, chassi = '', setChassi,
}) => {
  const { getMarcaNomes, getModelosPorMarca, loading } = useMarcasModelos();
  const marcas = getMarcaNomes();
  const modelos = marca ? getModelosPorMarca(marca) : [];

  const isDucati = loja === 'Ducati';
  const ducatiModelos = getModelosPorMarca('DUCATI');

  const [estoque, setEstoque] = useState<EstoqueOption[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);

  useEffect(() => {
    if (isDucati || origemMoto !== 'estoque') return;

    let isMounted = true;

    const loadEstoque = async () => {
      setLoadingEstoque(true);

      try {
        const { data: estoqueDisponivel } = await supabase
          .from('estoque')
          .select('id, modelo, cor, placa, marca')
          .eq('status', 'disponivel')
          .order('marca')
          .order('modelo');

        let options = estoqueDisponivel || [];

        if (estoqueMotoId) {
          const { data: estoqueSelecionado } = await supabase
            .from('estoque')
            .select('id, modelo, cor, placa, marca')
            .eq('id', estoqueMotoId)
            .maybeSingle();

          if (estoqueSelecionado && !options.some((item) => item.id === estoqueSelecionado.id)) {
            options = [estoqueSelecionado, ...options];
          }
        }

        if (isMounted) {
          setEstoque(options);
        }
      } finally {
        if (isMounted) {
          setLoadingEstoque(false);
        }
      }
    };

    loadEstoque();

    return () => {
      isMounted = false;
    };
  }, [origemMoto, isDucati, estoqueMotoId]);

  const formatEstoqueLabel = (item?: EstoqueOption | null) => {
    if (!item) return 'Moto não encontrada';

    const parts = [item.modelo];
    if (item.cor) parts.push(item.cor);
    if (item.placa) parts.push(item.placa.replace(/-/g, ''));
    return parts.join(' - ').toUpperCase();
  };

  const sortedEstoque = useMemo(() =>
    [...estoque].sort((a, b) => formatEstoqueLabel(a).localeCompare(formatEstoqueLabel(b))),
    [estoque]
  );

  const [comboOpen, setComboOpen] = useState(false);
  const selectedItem = estoque.find(e => e.id === estoqueMotoId);
  const selectedLabel = estoqueMotoId
    ? (selectedItem ? formatEstoqueLabel(selectedItem) : 'Moto selecionada (indisponível)')
    : null;

  const handleChassiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 17).toUpperCase();
    setChassi?.(val);
  };

  // Ducati-specific layout
  if (isDucati) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Moto de Interesse (Ducati)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Select value={modelo} onValueChange={setModelo}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
                <SelectContent>
                  {ducatiModelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano Modelo *</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chassi</Label>
              <Input
                value={chassi}
                onChange={handleChassiChange}
                placeholder="Ex: 9BWZZZ377VT004251"
                maxLength={17}
                minLength={6}
              />
              {chassi && (chassi.length < 6 || chassi.length > 17) && (
                <p className="text-xs text-destructive">Chassi deve ter entre 6 e 17 caracteres</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Moto de Interesse (Compra)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Origem da Moto</Label>
          <Select value={origemMoto} onValueChange={(v) => {
            setOrigemMoto(v);
            setEstoqueMotoId('');
            setMarca('');
            setModelo('');
            setAno('');
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estoque">Estoque</SelectItem>
              <SelectItem value="externo">Externo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {origemMoto === 'estoque' ? (
          <div className="space-y-1.5">
            <Label>Moto do Estoque *</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full justify-between font-normal"
                >
                  {loadingEstoque
                    ? "Carregando..."
                    : selectedLabel || "Buscar moto..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar por modelo, cor ou placa..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma moto encontrada.</CommandEmpty>
                    <CommandGroup>
                      {sortedEstoque.map(item => (
                        <CommandItem
                          key={item.id}
                          value={formatEstoqueLabel(item)}
                          onSelect={() => {
                            setEstoqueMotoId(item.id);
                            setComboOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", estoqueMotoId === item.id ? "opacity-100" : "opacity-0")} />
                          {formatEstoqueLabel(item)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Marca *</Label>
              <Select value={marca} onValueChange={(v) => { setMarca(v); setModelo(''); }}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
                <SelectContent>{marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
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
              <Label>Ano Modelo *</Label>
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
