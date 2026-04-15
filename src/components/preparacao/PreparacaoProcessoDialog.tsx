import React, { useState, useEffect } from 'react';
import { isTipoPropria, isTipoConsignada, getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Loader2, History, Wrench, Truck, CheckCircle, Package, AlertCircle, Check, ArrowLeft } from 'lucide-react';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PREPARACAO_COLUMNS, LOJAS } from '@/types/crm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  currentStatus: string;
  avaliacaoData?: any;
  onStatusChanged?: (newStatus: string) => void;
  reenviarFromEstoque?: {
    estoqueItemId: string;
    modelo: string;
    placa?: string | null;
  };
  onReenviarSuccess?: () => void;
}

interface HistoryEntry {
  id: string;
  entity_type: string;
  status: string;
  observacoes: string | null;
  changed_by_name: string | null;
  created_at: string;
}

const AVALIACAO_STATUS_LABELS: Record<string, string> = {
  sem_avaliar: 'Sem Avaliar',
  sem_avaliacao: 'Sem Avaliação',
  em_aberto: 'Em Aberto',
  adquirida: 'Adquirida',
  dispensada: 'Dispensada',
  perdido: 'Perdido',
  avaliacao_solicitada: 'Avaliação Solicitada',
  avaliacao_realizada: 'Avaliação Realizada',
  avaliada: 'Avaliada',
  sem_consulta: 'Sem Consulta',
  consulta_solicitada: 'Consulta Solicitada',
  consulta_realizada: 'Consulta Realizada',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  avaliacao: 'Avaliação',
  consulta: 'Consulta',
  preparacao: 'Preparação',
};

const getStatusLabel = (value: string, entityType?: string) => {
  if (entityType === 'avaliacao' || entityType === 'consulta') return AVALIACAO_STATUS_LABELS[value] || value;
  return PREPARACAO_COLUMNS.find(c => c.value === value)?.label || AVALIACAO_STATUS_LABELS[value] || value;
};
const getStatusHex = (value: string) => PREPARACAO_COLUMNS.find(c => c.value === value)?.hex || '#888';

const ACTION_BUTTONS = [
  { value: 'pendente', label: 'Pendente', icon: AlertCircle, targetStatus: 'pendente' },
  { value: 'oficina', label: 'Oficina', icon: Wrench, targetStatus: 'oficina' },
  { value: 'servico_externo', label: 'Serviço Externo', icon: Truck, targetStatus: 'servico_externo' },
  { value: 'preparacao', label: 'Preparação', icon: CheckCircle, targetStatus: 'aguardando_aceite' },
  { value: 'aceite', label: 'Aceite', icon: Check, targetStatus: 'aguardando_liberacao_estoque' },
  { value: 'liberar', label: 'Liberar', icon: Package, targetStatus: 'liberar' },
];

