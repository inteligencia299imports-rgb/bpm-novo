import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Atendimento } from '@/types/crm';
import { carregarEtapasVenda, type ContextoVenda, type EtapaVenda, type EtapaVendaKey } from '@/lib/etapasVenda';
import { ESTOQUE_MOTO_SELECT, ESTOQUE_NOVA_SELECT, mapEstoqueMoto, mapEstoqueMotoNova, fetchLojaMap } from '@/lib/estoqueMoto';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import AtendimentoDetail from '@/components/showroom/AtendimentoDetail';
import PosVendaDetail from '@/components/pos-venda/PosVendaDetail';
import { PARTE_CONFIG } from '@/lib/intermediacaoConfig';
import DetailSkeleton from '@/components/shared/DetailSkeleton';
import EtapasVendaBar from './EtapasVendaBar';
import { podeAcessarAba } from '@/lib/abasPermissao';

interface Props {
  atendimento: Atendimento;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
  onStatusUpdated?: () => void;
  onNavigateToNps?: () => void;
  onNavigateToPosCompra?: (avaliacaoId: string) => void;
  /** Etapa a abrir ao entrar (ex.: Aprovação, vindo da coluna Aguardando Aprovação). Se estiver bloqueada, fica na Negociação. */
  etapaInicial?: EtapaVendaKey;
  /**
   * Aberta pela aba Pós-Venda / Intermediação: começa na tela da aba (pós-venda,
   * parte 1 ou parte 2, sem seta destacada) e o voltar dessa tela fecha a venda.
   */
  base?: 'pos_venda' | 'parte1' | 'parte2';
}

/** Tela própria da aba que abriu a venda (nenhuma seta destacada). */
const BASE = '__base';
type Aberta = EtapaVendaKey | typeof BASE;

type Parte = 'parte1' | 'parte2';

const AT_SELECT = `*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*)), motos_interesse(*, ${MARCA_MODELO_SELECT}), avaliacoes!avaliacoes_atendimento_id_fkey(*, ${MARCA_MODELO_SELECT})`;

// Etapas que são feitas no checklist do Processo (abre direto nele).
const ETAPAS_PROCESSO = new Set<EtapaVendaKey>([
  'vistoria', 'nf_compra', 'nf_venda', 'renave', 'transferencia',
]);
// Moto consignada: a vistoria fica na Parte 2 (consignante).
const ETAPAS_PARTE2 = new Set<EtapaVendaKey>(['vistoria']);
// Etapas feitas na própria tela do atendimento (Proposta e Entrega).
const ACAO_ATENDIMENTO: Partial<Record<EtapaVendaKey, 'contrato' | 'entrega'>> = {
  contrato: 'contrato',
  entrega: 'entrega',
};
const ETAPAS_ATENDIMENTO = new Set<EtapaVendaKey>(['negociacao', 'contrato', 'entrega']);

/** Mesmo item que as abas Pós-Venda / Intermediação montam para o PosVendaDetail. */
async function carregarItemVenda(atendimentoId: string, consignada: boolean) {
  const { data: raw } = await supabase.from('atendimentos_motos').select(AT_SELECT).eq('id', atendimentoId).single();
  const data: any = flattenMarcaModelo(raw as any);
  if (!data) return null;
  const lojaMap = await fetchLojaMap();
  const [{ data: estRow }, { data: estNovaRow }] = await Promise.all([
    supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).eq('atendimento_venda_id', data.id).maybeSingle(),
    supabase.from('estoque_motos_novas').select(ESTOQUE_NOVA_SELECT).eq('atendimento_venda_id', data.id).maybeSingle(),
  ]);
  const est: any = estRow ? mapEstoqueMoto(estRow, lojaMap) : (estNovaRow ? mapEstoqueMotoNova(estNovaRow, lojaMap) : null);
  const estoqueOk = consignada ? est?.tipo === 'consignada' : (est?.tipo === 'propria' || est?.tipo === '0km');
  return { ...data, loja: data.loja_empresas?.loja, _estoqueMoto: est && estoqueOk ? est : null };
}

/**
 * Atendimento vendido: barra de etapas no topo e, abaixo, a tela da etapa
 * escolhida — as mesmas telas de sempre (detalhe do atendimento, pós-venda /
 * intermediação com o Processo aberto, NPS).
 */
