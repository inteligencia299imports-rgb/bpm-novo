import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ClipboardCheck, Filter } from 'lucide-react';
import { exigeAprovacao } from '@/lib/aprovacao';
import CompraProcessoView from '@/components/compras/CompraProcessoView';
import type { Avaliacao, SituacaoAvaliacao } from '@/types/crm';
import AvaliacaoCard from './AvaliacaoCard';
import AvaliacaoForm from './AvaliacaoForm';
import { toast } from 'sonner';
import KanbanSkeleton from '@/components/shared/KanbanSkeleton';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';
import FiltersPanel from '@/components/shared/FiltersPanel';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import { useAtendimentoUrlSync } from '@/hooks/useAtendimentoUrlSync';


// Moto adquirida volta ao board (pedido do usuário, 2026-11-22): "Aguardando
// Aprovação" (compra própria ainda não aprovada) e "Adquirido" (até a
// Preparação liberar a moto para o estoque). Abrem com a barra de etapas da
// compra (CompraProcessoView).
type ColunaAvaliacao = SituacaoAvaliacao | 'aguardando_aprovacao' | 'adquirido';
const KANBAN_COLUMNS: { value: ColunaAvaliacao; label: string; hex: string }[] = [
  { value: 'sem_avaliar', label: 'Sem Avaliar', hex: '#6B7280' },
  { value: 'em_aberto', label: 'Em Aberto', hex: '#2EC5FF' },
  { value: 'aguardando_aprovacao', label: 'Aguardando Aprovação', hex: '#6B7280' },
  { value: 'adquirido', label: 'Adquirido', hex: '#169d53' },
  { value: 'dispensada', label: 'Dispensada', hex: '#FF8C00' },
  { value: 'perdido', label: 'Perdido', hex: '#FF3B30' },
];
const SITUACOES_ADQUIRIDA = ['adquirida', 'oficina'];
const colunaDe = (a: any): ColunaAvaliacao | null => {
  if (SITUACOES_ADQUIRIDA.includes(a.situacao)) {
    return exigeAprovacao(a) && a.aprovacao_status !== 'aprovada' && a.atendimento?.interesse !== 'trocar'
      ? 'aguardando_aprovacao' : 'adquirido';
  }
  return a.situacao === 'estoque' ? null : a.situacao;
};

interface AvaliacoesTabProps {
  initialAvaliacaoId?: string | null;
  onInitialHandled?: () => void;
  onNavigateToPreparacao?: (avaliacaoId: string) => void;
  onNavigateToNps?: () => void;
}

