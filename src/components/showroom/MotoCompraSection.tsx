import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ANOS_MOTO } from '@/types/crm';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { fetchEstoqueUnificado, type EstoqueFonte } from '@/lib/estoqueMoto';

interface EstoqueOption {
  id: string;
  tipo: EstoqueFonte;
  modelo: string;
  cor: string | null;
  placa: string | null;
  chassi: string | null;
  marca: string;
  is0km: boolean;
}

interface Props {
  origemMoto: string;
  setOrigemMoto: (v: string) => void;
  marcaId: string;
  setMarcaId: (v: string) => void;
  modeloId: string;
  setModeloId: (v: string) => void;
  ano: string;
  setAno: (v: string) => void;
  estoqueMotoId: string;
  setEstoqueMotoId: (v: string) => void;
  estoqueTipo?: string;
  setEstoqueTipo?: (v: string) => void;
  loja?: string;
  chassi?: string;
  setChassi?: (v: string) => void;
  disabled?: boolean;
}

const MotoCompraSection: React.FC<Props> = ({
  origemMoto, setOrigemMoto, marcaId, setMarcaId, modeloId, setModeloId, ano, setAno,
  estoqueMotoId, setEstoqueMotoId, setEstoqueTipo, loja, chassi = '', setChassi, disabled,
}) => {
  const { marcas, getModelosByMarcaId, marcaIdByNome, loading } = useMarcasModelos();
  const modelos = getModelosByMarcaId(marcaId);

  const isDucati = (loja || '').toLowerCase().startsWith('ducati');
  const ducatiMarcaId = marcaIdByNome('DUCATI');
  const ducatiModelos = getModelosByMarcaId(ducatiMarcaId);

  const [estoque, setEstoque] = useState<EstoqueOption[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);

  useEffect(() => {
    if (origemMoto !== 'estoque') return;

    let isMounted = true;

    const loadEstoque = async () => {
      setLoadingEstoque(true);

      try {
        const flatten = (m: any): EstoqueOption => ({
          id: m.id,
          tipo: m.fonte,
          marca: m.marca ?? null,
          modelo: m.modelo ?? null,
          cor: m.cor ?? null,
          placa: m.placa ?? null,
          chassi: m.chassi ?? null,
          is0km: m.fonte === '0km',
        });

        const disponiveis = await fetchEstoqueUnificado({ status: 'disponivel' });
        // Loja Ducati só oferece estoque de 0km; loja 299 só seminovas.
        let options = disponiveis.map(flatten).filter((o) => (isDucati ? o.is0km : !o.is0km));

        // Mantem a moto ja selecionada mesmo que nao esteja mais "disponivel".
        if (estoqueMotoId && !options.some((item) => item.id === estoqueMotoId)) {
          const [sel] = await fetchEstoqueUnificado({
            ids: [{ id: estoqueMotoId, tipo: isDucati ? '0km' : 'seminova' }],
          });
          if (sel) options = [flatten(sel), ...options];
        }

        options.sort((a, b) => `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`));

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

    const parts = [item.modelo || 'Sem modelo cadastrado'];
    if (item.cor) parts.push(item.cor);
    // Ducati (só 0km): MODELO - COR - CHASSI (chassi completo).
    if (isDucati) {
      if (item.chassi) parts.push(item.chassi);
    } else if (item.placa) {
      // Motos 0km costumam nao ter placa ainda; sem um identificador distinto,
      // varias unidades do mesmo modelo/cor ficam indistinguiveis na lista.
      parts.push(item.placa.replace(/-/g, ''));
    } else if (item.chassi) {
      parts.push(`Chassi ${item.chassi.slice(-6)}`);
    } else {
      parts.push(`Nº ${item.id.slice(0, 6)}`);
    }
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

  // Seletor "Origem da Moto" (Estoque / Externo) — compartilhado entre o layout
  // padrão e o da Ducati.
  const origemSelect = (
    <div className="space-y-1.5">
      <Label>Origem da Moto</Label>
      <Select value={origemMoto} onValueChange={(v) => {
        setOrigemMoto(v);
        setEstoqueMotoId('');
        setEstoqueTipo?.('');
        setMarcaId('');
        setModeloId('');
        setAno('');
        setChassi?.('');
      }} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="estoque">Estoque</SelectItem>
          <SelectItem value="externo">Externo</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Combobox de seleção da moto do estoque — compartilhado. Na Ducati a lista já
  // vem só com 0km e o label sai como MODELO - COR - CHASSI (ver formatEstoqueLabel).
  const estoquePicker = (
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
            {loadingEstoque ? "Carregando..." : selectedLabel || "Buscar moto..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={isDucati ? "Buscar por modelo, cor ou chassi..." : "Buscar por modelo, cor ou placa..."} />
            <CommandList>
              <CommandEmpty>Nenhuma moto encontrada.</CommandEmpty>
              <CommandGroup>
                {sortedEstoque.map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    keywords={[formatEstoqueLabel(item)]}
                    onSelect={() => {
                      setEstoqueMotoId(item.id);
                      setEstoqueTipo?.(item.tipo);
                      setComboOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", estoqueMotoId === item.id ? "opacity-100" : "opacity-0")} />
                    {formatEstoqueLabel(item)}
                    {item.is0km && <span className="ml-2 text-[10px] font-semibold text-primary">0KM</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  // Ducati-specific layout
  if (isDucati) {
    return (
      <Card className={disabled ? 'opacity-60' : ''}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bike className="h-4 w-4 text-primary" /> Moto de Interesse (Ducati)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {disabled && (
            <p className="text-sm text-destructive font-medium">
              ⚠ Moto de interesse bloqueada. Para alterar, marque o atendimento como "Perdido" primeiro.
            </p>
          )}
          {origemSelect}
          {origemMoto === 'estoque' ? estoquePicker : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Modelo *</Label>
                <Select
                  value={modeloId}
                  onValueChange={(v) => { if (ducatiMarcaId) setMarcaId(ducatiMarcaId); setModeloId(v); }}
                  disabled={disabled}
                >
                  <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
                  <SelectContent>
                    {ducatiModelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano Modelo *</Label>
                <Select value={ano} onValueChange={setAno} disabled={disabled}>
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
                  disabled={disabled}
                />
                {chassi && (chassi.length < 6 || chassi.length > 17) && (
                  <p className="text-xs text-destructive">Chassi deve ter entre 6 e 17 caracteres</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

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
        {origemSelect}
        {origemMoto === 'estoque' ? estoquePicker : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Marca *</Label>
              <Select value={marcaId} onValueChange={(v) => { setMarcaId(v); setModeloId(''); }} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
                <SelectContent>{marcas.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Select value={modeloId} onValueChange={setModeloId} disabled={disabled || !marcaId}>
                <SelectTrigger><SelectValue placeholder={marcaId ? "Selecione" : "Selecione a marca primeiro"} /></SelectTrigger>
                <SelectContent>{modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
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