const VendaProcessoView: React.FC<Props> = ({
  atendimento, onClose, onEdit, onDeleted, onStatusUpdated, onNavigateToNps, onNavigateToPosCompra, etapaInicial, base,
}) => {
  const { role } = useAuth();
  const [etapas, setEtapas] = useState<EtapaVenda[]>([]);
  const [contexto, setContexto] = useState<ContextoVenda | null>(null);
  const [loadingEtapas, setLoadingEtapas] = useState(true);
  const [etapaAberta, setEtapaAberta] = useState<Aberta>(base ? BASE : 'negociacao');
  // Enquanto decide a etapa inicial, mostra o esqueleto (sem piscar a Negociação).
  const [inicialResolvida, setInicialResolvida] = useState(!etapaInicial);
  const [item, setItem] = useState<any | null>(null);
  const [parte, setParte] = useState<Parte>(base === 'parte2' ? 'parte2' : 'parte1');

  // Aberta pela aba Pós-Venda / Intermediação: carrega a tela da aba de cara.
  useEffect(() => {
    if (!base) return;
    carregarItemVenda(atendimento.id, base !== 'pos_venda').then(setItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recarregarEtapas = useCallback(async () => {
    setLoadingEtapas(true);
    try {
      const r = await carregarEtapasVenda(atendimento.id);
      setEtapas(r.etapas);
      setContexto(r.contexto);
    } finally {
      setLoadingEtapas(false);
    }
  }, [atendimento.id]);

  useEffect(() => { recarregarEtapas(); }, [recarregarEtapas]);

  // Etapa que não abre (sem reação ao clique), com o motivo para o tooltip:
  // - pós-venda e intermediação são telas de gerente/master (mesmas permissões das abas);
  // - etapa que depende de outra ainda pendente, para qualquer nível de usuário.
  const bloqueadas = useMemo(() => {
    // Etapas fora do atendimento abrem o Pós-Venda/Intermediação: quem não tem a aba não abre.
    // Exceção: Aprovação também para o gerente, que pode desaprovar (2026-11-22).
    const gestor = podeAcessarAba('pos_venda', role);
    const m = new Map<EtapaVendaKey, string>();
    for (const e of etapas) {
      if (e.key === 'negociacao') continue;
      const acessa = gestor || ETAPAS_ATENDIMENTO.has(e.key) || e.key === 'nps' || (e.key === 'aprovacao' && role === 'gerente');
      if (e.aguardando) m.set(e.key, `Aguardando ${e.aguardando}`);
      else if (!acessa) m.set(e.key, 'Sem acesso');
    }
    return m;
  }, [role, etapas]);

  const abrirEtapa = async (key: EtapaVendaKey) => {
    if (bloqueadas.has(key)) return;
    if (key === 'nps') { onNavigateToNps?.(); return; }
    if (ETAPAS_ATENDIMENTO.has(key)) { setEtapaAberta(key); setItem(null); return; }
    const consignada = !!contexto?.consignada;
    setParte(consignada && ETAPAS_PARTE2.has(key) ? 'parte2' : 'parte1');
    setEtapaAberta(key);
    setItem(null);
    setItem(await carregarItemVenda(atendimento.id, consignada));
  };

  useEffect(() => {
    if (inicialResolvida || loadingEtapas) return;
    if (etapaInicial && etapas.some((e) => e.key === etapaInicial) && !bloqueadas.has(etapaInicial)) abrirEtapa(etapaInicial);
    setInicialResolvida(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicialResolvida, loadingEtapas]);

  const voltarParaNegociacao = () => {
    // Vindo da aba Pós-Venda / Intermediação, voltar da tela da aba fecha a venda.
    if (base && etapaAberta === BASE) { onClose(); return; }
    setEtapaAberta('negociacao');
    setItem(null);
    recarregarEtapas();
    onStatusUpdated?.();
  };

  const barra = (
    <EtapasVendaBar
      etapas={etapas}
      selecionada={etapaAberta as EtapaVendaKey}
      onSelect={abrirEtapa}
      bloqueadas={bloqueadas}
      loading={loadingEtapas}
    />
  );

  // Pop-up da etapa (Proposta, Entrega, Processo) só abre se ela estiver pendente;
  // e cada tela mostra só o botão da própria etapa (pedido do usuário, 2026-11-22).
  const pendente = (k: Aberta) => k !== BASE && !etapas.find((e) => e.key === k)?.concluida;

  let conteudo: React.ReactNode;
  if (!inicialResolvida) {
    conteudo = <DetailSkeleton onClose={onClose} />;
  } else if (etapaAberta !== BASE && ETAPAS_ATENDIMENTO.has(etapaAberta)) {
    conteudo = (
      <AtendimentoDetail
        key={etapaAberta}
        atendimento={atendimento}
        acaoInicial={pendente(etapaAberta) ? ACAO_ATENDIMENTO[etapaAberta as EtapaVendaKey] : undefined}
        botoesEtapa={etapaAberta === 'contrato' ? ['proposta'] : etapaAberta === 'entrega' ? ['entrega'] : []}
        rolagemNaPagina
        onClose={onClose}
        onEdit={onEdit}
        onDeleted={onDeleted}
        onStatusUpdated={() => { recarregarEtapas(); onStatusUpdated?.(); }}
      />
    );
  } else if (!item) {
    conteudo = <DetailSkeleton onClose={voltarParaNegociacao} />;
  } else {
    const consignada = base ? base !== 'pos_venda' : !!contexto?.consignada;
    const config = PARTE_CONFIG[parte];
    conteudo = (
      <PosVendaDetail
        key={`${etapaAberta}-${parte}`}
        item={item}
        onClose={voltarParaNegociacao}
        abrirProcessoAoAbrir={etapaAberta !== BASE && ETAPAS_PROCESSO.has(etapaAberta) && pendente(etapaAberta)}
        botoesEtapa={etapaAberta !== BASE && ETAPAS_PROCESSO.has(etapaAberta) ? ['processo'] : etapaAberta === 'aprovacao' ? ['proposta'] : []}
        rolagemNaPagina
        onNavigateToPosCompra={onNavigateToPosCompra}
        onStatusChanged={() => { recarregarEtapas(); }}
        {...(consignada ? {
          statusColumns: config.columns as any,
          statusField: config.statusField,
          processoProps: {
            customEtapas: config.etapas,
            statusField: config.statusField,
            statusRules: config.statusRules,
            showContratoConsignante: parte === 'parte2',
          },
        } : {})}
      />
    );
  }

  return (
    <div className="space-y-3">
      {barra}
      {conteudo}
    </div>
  );
};

export default VendaProcessoView;
