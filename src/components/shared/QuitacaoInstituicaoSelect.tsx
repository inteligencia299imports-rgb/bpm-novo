import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface InstituicaoQuitacao {
  /** clientes_fornecedores.id — vira o fornecedor do compromisso da quitação. */
  id: string;
  nome: string;
  grupo: 'Bancos' | 'Consórcios';
}

const ehConsorcio = (nome: string | null | undefined) =>
  ['consórcio', 'consorcio'].includes(String(nome ?? '').trim().toLowerCase());
const ehFinanciamento = (nome: string | null | undefined) =>
  String(nome ?? '').trim().toLowerCase() === 'financiamento';

let cache: Promise<InstituicaoQuitacao[]> | null = null;

/** Bancos (Financiamento) + administradoras (Consórcio) — mesma lista da forma de pagamento. */
export function carregarInstituicoesQuitacao(): Promise<InstituicaoQuitacao[]> {
  if (cache) return cache;
  const sb = supabase as any;
  cache = sb
    .from('formas_pagamento_instituicoes')
    .select('cliente_fornecedor_id, forma:forma_pagamento_id(nome), instituicao:cliente_fornecedor_id(nome_razao_social, nome_fantasia)')
    .eq('ativo', true)
    .then(({ data }: any) => {
      const porId = new Map<string, InstituicaoQuitacao>();
      for (const r of (data as any[]) || []) {
        const formaNome = r.forma?.nome;
        if (!ehFinanciamento(formaNome) && !ehConsorcio(formaNome)) continue;
        if (!r.cliente_fornecedor_id || porId.has(r.cliente_fornecedor_id)) continue;
        porId.set(r.cliente_fornecedor_id, {
          id: r.cliente_fornecedor_id,
          nome: r.instituicao?.nome_fantasia || r.instituicao?.nome_razao_social || 'Instituição',
          grupo: ehConsorcio(formaNome) ? 'Consórcios' : 'Bancos',
        });
      }
      return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    })
    .catch(() => { cache = null; return []; });
  return cache!;
}

interface Props {
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Destaca em vermelho (obrigatório e vazio). */
  invalido?: boolean;
  className?: string;
}

/** Seletor de Banco / Consórcio da quitação (agrupado). */
const QuitacaoInstituicaoSelect: React.FC<Props> = ({ value, onChange, disabled, invalido, className }) => {
  const [opcoes, setOpcoes] = useState<InstituicaoQuitacao[]>([]);
  useEffect(() => {
    let ativo = true;
    carregarInstituicoesQuitacao().then((o) => { if (ativo) setOpcoes(o); });
    return () => { ativo = false; };
  }, []);
  const grupos: InstituicaoQuitacao['grupo'][] = ['Bancos', 'Consórcios'];
  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('h-9', invalido && 'border-destructive text-destructive', className)}>
        <SelectValue placeholder="Selecione o banco / consórcio" />
      </SelectTrigger>
      <SelectContent>
        {grupos.map((g) => {
          const itens = opcoes.filter((o) => o.grupo === g);
          if (!itens.length) return null;
          return (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {itens.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default QuitacaoInstituicaoSelect;
