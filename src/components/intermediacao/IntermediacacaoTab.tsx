import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Search, X, Handshake } from 'lucide-react';
import { INTERMEDIACAO_PARTE1_COLUMNS, INTERMEDIACAO_PARTE2_COLUMNS, INTERMEDIACAO_PARTE1_ETAPAS, INTERMEDIACAO_PARTE2_ETAPAS } from '@/types/crm';
import ProcessCard from '@/components/shared/ProcessCard';
import PosVendaDetail from '@/components/pos-venda/PosVendaDetail';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';

type Parte = 'parte1' | 'parte2';

const PARTE_CONFIG = {
  parte1: {
    columns: INTERMEDIACAO_PARTE1_COLUMNS,
    statusField: 'intermediacao_parte1_status',
    etapas: INTERMEDIACAO_PARTE1_ETAPAS,
    observacoesField: 'pos_venda_observacoes',
    statusRules: {
      concluded: 'AUTORIZAÇÃO DE PAGAMENTO',
      default: 'em_andamento',
    },
  },
  parte2: {
    columns: INTERMEDIACAO_PARTE2_COLUMNS,
    statusField: 'intermediacao_parte2_status',
    etapas: INTERMEDIACAO_PARTE2_ETAPAS,
    observacoesField: 'pos_venda_observacoes',
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

  useEffect(() => {
    if (initialAtendimentoId) {
      supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').eq('id', initialAtendimentoId).single().then(async ({ data }) => {
        if (data) {
          const { data: est } = await supabase.from('estoque').select('atendimento_venda_id, marca, modelo, placa, tipo, avaliacao_id').eq('atendimento_venda_id', data.id).eq('tipo', 'consignada').maybeSingle();
          setSelectedItem({ ...data, _estoqueMoto: est });
        }
      });
      onInitialHandled?.();
    }
  }, [initialAtendimentoId]);

  const config = PARTE_CONFIG[parte];

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const PER_STATUS_LIMIT = 50;
    const statuses = config.columns.map((c: any) => c.value);
    const statusField = config.statusField as 'intermediacao_parte1_status' | 'intermediacao_parte2_status';
    // Fetch atendimentos per status and consignada estoque in parallel
    const [statusResults, estRes] = await Promise.all([
      Promise.all(statuses.map((s: string) => supabase.from('atendimentos').select('*, motos_interesse(*), motos_avaliacao(*)').eq('situacao', 'vendido').eq(statusField, s).order('updated_at', { ascending: false }).limit(PER_STATUS_LIMIT))),
      supabase.from('estoque').select('atendimento_venda_id, marca, modelo, placa, tipo, avaliacao_id, status, observacoes').eq('tipo', 'consignada'),
    ]);
    const atError = statusResults.find(r => r.error)?.error;
    if (atError) { toast.error('Erro ao carregar intermediação'); setLoading(false); return; }
    const atData = statusResults.flatMap(r => r.data || []);

    const estoqueMap: Record<string, any> = {};
    (estRes.data || []).forEach((e: any) => { estoqueMap[e.atendimento_venda_id] = e; });

    let filtered = atData.filter(a => estoqueMap[a.id]).map(a => ({ ...a, _estoqueMoto: estoqueMap[a.id] }));

    // Fetch owners in parallel: avaliacoes → atendimentos
    const avaliacaoIds = Object.values(estoqueMap).map((e: any) => e.avaliacao_id).filter(Boolean);
    if (avaliacaoIds.length > 0) {
      const { data: avalData } = await supabase.from('avaliacoes').select('id, atendimento_id').in('id', avaliacaoIds);
      if (avalData && avalData.length > 0) {
        const ownerAtIds = avalData.map((a: any) => a.atendimento_id).filter(Boolean);
        const { data: ownerData } = await supabase.from('atendimentos').select('id, nome_cliente, telefone, loja, cpf_cnpj, email, cep, endereco').in('id', ownerAtIds);
        const ownerMap: Record<string, any> = {};
        (ownerData || []).forEach((o: any) => { ownerMap[o.id] = o; });
        const avalToOwner: Record<string, any> = {};
        avalData.forEach((a: any) => { avalToOwner[a.id] = ownerMap[a.atendimento_id]; });
        filtered = filtered.map(a => {
          const est = estoqueMap[a.id];
          const owner = est?.avaliacao_id ? avalToOwner[est.avaliacao_id] : null;
          return { ...a, _proprietario: owner };
        });
      }
    }

    if (search.trim()) { const s = search.trim().toLowerCase(); filtered = filtered.filter((a: any) => { const owner = a._proprietario; return [a.nome_cliente, a.telefone, a.loja, owner?.nome_cliente, owner?.telefone].some(f => f && String(f).toLowerCase().includes(s)); }); }

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
          supabase.from('atendimentos').update({ intermediacao_parte1_status: 'concluido' } as any).eq('id', id).then();
        }
        filtered = filtered.map(a => idsToComplete.includes(a.id) ? { ...a, intermediacao_parte1_status: 'concluido' } : a);
      }
    }

    // Filter out concluido items for parte1
    filtered = filtered.filter(a => a.intermediacao_parte1_status !== 'concluido' || parte !== 'parte1');

    setItems(filtered);
    setLoading(false);
  }, [search, parte]);

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
          observacoesField: config.observacoesField,
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </div>
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
                      const clientName = parte === 'parte1' && owner ? owner.nome_cliente : a.nome_cliente;
                      const clientPhone = parte === 'parte1' && owner ? owner.telefone : a.telefone;
                      return <ProcessCard key={a.id} clientName={clientName} phone={clientPhone} motoLabel={est ? [est.placa?.replace(/-/g, ''), `${est.marca} ${(est.modelo || '').toUpperCase()}`].filter(Boolean).join(' - ') : undefined} loja={a.loja} date={a.updated_at} statusColor={col.hex} onClick={() => setSelectedItem(a)} />;
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
