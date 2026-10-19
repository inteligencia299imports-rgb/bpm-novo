import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ehVoucherEquipamentos, type VendedorEquipamentos } from '@/lib/voucherEquipamentos';

export interface Agregado {
  id: string;
  descricao: string;
  valor: number;
  empresa_id?: string | null;
  ativo?: boolean;
}

export interface AgregadoLinha {
  agregado_id: string | null;
  descricao: string;
  valor: number;
  observacoes?: string | null;
  /** Cortesia: item não cobrado do cliente. Nunca entra no total nem em cálculos. */
  cortesia?: boolean;
  /** Troco: dinheiro devido ao cliente (não um serviço) — também não cobrado
   * nem contado no total, mas ao contrário de cortesia, gera compromisso
   * financeiro de conta a pagar (ver gerar-compromissos-proposta). */
  troco?: boolean;
  /** Voucher Equipamentos direcionado ao CRM: user_id do vendedor de
   * equipamentos (ver sincronizar_voucher_equipamentos). */
  voucher_vendedor_id?: string | null;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInput = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseInput = (v: string) => parseInt(v.replace(/\D/g, '') || '0', 10) / 100;
const toInput = (n: number) => (n ? (Math.round(n * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

interface Props {
  value: AgregadoLinha[];
  onChange: (linhas: AgregadoLinha[]) => void;
  catalogo: Agregado[];
  soLeitura?: boolean;
  /** Vendedores de equipamentos da loja (CRM). Vazio = loja sem voucher para o
   * CRM (só Ducati BSB/FLN/POA) — a opção de direcionar não aparece. */
  vendedoresEquipamentos?: VendedorEquipamentos[];
  /** Status do atendimento de equipamentos já criado no CRM, se houver. */
  voucherCrmStatus?: string | null;
}

const STATUS_CRM_LABEL: Record<string, string> = {
  em_aberto: 'Em aberto no CRM',
  aprovacao_desconto: 'Aguardando aprovação no CRM',
  pendente_estoque: 'Pendência de estoque no CRM',
  aguardando_nf: 'Finalizado no CRM — sai na NF-e da moto',
  vendido: 'Faturado na NF-e da moto',
  perdido: 'Encerrado no CRM',
};

/**
 * Agregados do contrato: serviços cobrados à parte do cliente. Seleciona um
 * agregado do catálogo (agregados_motos) — o valor vem preenchido e pode ser
 * editado aqui no contrato (não altera o catálogo). Cada agregado tem campo de
 * observações. (A Taxa de Retorno do financiamento fica na forma de pagamento.)
 * Após registrado, o agregado é editado/excluído pelos ícones do card (igual
 * às Formas de Pagamento) — os campos não ficam sempre abertos.
 */
const AgregadosContrato: React.FC<Props> = ({ value, onChange, catalogo, soLeitura, vendedoresEquipamentos = [], voucherCrmStatus }) => {
  const [selId, setSelId] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [fValor, setFValor] = useState('');
  const [fObs, setFObs] = useState('');
  const [fCortesia, setFCortesia] = useState(false);
  const [fTroco, setFTroco] = useState(false);
  const [fDirecionar, setFDirecionar] = useState(false);
  const [fVendedorId, setFVendedorId] = useState('');

  const disponiveis = useMemo(
    () => catalogo.filter((c) => !value.some((l) => l.agregado_id === c.id)),
    [catalogo, value],
  );
  // Cortesia e troco nunca entram no total (nem são cobrados do cliente).
  const total = value.reduce((s, l) => s + (l.cortesia || l.troco ? 0 : Number(l.valor) || 0), 0);

  const editando = editIdx !== null;
  const agSel = catalogo.find((c) => c.id === selId);
  const descAtual = editando ? (value[editIdx as number]?.descricao ?? '') : (agSel?.descricao ?? '');
  const mostrarCampos = !!selId || editando;
  const podeDirecionar = ehVoucherEquipamentos(descAtual) && vendedoresEquipamentos.length > 0;
  const nomeVendedor = (id: string | null | undefined) =>
    vendedoresEquipamentos.find((v) => v.user_id === id)?.nome ?? 'vendedor de equipamentos';

  const resetForm = () => {
    setSelId('');
    setEditIdx(null);
    setFValor('');
    setFObs('');
    setFCortesia(false);
    setFTroco(false);
    setFDirecionar(false);
    setFVendedorId('');
  };

  // Selecionar um agregado do catálogo (novo) — já traz o valor padrão.
  const selecionar = (id: string) => {
    setEditIdx(null);
    setSelId(id);
    const ag = catalogo.find((c) => c.id === id);
    setFValor(ag ? toInput(Number(ag.valor) || 0) : '');
    setFObs('');
    setFCortesia(false);
    setFTroco(false);
    setFDirecionar(false);
    setFVendedorId('');
  };

  const editar = (i: number) => {
    const l = value[i];
    setSelId('');
    setEditIdx(i);
    setFValor(toInput(Number(l.valor) || 0));
    setFObs(l.observacoes ?? '');
    setFCortesia(!!l.cortesia);
    setFTroco(!!l.troco);
    setFDirecionar(!!l.voucher_vendedor_id);
    setFVendedorId(l.voucher_vendedor_id ?? '');
  };

  const salvar = () => {
    const obs = fObs.trim() || null;
    const voucher_vendedor_id = podeDirecionar && fDirecionar && fVendedorId ? fVendedorId : null;
    if (editando) {
      const i = editIdx as number;
      const next = value.slice();
      next[i] = {
        ...next[i],
        valor: parseInput(fValor),
        observacoes: obs,
        cortesia: fCortesia,
        troco: fTroco,
        voucher_vendedor_id,
      };
      onChange(next);
    } else {
      const ag = catalogo.find((c) => c.id === selId);
      if (!ag) return;
      onChange([...value, {
        agregado_id: ag.id,
        descricao: ag.descricao,
        valor: fValor.trim() ? parseInput(fValor) : (Number(ag.valor) || 0),
        observacoes: obs,
        cortesia: fCortesia,
        troco: fTroco,
        voucher_vendedor_id,
      }]);
    }
    resetForm();
  };

  const remover = (i: number) => {
    if (editIdx === i) resetForm();
    onChange(value.filter((_, idx) => idx !== i));
  };

  // Lista de agregados já registrados — mesma estrutura de cards das Formas de Pagamento.
  const lista = value.length > 0 && (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className={cn('flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2', editIdx === i && 'border-primary')}>
          <div className="space-y-0.5">
            <span className="text-xs font-semibold">
              {l.descricao}
              {l.cortesia && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Cortesia</span>
              )}
              {l.troco && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Troco</span>
              )}
            </span>
            <p className="text-xs text-muted-foreground">
              {l.cortesia
                ? `Cortesia — não cobrado do cliente${(Number(l.valor) || 0) > 0 ? ` (valor de referência: ${brl(Number(l.valor) || 0)})` : ''}`
                : l.troco
                  ? `Troco ao cliente — não cobrado, gera conta a pagar de ${brl(Number(l.valor) || 0)}`
                  : `Valor: ${brl(Number(l.valor) || 0)}`}
            </p>
            {l.observacoes?.trim() && (
              <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">{l.observacoes}</p>
            )}
            {l.voucher_vendedor_id && (
              <p className="text-xs font-medium text-sky-700">
                Direcionado a {nomeVendedor(l.voucher_vendedor_id)}
                {' — '}
                {voucherCrmStatus ? (STATUS_CRM_LABEL[voucherCrmStatus] ?? voucherCrmStatus) : 'atendimento criado no CRM ao gerar a proposta'}
              </p>
            )}
          </div>
          {!soLeitura && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => editar(i)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remover(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span>Total de Agregados</span>
        <span className="text-primary">{brl(total)}</span>
      </div>
    </div>
  );

  if (soLeitura) {
    if (value.length === 0) return null;
    return <div className="space-y-3">{lista}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Registrar / editar agregado */}
      <div className={cn('rounded-lg border p-3 space-y-3', editando && 'border-primary')}>
        <div className="flex items-center gap-2">
          {editando ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{editando ? `Editar: ${descAtual}` : 'Registrar Agregado'}</span>
        </div>

        {!editando && (
          <Select value={selId} onValueChange={selecionar}>
            <SelectTrigger><SelectValue placeholder={disponiveis.length ? 'Selecione' : 'Todos já registrados'} /></SelectTrigger>
            <SelectContent>
              {disponiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.descricao}{c.valor ? ` — ${brl(Number(c.valor))}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {mostrarCampos && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Valor</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  className="pl-10"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={fValor}
                  onChange={(e) => setFValor(fmtInput(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Input
                className="mt-1"
                placeholder="Observações deste agregado..."
                value={fObs}
                onChange={(e) => setFObs(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
              <Checkbox checked={fCortesia} onCheckedChange={(c) => { setFCortesia(c === true); if (c === true) setFTroco(false); }} />
              Cortesia — não cobrar do cliente (não soma no total nem nos cálculos)
            </label>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
              <Checkbox checked={fTroco} onCheckedChange={(c) => { setFTroco(c === true); if (c === true) setFCortesia(false); }} />
              Troco ao cliente — não cobrar (gera conta a pagar deste valor)
            </label>

            {podeDirecionar && (
              <div className="space-y-2 rounded-md border border-dashed p-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                  <Checkbox checked={fDirecionar} onCheckedChange={(c) => setFDirecionar(c === true)} />
                  Direcionar ao vendedor de equipamentos (cria o atendimento no CRM ao gerar a proposta)
                </label>
                {fDirecionar && (
                  <Select value={fVendedorId} onValueChange={setFVendedorId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o vendedor de equipamentos" /></SelectTrigger>
                    <SelectContent>
                      {vendedoresEquipamentos.map((v) => (
                        <SelectItem key={v.user_id} value={v.user_id}>{v.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="flex justify-center gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1 max-w-[10.5rem]" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" className="flex-1 max-w-[10.5rem]" onClick={salvar} disabled={(!editando && !selId) || (podeDirecionar && fDirecionar && !fVendedorId)}>
                <Plus className="h-4 w-4 mr-1" />
                {editando ? 'Salvar Alterações' : 'Registrar'}
              </Button>
            </div>
          </>
        )}
      </div>

      {lista}
    </div>
  );
};

export default AgregadosContrato;
