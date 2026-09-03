import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllRange } from '@/lib/fetchAllRange';
import { ESTOQUE_MOTO_SELECT, mapEstoqueMoto, fetchLojaMap } from '@/lib/estoqueMoto';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import { Input } from '@/components/ui/input';
import { Search, X, Handshake, Filter, DollarSign } from 'lucide-react';
import { INTERMEDIACAO_PARTE1_COLUMNS, INTERMEDIACAO_PARTE2_COLUMNS, INTERMEDIACAO_PARTE1_ETAPAS, INTERMEDIACAO_PARTE2_ETAPAS } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import PosVendaDetail from '@/components/pos-venda/PosVendaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import { Button } from '@/components/ui/button';
import CidadeFilter, { matchesCidade, getSiglaFromLoja, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import FiltersPanel from '@/components/shared/FiltersPanel';


type Parte = 'parte1' | 'parte2';

const PARTE_CONFIG = {
  parte1: {
    columns: INTERMEDIACAO_PARTE1_COLUMNS,
    statusField: 'intermediacao_parte1_status',
    etapas: INTERMEDIACAO_PARTE1_ETAPAS,
    statusRules: {
      concluded: 'AUTORIZAÇÃO DE PAGAMENTO',
      default: 'em_andamento',
    },
  },
  parte2: {
    columns: INTERMEDIACAO_PARTE2_COLUMNS,
    statusField: 'intermediacao_parte2_status',
    etapas: INTERMEDIACAO_PARTE2_ETAPAS,
    statusRules: {
      concluded: 'TRANSFERÊNCIA FINALIZADA',
      special: { etapa: 'DOCUMENTAÇÃO COM DESPACHANTE', status: 'doc_despachante' },
      default: 'em_andamento',
    },
  },
};

interface IntermediacacaoTabProps {
  initialAtendimentoId?: string | null;
  initialParte?: 'parte1' | 'parte2' | null;
  onInitialHandled?: () => void;
}

const IntermediacacaoTab = ({ initialAtendimentoId, initialParte, onInitialHandled }: IntermediacacaoTabProps = {}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [parte, setParte] = useState<Parte>(initialParte || 'parte1');
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (initialParte) setParte(initialParte);
  }, [initialParte]);

  useEffect(() => {
    if (initialAtendimentoId) {
      supabase.from('atendimentos_motos').select(`*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*), motos_interesse(*, ${MARCA_MODELO_SELECT}), avaliacoes(*, ${MARCA_MODELO_SELECT})`).eq('id', initialAtendimentoId).single().then(async ({ data: raw }) => {
        const data = flattenMarcaModelo(raw as any);
        if (data) {
          const { data: estRow } = await supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).eq('atendimento_venda_id', data.id).maybeSingle();
          const est = estRow ? mapEstoqueMoto(estRow, await fetchLojaMap()) : null;
          setSelectedItem({ ...data, loja: (data as any).loja_empresas?.loja, _estoqueMoto: est && est.tipo === 'consignada' ? est : null });
        }
      });
      onInitialHandled?.();
    }
  }, [initialAtendimentoId]);

  const config = PARTE_CONFIG[parte];

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const [estRes, lojaMap] = await Promise.all([
      fetchAllRange<any>(() => supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).not('atendimento_venda_id', 'is', null)),
      fetchLojaMap(),
    ]);
    estRes.data = (estRes.data || []).map((r: any) => mapEstoqueMoto(r, lojaMap)).filter((e: any) => e.tipo === 'consignada');

    const result = await fetchAllRange<any>(() => supabase.from('atendimentos_motos').select(`*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*), motos_interesse(*, ${MARCA_MODELO_SELECT}), avaliacoes(*, ${MARCA_MODELO_SELECT})`).eq('situacao', 'vendido').order('updated_at', { ascending: false }));
    const atError = result.error;
    const atData = result.data || [];
    if (atError) { toast.error('Erro ao carregar intermediação'); setLoading(false); return; }

    const estoqueMap: Record<string, any> = {};
    (estRes.data || []).forEach((e: any) => { estoqueMap[e.atendimento_venda_id] = e; });

    let filtered = atData.filter(a => estoqueMap[a.id]).map(a => ({ ...flattenMarcaModelo(a), loja: a.loja_empresas?.loja, _estoqueMoto: estoqueMap[a.id] }));

    // Fetch owners in parallel: avaliacoes → atendimentos
    const avaliacaoIds = Object.values(estoqueMap).map((e: any) => e.avaliacao_id).filter(Boolean);
    if (avaliacaoIds.length > 0) {
      const { data: avalData } = await supabase.from('avaliacoes').select('id, atendimento_id').in('id', avaliacaoIds);
      if (avalData && avalData.length > 0) {
        const ownerAtIds = avalData.map((a: any) => a.atendimento_id).filter(Boolean);
        const { data: ownerData } = await supabase.from('atendimentos_motos').select('id, loja_id, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(nome_razao_social, telefone, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro))').in('id', ownerAtIds);
        const ownerMap: Record<string, any> = {};
        (ownerData || []).forEach((o: any) => { ownerMap[o.id] = { ...o, loja: (o as any).loja_empresas?.loja }; });
        const avalToOwner: Record<string, any> = {};
        avalData.forEach((a: any) => { avalToOwner[a.id] = ownerMap[a.atendimento_id]; });
        filtered = filtered.map(a => {
          const est = estoqueMap[a.id];
          const owner = est?.avaliacao_id ? avalToOwner[est.avaliacao_id] : null;
          return { ...a, _proprietario: owner };
        });
      }
    }

    if (search.trim()) { const s = search.trim().toLowerCase(); filtered = filtered.filter((a: any) => { const owner = a._proprietario; return [a.cliente?.nome_razao_social, a.cliente?.telefone, a.loja, owner?.cliente?.nome_razao_social, owner?.cliente?.telefone].some(f => f && String(f).toLowerCase().includes(s)); }); }

    // Auto-transition: check autorizacao_pagamento items whose previsão date is > 1 day past
    const autoTransitionIds = filtered
      .filter(a => a.intermediacao_parte1_status === 'autorizacao_pagamento')
      .map(a => a.id);

    if (autoTransitionIds.length > 0) {
      const { data: previsaoData } = await supabase
        .from('pos_venda_processos')
        .select('atendimento_id, data_conclusao')
        .eq('etapa', 'PREVISÃO DE PAGAMENTO')
        .in('atendimento_id', autoTransitionIds);

      const now = new Date();
      const idsToComplete: string[] = [];
      (previsaoData || []).forEach((p: any) => {
        if (p.data_conclusao) {
          const oneDayAfter = new Date(new Date(p.data_conclusao).getTime() + 24 * 60 * 60 * 1000);
          if (now >= oneDayAfter) idsToComplete.push(p.atendimento_id);
        }
      });

      if (idsToComplete.length > 0) {
        // Update in background, don't block UI
        for (const id of idsToComplete) {
          supabase.from('atendimentos_motos').update({ intermediacao_parte1_status: 'concluido' } as any).eq('id', id).then();
        }
        filtered = filtered.map(a => idsToComplete.includes(a.id) ? { ...a, intermediacao_parte1_status: 'concluido' } : a);
      }
    }

    // Parte 1 e Parte 2 são independentes — cada uma lista suas próprias pendências.
    filtered = filtered.filter(a => {
      const status = (parte === 'parte1' ? a.intermediacao_parte1_status : a.intermediacao_parte2_status) || 'em_aberto';
      return status !== 'concluido';
    });

    if (filterCidade !== 'todos') {
      filtered = filtered.filter((a: any) => {
        const loja = parte === 'parte1' ? (a._proprietario?.loja || a.loja) : a.loja;
        return matchesCidade(loja, filterCidade);
      });
    }

    // Fetch Previsão de Pagamento for all filtered items to show on the card
    const allIds = filtered.map(a => a.id);
    if (allIds.length > 0) {
      const { data: prevData } = await supabase
        .from('pos_venda_processos')
        .select('atendimento_id, data_conclusao')
        .eq('etapa', 'PREVISÃO DE PAGAMENTO')
        .in('atendimento_id', allIds);
      const prevMap: Record<string, string> = {};
      (prevData || []).forEach((p: any) => { if (p.data_conclusao) prevMap[p.atendimento_id] = p.data_conclusao; });
      filtered = filtered.map(a => ({ ...a, _previsaoPagamento: prevMap[a.id] || null }));
    }

    setItems(filtered);
    setLoading(false);
  }, [search, parte, filterCidade]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const getColumnItems = (status: string) => items.filter((a: any) => ((a as any)[config.statusField] || 'em_aberto') === status);

  const handleStatusChanged = useCallback((itemId: string, newStatus: string, field: string) => {
    setItems(prev => prev.map(a => a.id === itemId ? { ...a, [field]: newStatus } : a));
    setSelectedItem((prev: any) => prev && prev.id === itemId ? { ...prev, [field]: newStatus } : prev);
  }, []);

  if (selectedItem) {
    return (
      <PosVendaDetail
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        statusColumns={config.columns as any}
        statusField={config.statusField}
        processoProps={{
          customEtapas: config.etapas,
          statusField: config.statusField,
          statusRules: config.statusRules,
          showContratoConsignante: parte === 'parte1',
        }}
        onStatusChanged={handleStatusChanged}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2"><Handshake className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-foreground">Intermediação</h1></div>
        <p className="text-sm text-muted-foreground mt-0.5">Motos vendidas consignadas</p>
      </div>

      {/* Part 1 / Part 2 Toggle */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit border border-border/50">
        <button
          onClick={() => setParte('parte1')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            parte === 'parte1'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Parte 1
        </button>
        <button
          onClick={() => setParte('parte2')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            parte === 'parte2'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Parte 2
        </button>
      </div>

      <div className="flex flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Button variant="outline" size="icon" className="md:hidden shrink-0" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>
      <FiltersPanel show={showFilters}>
        <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
      </FiltersPanel>

      {loading ? (
        <KanbanSkeleton columns={3} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-3">
            {config.columns.map(col => {
              const colItems = getColumnItems(col.value);
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.hex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{colItems.length}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {colItems.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Nenhum item</p> : colItems.map((a: any) => {
                      const est = a._estoqueMoto;
                      const owner = a._proprietario;
                      const clientName = parte === 'parte1' && owner ? owner.cliente?.nome_razao_social : a.cliente?.nome_razao_social;
                      const clientPhone = parte === 'parte1' && owner ? owner.cliente?.telefone : a.cliente?.telefone;
                      const prev = a._previsaoPagamento;
                      const prevBadge = prev ? { label: (<span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{new Date(prev).toLocaleDateString('pt-BR')}</span>), className: 'border-primary/30 text-primary' } : undefined;
                      return <ProcessCard key={a.id} clientName={clientName} phone={clientPhone} motoLabel={est ? [est.placa?.replace(/-/g, ''), `${est.marca} ${(est.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined} loja={a.loja} patio={getSiglaFromLoja(est?.loja) || undefined} date={a.data_venda || a.updated_at} statusColor={col.hex} extraBadge={prevBadge} onClick={() => setSelectedItem(a)} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default IntermediacacaoTab;
