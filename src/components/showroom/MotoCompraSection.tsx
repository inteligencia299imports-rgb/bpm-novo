import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Bike } from 'lucide-react';
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
  is0km: boolean;
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
  disabled?: boolean;
}

const MotoCompraSection: React.FC<Props> = ({
  origemMoto, setOrigemMoto, marca, setMarca, modelo, setModelo, ano, setAno,
  estoqueMotoId, setEstoqueMotoId, loja, disabled,
}) => {
  const { getMarcaNomes, getModelosPorMarca, loading } = useMarcasModelos();
  const marcas = getMarcaNomes();
  const modelos = marca ? getModelosPorMarca(marca) : [];

  const isDucati = (loja || '').toLowerCase().startsWith('ducati');

  const [estoque, setEstoque] = useState<EstoqueOption[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);

  useEffect(() => {
    if (origemMoto !== 'estoque') return;

    let isMounted = true;

    const loadEstoque = async () => {
      setLoadingEstoque(true);

      try {
        const flatten = (r: any) => {
          const mn = r.moto_nova;
          const s = mn ?? r.avaliacao ?? {};
          return {
            id: r.id,
            marca: mn ? (mn.marca?.nome ?? null) : (s.marca ?? null),
            modelo: mn ? (mn.modelo?.nome ?? null) : (s.modelo ?? null),
            cor: s.cor ?? null,
            placa: s.placa ?? null,
            is0km: !!mn,
          };
        };
        const estSelect = 'id, avaliacao:avaliacao_id(marca, modelo, cor, placa), moto_nova:moto_nova_id(marca:marca_id(nome), modelo:modelo_id(nome), cor, placa)';

        const { data: estoqueDisponivel } = await supabase
          .from('estoque_motos')
          .select(estSelect)
          .eq('status', 'disponivel');

        let options = (estoqueDisponivel || []).map(flatten);
        options.sort((a, b) => `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`));

        if (estoqueMotoId) {
          const { data: estoqueSelecionado } = await supabase
            .from('estoque_motos')
            .select(estSelect)
            .eq('id', estoqueMotoId)
            .maybeSingle();

          if (estoqueSelecionado && !options.some((item) => item.id === (estoqueSelecionado as any).id)) {
            options = [flatten(estoqueSelecionado), ...options];
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
  }, [origemMoto, estoqueMotoId]);

  const formatEstoqueLabel = (item?: EstoqueOption | null) => {
    if (!item) return 'Moto não encontrada';

    const parts = [item.modelo];
    if (item.cor) parts.push(item.cor);
    if (item.placa) parts.push(item.placa.replace(/-/g, ''));
    return parts.join(' - ').toUpperCase();
  };

  const [comboOpen, setComboOpen] = useState(false);
  const visibleEstoque = isDucati ? estoque.filter(e => e.is0km) : estoque;
  const selectedItem = visibleEstoque.find(e => e.id === estoqueMotoId);
  const selectedLabel = estoqueMotoId
    ? (selectedItem ? formatEstoqueLabel(selectedItem) : 'Moto selecionada (indisponível)')
    : null;

  const sortedVisibleEstoque = useMemo(() =>
    [...visibleEstoque].sort((a, b) => formatEstoqueLabel(a).localeCompare(formatEstoqueLabel(b))),
    [visibleEstoque]
  );

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bike className="h-4 w-4 text-primary" /> Moto de Interesse (Compra)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabled && (
          <p className="text-sm text-destructive font-medium">
            ⚠ Moto de interesse bloqueada. Para alterar, marque o atendimento como "Perdido" primeiro.
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Origem da Moto</Label>
          <Select value={origemMoto} onValueChange={(v) => {
            setOrigemMoto(v);
            setEstoqueMotoId('');
            setMarca('');
            setModelo('');
            setAno('');
          }} disabled={disabled}>
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
            <Popover open={disabled ? false : comboOpen} onOpenChange={disabled ? undefined : setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full justify-between font-normal"
                  disabled={disabled}
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
                      {sortedVisibleEstoque.map(item => (
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
              <Select value={marca} onValueChange={(v) => { setMarca(v); setModelo(''); }} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
                <SelectContent>{marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Select value={modelo} onValueChange={setModelo} disabled={disabled || !marca}>
                <SelectTrigger><SelectValue placeholder={marca ? "Selecione" : "Selecione a marca primeiro"} /></SelectTrigger>
                <SelectContent>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano Modelo *</Label>
              <Select value={ano} onValueChange={setAno} disabled={disabled}>
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