const AvaliacoesTab = ({ initialAvaliacaoId, onInitialHandled, onNavigateToPreparacao, onNavigateToNps }: AvaliacoesTabProps = {}) => {
  const { role } = useAuth();
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');
  const [showFilters, setShowFilters] = useState(false);

  useAtendimentoUrlSync('avaliacoes', selectedId ? (avaliacoes.find((a) => a.id === selectedId) as any)?.atendimento?.id : null);

  useEffect(() => {
    if (initialAvaliacaoId) {
      setSelectedId(initialAvaliacaoId);
      onInitialHandled?.();
    }
  }, [initialAvaliacaoId]);

  const fetchAvaliacoes = useCallback(async () => {
    setLoading(true);
    const PER_STATUS_LIMIT = 50;
    const isSearching = search.trim().length > 0;
    const statuses = ['sem_avaliar', 'em_aberto', 'dispensada', 'perdido'];
    const selectStr = `*, ${MARCA_MODELO_SELECT}, atendimentos_motos!avaliacoes_atendimento_id_fkey!inner(id, loja_id, loja_empresas:loja_id(loja), vendedor_id, interesse, temperatura, cliente:clientes_fornecedores(nome_razao_social, telefone, data_nascimento, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro)))`;

    let data: any[];
    let error: any;
    const estResult = await supabase.from('estoque_motos').select('avaliacao_id, status, observacoes').not('avaliacao_id', 'is', null);
    // Só entram no fluxo de avaliação as motos efetivamente enviadas pelo
    // showroom ("Avaliação (enviar)"). Sem esse filtro, toda avaliacao criada
    // junto com o atendimento aparecia aqui como "sem_avaliar".
    if (isSearching) {
      const result = await supabase.from('avaliacoes').select(selectStr).eq('enviada_avaliacao', true).order('created_at', { ascending: false });
      error = result.error;
      data = result.data || [];
    } else {
      const statusResults = await Promise.all([
        ...statuses.map(s => supabase.from('avaliacoes').select(selectStr).eq('enviada_avaliacao', true).eq('situacao', s).order('created_at', { ascending: false }).limit(PER_STATUS_LIMIT)),
        // Adquiridas: aguardando/recusada na aprovação e as demais (até irem para o estoque).
        supabase.from('avaliacoes').select(selectStr).eq('enviada_avaliacao', true).in('situacao', SITUACOES_ADQUIRIDA)
          .in('aprovacao_status', ['aguardando', 'recusada']).order('created_at', { ascending: false }).limit(PER_STATUS_LIMIT),
        supabase.from('avaliacoes').select(selectStr).eq('enviada_avaliacao', true).in('situacao', SITUACOES_ADQUIRIDA)
          .or('aprovacao_status.is.null,aprovacao_status.eq.aprovada').order('created_at', { ascending: false }).limit(PER_STATUS_LIMIT),
      ]);
      error = statusResults.find(r => r.error)?.error;
      data = statusResults.flatMap(r => r.data || []);
    }
    const estData = estResult.data;

    if (error) {
      toast.error('Erro ao carregar avaliações');
      console.error(error);
    } else {
      const estoqueMap: Record<string, { status: string; observacoes: string | null }> = {};
      (estData || []).forEach((e: any) => { if (e.avaliacao_id) estoqueMap[e.avaliacao_id] = { status: e.status, observacoes: e.observacoes }; });

      let mapped = (data || []).map((raw: any) => {
        const d = flattenMarcaModelo(raw);
        return {
          ...d,
          atendimento: { ...d.atendimentos_motos, loja: d.atendimentos_motos?.loja_empresas?.loja },
          _estoqueInfo: estoqueMap[d.id] || null,
        };
      });
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        mapped = mapped.filter((a: any) => {
          const fields = [
            a.atendimento?.cliente?.nome_razao_social,
            a.atendimento?.cliente?.telefone,
            a.atendimento?.loja,
            a.marca,
            a.modelo,
            a.placa,
            a.cor,
          ];
          return fields.some(f => f && String(f).toLowerCase().includes(s));
        });
      }
      setAvaliacoes(mapped);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchAvaliacoes(); }, [fetchAvaliacoes]);

  const handleClose = () => {
    setSelectedId(null);
    fetchAvaliacoes();
  };

  if (selectedId) {
    const sel = avaliacoes.find((a) => a.id === selectedId);
    const coluna = sel ? colunaDe(sel) : null;
    // Adquirida: barra de etapas da compra.
    if (coluna === 'aguardando_aprovacao' || coluna === 'adquirido') {
      return (
        <CompraProcessoView
          avaliacaoId={selectedId}
          contextoBase="avaliacao"
          etapaInicial={coluna === 'aguardando_aprovacao' ? 'aprovacao' : undefined}
          onClose={handleClose}
          onNavigateToPreparacao={onNavigateToPreparacao}
          onNavigateToNps={onNavigateToNps}
        />
      );
    }
    return <AvaliacaoForm avaliacaoId={selectedId} onClose={handleClose} />;
  }

  const getColumnAvaliacoes = (coluna: ColunaAvaliacao) =>
    avaliacoes.filter(a => {
      if (!matchesCidade((a as any).atendimento?.loja, filterCidade)) return false;
      return colunaDe(a) === coluna;
    });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Avaliações</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Pipeline de avaliações de motos</p>
      </div>

      {/* Search */}
      <div className="flex flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, marca, modelo ou placa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
      </div>
      <Button variant="outline" size="icon" className="md:hidden shrink-0" onClick={() => setShowFilters(!showFilters)}>
        <Filter className="h-4 w-4" />
      </Button>
      </div>

      <FiltersPanel show={showFilters}>
        <CidadeFilter value={filterCidade} onChange={setFilterCidade} />
      </FiltersPanel>


      {/* Kanban Board */}
      {loading ? (
        <KanbanSkeleton columns={6} />
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-x-visible">
          <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-6">
            {KANBAN_COLUMNS.map(col => {
              const items = getColumnAvaliacoes(col.value);
              const colHex = col.hex;
              return (
                <div key={col.value} className="w-[320px] shrink-0 md:w-auto md:shrink flex flex-col">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colHex }} />
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {/* Column body */}
                  <div className="bg-muted/50 rounded-lg p-2.5 flex-1 min-h-[200px] space-y-2.5 border border-border/50">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma avaliação</p>
                    ) : (
                      items.map(a => (
                        <AvaliacaoCard key={a.id} avaliacao={a} onOpen={() => setSelectedId(a.id)} role={role} statusColorOverride={colHex} />
                      ))
                    )}
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

export default AvaliacoesTab;