const formatCurrencyInput = (value: string) => {
  const nums = value.replace(/\D/g, '');
  if (!nums) return '';
  const n = parseInt(nums, 10) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyValue = (value: string): number | null => {
  if (!value) return null;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const PreparacaoProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, currentStatus, avaliacaoData, onStatusChanged, reenviarFromEstoque, onReenviarSuccess }) => {
  const { role } = useAuth();
  const isReadOnly = role === 'vendedor';
  const isInEstoque = avaliacaoData?.situacao === 'estoque';
  const isEstoqueIdle = isInEstoque && (currentStatus === 'estoque' || !currentStatus);
  const isEstoqueTracking = isInEstoque && !isEstoqueIdle;
  const [detalhes, setDetalhes] = useState('');
  const [reenviarObs, setReenviarObs] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLiberarForm, setShowLiberarForm] = useState(false);
  const [activeStatus, setActiveStatus] = useState(currentStatus);
  const [pendingSteps, setPendingSteps] = useState<string[]>([]);

  // Liberar form fields
  const [empresa, setEmpresa] = useState('');
  const [loja, setLoja] = useState('');
  const [placa, setPlaca] = useState('');
  const [cilindrada, setCilindrada] = useState('');
  const [precoTabela, setPrecoTabela] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');
  const [obsMoto, setObsMoto] = useState('');

  const [libManual, setLibManual] = useState('');
  const [libChaveReserva, setLibChaveReserva] = useState('');
  const [libRevisaoVencida, setLibRevisaoVencida] = useState('');

  const formatKm = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  useEffect(() => {
    if (!open) return;
    setActiveStatus(currentStatus);
    setDetalhes('');
    setReenviarObs('');
    setShowLiberarForm(false);
    setEmpresa('MMATOS');
    // Pre-populate from avaliação/atendimento data
    setLoja(avaliacaoData?.atendimento?.loja || '');
    setPlaca(avaliacaoData?.moto?.placa || '');
    setCilindrada(avaliacaoData?.moto?.cilindrada ? formatKm(avaliacaoData.moto.cilindrada) : '');
    const quantoPede = avaliacaoData?.quanto_pede;
    setPrecoTabela(quantoPede != null ? formatCurrencyInput(String(Math.round(quantoPede * 100))) : '');
    const fechamento = avaliacaoData?.valor_fechamento;
    setValorFechamento(fechamento != null ? formatCurrencyInput(String(Math.round(fechamento * 100))) : '');
    setObsMoto(avaliacaoData?.moto?.observacoes || '');
    const ma = avaliacaoData?.moto;
    setLibManual(ma?.tem_manual ? 'sim' : ma?.tem_manual === false ? 'nao' : '');
    setLibChaveReserva(ma?.tem_chave_reserva ? 'sim' : ma?.tem_chave_reserva === false ? 'nao' : '');
    setLibRevisaoVencida(ma?.manutencao_vencida ? 'sim' : ma?.manutencao_vencida === false ? 'nao' : '');

    const loadHistory = async () => {
      setLoading(true);
      const motoAvaliacaoId = avaliacaoData?.moto_avaliacao_id;
      
      // Fetch preparacao history
      const prepPromise = supabase
        .from('status_history')
        .select('*')
        .eq('entity_id', avaliacaoId)
        .eq('entity_type', 'preparacao')
        .order('created_at', { ascending: false });

      // Fetch avaliacao history - only acquisition entry (adquirida)
      const avaliacaoPromise = motoAvaliacaoId
        ? supabase
            .from('status_history')
            .select('*')
            .eq('entity_id', motoAvaliacaoId)
            .eq('entity_type', 'avaliacao')
            .in('status', ['adquirida'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] });

      // Fetch showroom history - only vendido entry (for troca cases)
      const atendimentoId = avaliacaoData?.atendimento_id;
      const showroomPromise = atendimentoId
        ? supabase
            .from('status_history')
            .select('*')
            .eq('entity_id', atendimentoId)
            .eq('entity_type', 'showroom')
            .in('status', ['vendido'])
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] });

      const [prepRes, avalRes, showroomRes] = await Promise.all([prepPromise, avaliacaoPromise, showroomPromise]);

      const prepHistory = (prepRes.data as HistoryEntry[]) || [];
      const avalHistory = (avalRes.data as HistoryEntry[]) || [];
      const showroomHistory = (showroomRes.data as HistoryEntry[]) || [];
      
      // Remap status labels for display
      const STATUS_REMAP: Record<string, string> = {
        vendido: 'Adquirida',
        adquirida: 'Adquirida',
        sinal: 'Sinal',
        estoque: 'Moto Liberada',
        indisponivel: 'Serviço',
        indisponivel_manual: 'INDISPONÍVEL',
        bloqueio_juridico: 'BLOQUEIO JURÍDICO',
        reenviada_preparacao: 'REENVIADA PREPARAÇÃO',
        ...Object.fromEntries(PREPARACAO_COLUMNS.map(c => [c.value, c.label])),
      };
      const remapStatus = (s: string) => STATUS_REMAP[s] || s;

      // Merge and sort by date descending
      const merged = [...prepHistory, ...avalHistory, ...showroomHistory]
        .map(h => ({ ...h, status: remapStatus(h.status) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setHistory(merged);

      // Fetch pending release steps
      const tipo = avaliacaoData?.tipo_aquisicao;
      const pending: string[] = [];
      if (isTipoPropria(tipo)) {
        const { data: pcSteps } = await supabase.from('pos_compra_processos')
          .select('etapa, concluida').eq('avaliacao_id', avaliacaoId)
          .in('etapa', ['NF EMITIDA', 'VISTORIA/CADEIA DOMINIAL']);
        if (!pcSteps?.find(p => p.etapa === 'NF EMITIDA')?.concluida) pending.push('NF Emitida (Pós-Compra)');
        if (!pcSteps?.find(p => p.etapa === 'VISTORIA/CADEIA DOMINIAL')?.concluida) pending.push('Vistoria/Cadeia Dominial (Pós-Compra)');
      } else if (isTipoConsignada(tipo)) {
        const { data: consigSteps } = await supabase.from('consignacao_processos')
          .select('etapa, concluida').eq('avaliacao_id', avaliacaoId).eq('etapa', 'NF EMITIDA');
        if (!consigSteps?.find(p => p.etapa === 'NF EMITIDA')?.concluida) pending.push('NF Emitida (Consignação)');
      }
      setPendingSteps(pending);

      setLoading(false);
    };

    loadHistory();
  }, [open, avaliacaoId, currentStatus, avaliacaoData?.moto_avaliacao_id]);

  const getUserInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let userName = 'Usuário';
    if (user) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('nome')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleData?.nome) userName = roleData.nome;
    }
    return { user, userName };
  };

  const insertHistory = async (params: {
    statusTo: string;
    observacoes: string | null;
    changedBy: string;
    changedByName: string;
  }) => {
    const { error } = await supabase.from('status_history').insert({
      entity_id: avaliacaoId,
      entity_type: 'preparacao',
      status: params.statusTo,
      observacoes: params.observacoes,
      changed_by: params.changedBy,
      changed_by_name: params.changedByName,
    });

    if (error) {
      console.error('Erro ao registrar histórico:', error);
      return false;
    }

    return true;
  };

  const handleAction = async (targetStatus: string, _actionLabel: string) => {
    if (!detalhes.trim()) {
      toast.error('Preencha os detalhes da movimentação');
      return;
    }

    if (targetStatus === 'liberar') {
      // Validate prerequisites before allowing stock release
      const tipoAquisicao = avaliacaoData?.tipo_aquisicao;
      const isConsignada = isTipoConsignada(tipoAquisicao);
      const isPropria = isTipoPropria(tipoAquisicao);

      const pendencias: string[] = [];

      if (isPropria) {
        // Check pos_compra_processos for NF EMITIDA and VISTORIA/CADEIA DOMINIAL
        const { data: processos } = await supabase
          .from('pos_compra_processos')
          .select('etapa, concluida')
          .eq('avaliacao_id', avaliacaoId)
          .in('etapa', ['NF EMITIDA', 'VISTORIA/CADEIA DOMINIAL']);

        const nfEmitida = processos?.find(p => p.etapa === 'NF EMITIDA');
        const vistoria = processos?.find(p => p.etapa === 'VISTORIA/CADEIA DOMINIAL');

        if (!nfEmitida?.concluida) pendencias.push('NF Emitida (Pós-Compra)');
        if (!vistoria?.concluida) pendencias.push('Vistoria/Cadeia Dominial (Pós-Compra)');
      } else if (isConsignada) {
        // Check consignacao_processos for NF EMITIDA
        const { data: processos } = await supabase
          .from('consignacao_processos')
          .select('etapa, concluida')
          .eq('avaliacao_id', avaliacaoId)
          .eq('etapa', 'NF EMITIDA');

        const nfEmitida = processos?.find(p => p.etapa === 'NF EMITIDA');
        if (!nfEmitida?.concluida) pendencias.push('NF Emitida (Consignação)');
      }

      if (pendencias.length > 0) {
        toast.error(`Pendências para liberar estoque: ${pendencias.join(', ')}`, { duration: 5000 });
        return;
      }

      setShowLiberarForm(true);
      return;
    }

    setSaving(true);
    try {
      const { user, userName } = await getUserInfo();
      if (!user) {
        toast.error('Sua sessão expirou. Faça login novamente para continuar.');
        return;
      }

      const statusFrom = activeStatus || currentStatus || 'em_aberto';
      const observacoes = detalhes.trim();

      const { error: updateError } = await supabase
        .from('avaliacoes')
        .update({ preparacao_status: targetStatus } as any)
        .eq('id', avaliacaoId);

      if (updateError) {
        console.error('Erro ao atualizar status:', updateError);
        toast.error('Erro ao atualizar status');
        return;
      }

      const historySaved = await insertHistory({
        statusTo: targetStatus,
        observacoes,
        changedBy: user.id,
        changedByName: userName,
      });

      if (!historySaved) {
        toast.error('Status alterado, mas erro ao registrar histórico');
      } else {
        toast.success(`Status alterado para ${getStatusLabel(targetStatus)}`);
      }

      setActiveStatus(targetStatus);
      onStatusChanged?.(targetStatus);
      onOpenChange(false);
    } catch (err) {
      console.error('Erro:', err);
      toast.error('Erro ao salvar processo');
    } finally {
      setSaving(false);
    }
  };

  const handleLiberar = async () => {
    if (!empresa || !loja || !placa.trim() || !cilindrada.trim() || !precoTabela || !valorFechamento) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const { user, userName } = await getUserInfo();
      if (!user) {
        toast.error('Sua sessão expirou. Faça login novamente para continuar.');
        return;
      }

      const statusFrom = activeStatus || currentStatus || 'em_aberto';

      // Load avaliacao with moto data
      const { data: avaliacao, error: avaliacaoError } = await supabase
        .from('avaliacoes')
        .select('*, motos_avaliacao(*)')
        .eq('id', avaliacaoId)
        .single();

      if (avaliacaoError || !avaliacao) {
        console.error('Erro ao carregar avaliação:', avaliacaoError);
        toast.error('Erro ao carregar dados da avaliação');
        return;
      }

      const moto = avaliacao.motos_avaliacao;
      const precoValue = parseCurrencyValue(precoTabela);
      const fechamentoValue = parseCurrencyValue(valorFechamento);

      // Insert into estoque
      const { error: estoqueError } = await supabase.from('estoque').insert({
        tipo: isTipoConsignada(avaliacao.tipo_aquisicao) ? 'consignada' : 'propria',
        marca: moto.marca,
        categoria: moto.categoria || null,
        modelo: moto.modelo,
        cor: moto.cor || null,
        cilindrada: cilindrada.trim(),
        placa: placa.trim().toUpperCase(),
        ano_fabricacao: moto.ano_fabricacao || null,
        ano_modelo: moto.ano_modelo || null,
        km: moto.km || null,
        empresa,
        preco: precoValue,
        status: 'disponivel',
        avaliacao_id: avaliacaoId,
        moto_avaliacao_id: moto.id,
        observacoes: obsMoto.trim() || null,
        data_entrada: new Date().toISOString(),
        classificacao: avaliacao.classificacao || null,
      } as any);

      if (estoqueError) {
        console.error('Erro ao registrar no estoque:', estoqueError);
        toast.error('Erro ao registrar no estoque');
        return;
      }

      // Update moto_avaliacao with manual/chave/revisão
      const motoUpdate: any = {};
      if (libManual) motoUpdate.tem_manual = libManual === 'sim';
      if (libChaveReserva) motoUpdate.tem_chave_reserva = libChaveReserva === 'sim';
      if (libRevisaoVencida) motoUpdate.manutencao_vencida = libRevisaoVencida === 'sim';
      if (Object.keys(motoUpdate).length > 0 && moto?.id) {
        await supabase.from('motos_avaliacao').update(motoUpdate).eq('id', moto.id);
      }

      const { error: updateError } = await supabase
        .from('avaliacoes')
        .update({
          preparacao_status: 'estoque',
          situacao: 'estoque',
          valor_fechamento: fechamentoValue,
        } as any)
        .eq('id', avaliacaoId);

      if (updateError) {
        console.error('Erro ao atualizar avaliação:', updateError);
        toast.error('Estoque registrado, mas houve erro ao atualizar o status');
        return;
      }

      const historySaved = await insertHistory({
        statusTo: 'estoque',
        observacoes: `MOTO LIBERADA. Empresa: ${empresa}, Loja: ${loja}, Placa: ${placa.trim().toUpperCase()}${detalhes.trim() ? `. ${detalhes.trim()}` : ''}`,
        changedBy: user.id,
        changedByName: userName,
      });

      if (!historySaved) {
        toast.error('Estoque registrado, mas erro ao registrar histórico');
      } else {
        toast.success('Moto registrada no estoque com sucesso!');
      }

      setActiveStatus('estoque');
      onStatusChanged?.('estoque');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registrar no estoque');
    } finally {
      setSaving(false);
    }
  };

  const visibleButtons = ACTION_BUTTONS.filter(btn => {
    if (btn.targetStatus === activeStatus) return false;
    // For estoque tracking: only allow pendente, oficina, servico_externo
    if (isEstoqueTracking) {
      return ['pendente', 'oficina', 'servico_externo'].includes(btn.value);
    }
    if (btn.value === 'preparacao' && (activeStatus === 'aguardando_aceite' || activeStatus === 'aguardando_liberacao_estoque')) return false;
    if (btn.value === 'aceite' && activeStatus !== 'aguardando_aceite') return false;
    if (btn.value === 'liberar' && activeStatus !== 'aguardando_liberacao_estoque') return false;
    return true;
  });

  const handlePreparacaoConcluida = async () => {
    if (!detalhes.trim()) {
      toast.error('Preencha os detalhes da movimentação');
      return;
    }
    setSaving(true);
    try {
      const { user, userName } = await getUserInfo();
      if (!user) { toast.error('Sessão expirada'); return; }

      const statusFrom = activeStatus || currentStatus || 'em_aberto';

      await supabase.from('avaliacoes').update({ preparacao_status: 'estoque' } as any).eq('id', avaliacaoId);

      // If bike was sent back from stock (indisponivel), restore to disponivel and clear the reenvio observation
      if (isInEstoque) {
        const { data: estoqueData } = await supabase.from('estoque').select('status, observacoes').eq('avaliacao_id', avaliacaoId).maybeSingle();
        if (estoqueData?.status === 'indisponivel') {
          await supabase.from('estoque').update({
            status: 'disponivel',
            observacoes: null,
          }).eq('avaliacao_id', avaliacaoId);
        }
      }

      await insertHistory({
        statusTo: 'preparacao_concluida',
        observacoes: `${detalhes.trim()}`,
        changedBy: user.id,
        changedByName: userName,
      });

      toast.success('Preparação concluída');
      onStatusChanged?.('estoque');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao concluir preparação');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (v: number | null | undefined) => {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

   return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[95vh] flex flex-col px-3">
        <DialogHeader className="flex flex-row items-center justify-between pr-8 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo de Preparação
            {isEstoqueTracking && <Badge variant="outline" className="text-[10px] border-primary text-primary ml-1">Acompanhamento</Badge>}
          </DialogTitle>
          <Badge style={{ backgroundColor: `${getStatusHex(activeStatus)}20`, color: getStatusHex(activeStatus) }}>
            {getStatusLabel(activeStatus)}
          </Badge>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 pr-1" style={{ scrollbarWidth: 'thin' }}>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-1">
            {/* Resumo */}
            {avaliacaoData && (
              <div className="bg-muted/50 rounded-lg p-4 border border-border/50 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-base font-bold text-foreground">{avaliacaoData.moto?.marca} {avaliacaoData.moto?.modelo}</span>
                  <div className="flex items-center gap-2">
                    {avaliacaoData.tipo_aquisicao && (
                      <Badge variant="outline" className={`text-xs ${getTipoAquisicaoBadgeClass(avaliacaoData.tipo_aquisicao)}`}>
                        {getTipoAquisicaoLabel(avaliacaoData.tipo_aquisicao)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {[avaliacaoData.moto?.ano_fabricacao, avaliacaoData.moto?.ano_modelo].filter(Boolean).join('/')}
                  {avaliacaoData.moto?.cilindrada ? ` · ${avaliacaoData.moto.cilindrada}cc` : ''}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Cliente</span>
                    <span className="font-medium text-foreground">{avaliacaoData.atendimento?.nome_cliente || 'N/A'}</span>
                  </div>
                  {avaliacaoData.moto?.placa && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Placa</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.placa}</span>
                    </div>
                  )}
                  {avaliacaoData.moto?.cor && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Cor</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.cor}</span>
                    </div>
                  )}
                  {avaliacaoData.moto?.categoria && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Categoria</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.categoria}</span>
                    </div>
                  )}
                  {avaliacaoData.classificacao && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Classificação</span>
                      <span className="font-medium text-foreground">{avaliacaoData.classificacao}</span>
                    </div>
                  )}
                  {avaliacaoData.moto?.km && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Km</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.km}</span>
                    </div>
                  )}
                  {avaliacaoData.quanto_pede != null && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Quanto Pede</span>
                      <span className="font-semibold text-foreground">{formatCurrency(avaliacaoData.quanto_pede)}</span>
                    </div>
                  )}
                  {!isReadOnly && avaliacaoData.valor_fechamento != null && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Valor Fechamento</span>
                      <span className="font-semibold text-foreground">{formatCurrency(avaliacaoData.valor_fechamento)}</span>
                    </div>
                  )}
                </div>

                {(avaliacaoData.moto?.tem_manual != null || avaliacaoData.moto?.tem_chave_reserva != null || avaliacaoData.moto?.manutencao_vencida != null) && (
                  <div className="flex items-center gap-3 text-xs pt-1">
                    {avaliacaoData.moto?.tem_manual != null && (
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${avaliacaoData.moto.tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                        Manual
                      </span>
                    )}
                    {avaliacaoData.moto?.tem_chave_reserva != null && (
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${avaliacaoData.moto.tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                        Chave Reserva
                      </span>
                    )}
                    {avaliacaoData.moto?.manutencao_vencida != null && (
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${avaliacaoData.moto.manutencao_vencida ? 'bg-red-500' : 'bg-green-500'}`} />
                        Revisão
                      </span>
                    )}
                  </div>
                )}

                {avaliacaoData.moto?.observacoes && (
                  <p className="text-xs text-muted-foreground italic">{avaliacaoData.moto.observacoes}</p>
                )}
              </div>
            )}

            {/* Pending release steps */}
            {pendingSteps.length > 0 && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Pendências para liberação ao estoque</p>
                  {pendingSteps.map(step => (
                    <p key={step} className="text-xs text-orange-600 dark:text-orange-400">• {step}</p>
                  ))}
                </div>
              </div>
            )}
            {pendingSteps.length === 0 && avaliacaoData?.situacao !== 'estoque' && (
              <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 flex items-center gap-2.5">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Todos os processos concluídos</p>
              </div>
            )}

            <Separator className="my-1" />

            {isReadOnly ? (
              <div className="text-sm text-muted-foreground italic py-2">Visualização somente leitura.</div>
            ) : reenviarFromEstoque ? (
              /* Reenviar from Estoque mode: only show reenviar button with alert */
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Motivo / Observação *</label>
                  <Textarea
                    placeholder="Descreva o motivo do reenvio para preparação..."
                    value={reenviarObs}
                    onChange={e => setReenviarObs(e.target.value)}
                    className="mt-1.5"
                    rows={3}
                  />
                </div>
                <Button
                  disabled={saving}
                  onClick={async () => {
                    if (!reenviarObs.trim()) {
                      toast.error('A observação é obrigatória');
                      return;
                    }
                    setSaving(true);
                    try {
                      const { user, userName } = await getUserInfo();
                      if (!user) { toast.error('Sessão expirada'); return; }

                      const { error: estoqueErr } = await supabase.from('estoque').update({
                        status: 'indisponivel',
                        observacoes: reenviarObs.trim(),
                      }).eq('id', reenviarFromEstoque.estoqueItemId);
                      if (estoqueErr) { toast.error('Erro ao atualizar estoque'); return; }

                      await supabase.from('avaliacoes').update({ preparacao_status: 'em_aberto' } as any).eq('id', avaliacaoId);

                      await insertHistory({
                        statusTo: 'reenviada_preparacao',
                        observacoes: reenviarObs.trim(),
                        changedBy: user.id,
                        changedByName: userName,
                      });

                      toast.success('Moto reenviada para preparação');
                      onReenviarSuccess?.();
                      onOpenChange(false);
                    } catch (err) {
                      console.error(err);
                      toast.error('Erro ao reenviar para preparação');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="gap-2 w-full h-10 text-sm font-medium"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Confirmar Reenvio
                </Button>
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-600/40">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-400">
                    Ao reenviar a moto para preparação ela ficará em serviço no estoque durante esse período.
                  </p>
                </div>
              </div>
            ) : isEstoqueIdle ? (
              /* Estoque idle: show button to send to preparação for tracking */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Esta moto já está em estoque. Deseja enviá-la para preparação para acompanhamento de reparos?</p>
                <Button
                  variant="default"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const { user, userName } = await getUserInfo();
                      if (!user) { toast.error('Sessão expirada'); return; }
                      await supabase.from('avaliacoes').update({ preparacao_status: 'em_aberto' } as any).eq('id', avaliacaoId);
                      await insertHistory({
                        statusTo: 'reenviada_preparacao',
                        observacoes: 'Moto reenviada para preparação (acompanhamento)',
                        changedBy: user.id,
                        changedByName: userName,
                      });
                      toast.success('Moto enviada para preparação');
                      onStatusChanged?.('em_aberto');
                      onOpenChange(false);
                    } catch (err) {
                      console.error(err);
                      toast.error('Erro ao enviar para preparação');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="gap-2 w-full h-10 text-sm font-medium"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Enviar para Preparação
                </Button>
              </div>
            ) : !showLiberarForm ? (
              <>
                {/* Detalhes */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Detalhes da movimentação</label>
                  <Textarea
                    placeholder="Descreva os detalhes..."
                    value={detalhes}
                    onChange={e => setDetalhes(e.target.value)}
                    rows={2}
                    className="border-primary"
                  />
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Ações</label>
                  
                  {/* Secondary actions (Pendente, Oficina, Serviço Externo) */}
                  {visibleButtons.filter(btn => !['preparacao', 'aceite', 'liberar'].includes(btn.value)).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visibleButtons.filter(btn => !['preparacao', 'aceite', 'liberar'].includes(btn.value)).map(btn => {
                        const Icon = btn.icon;
                        return (
                          <Button
                            key={btn.value}
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={() => handleAction(btn.targetStatus, btn.label)}
                            className="gap-1.5 h-9 text-xs"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                            {btn.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Primary action (Preparação / Aceite / Liberar) - below and highlighted */}
                  {!isEstoqueTracking && visibleButtons.filter(btn => ['preparacao', 'aceite', 'liberar'].includes(btn.value)).map(btn => {
                    const Icon = btn.icon;
                    return (
                      <Button
                        key={btn.value}
                        variant="default"
                        disabled={saving}
                        onClick={() => handleAction(btn.targetStatus, btn.label)}
                        className="gap-2 w-full h-10 text-sm font-medium"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        {btn.label}
                      </Button>
                    );
                  })}

                  {/* Preparação Concluída for estoque tracking */}
                  {isEstoqueTracking && (
                    <Button
                      variant="default"
                      disabled={saving}
                      onClick={handlePreparacaoConcluida}
                      className="gap-2 w-full h-10 text-sm font-medium"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Preparação Concluída
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Liberar Form */}
                <div className="space-y-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <label className="text-sm font-medium">Dados para Registro no Estoque</label>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Empresa *</label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={empresa === 'MMATOS' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-9"
                          onClick={() => setEmpresa('MMATOS')}
                        >
                          MMATOS
                        </Button>
                        <Button
                          type="button"
                          variant={empresa === 'FAG' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-9"
                          onClick={() => setEmpresa('FAG')}
                        >
                          FAG
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Loja *</label>
                      <Select value={loja} onValueChange={setLoja}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOJAS.map(l => (
                            <SelectItem key={l} value={l}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Placa *</label>
                      <Input
                        value={placa}
                        onChange={e => setPlaca(e.target.value.toUpperCase())}
                        placeholder="ABC1D23"
                        className="h-9 uppercase"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Cilindrada *</label>
                      <Input
                        value={cilindrada}
                        onChange={e => setCilindrada(formatKm(e.target.value))}
                        placeholder="Ex: 1.200"
                        className="h-9"
                        inputMode="numeric"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Preço de Tabela *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          value={precoTabela}
                          onChange={e => setPrecoTabela(formatCurrencyInput(e.target.value))}
                          placeholder="0,00"
                          className="h-9 pl-9"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Valor de Fechamento *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          value={valorFechamento}
                          onChange={e => setValorFechamento(formatCurrencyInput(e.target.value))}
                          placeholder="0,00"
                          className="h-9 pl-9"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Manual</Label>
                      <RadioGroup value={libManual} onValueChange={setLibManual} className="flex gap-3">
                        <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="lib-manual-sim" /><Label htmlFor="lib-manual-sim" className="text-xs">Sim</Label></div>
                        <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="lib-manual-nao" /><Label htmlFor="lib-manual-nao" className="text-xs">Não</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Chave Reserva</Label>
                      <RadioGroup value={libChaveReserva} onValueChange={setLibChaveReserva} className="flex gap-3">
                        <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="lib-chave-sim" /><Label htmlFor="lib-chave-sim" className="text-xs">Sim</Label></div>
                        <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="lib-chave-nao" /><Label htmlFor="lib-chave-nao" className="text-xs">Não</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Revisão Vencida</Label>
                      <RadioGroup value={libRevisaoVencida} onValueChange={setLibRevisaoVencida} className="flex gap-3">
                        <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="lib-rev-sim" /><Label htmlFor="lib-rev-sim" className="text-xs">Sim</Label></div>
                        <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="lib-rev-nao" /><Label htmlFor="lib-rev-nao" className="text-xs">Não</Label></div>
                      </RadioGroup>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Observações da Moto</label>
                    <Textarea
                      placeholder="Ex: Manual, chave reserva, acessórios..."
                      value={obsMoto}
                      onChange={e => setObsMoto(e.target.value.toUpperCase())}
                      rows={2}
                      className="uppercase"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowLiberarForm(false)} disabled={saving} className="gap-1.5">
                      <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                    </Button>
                    <Button size="sm" onClick={handleLiberar} disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                      Registrar no Estoque
                    </Button>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* History - using StatusTimeline like atendimento */}
            <div className="space-y-4 px-10">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Histórico de Movimentações</span>
              </div>

              <StatusTimeline
                history={history}
                renderPopupExtra={(entry) => (
                  entry.observacoes ? (
                    <div>
                      <span className="text-xs text-muted-foreground">Observações</span>
                      <p className="text-sm">{entry.observacoes}</p>
                    </div>
                  ) : null
                )}
              />
            </div>
            <Separator className="mt-4" />
            <div className="pb-3" />
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreparacaoProcessoDialog;