import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
}

interface HistoryEntry {
  id: string;
  entity_type: string;
  status_from: string;
  status_to: string;
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

const PreparacaoProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, currentStatus, avaliacaoData, onStatusChanged }) => {
  const [detalhes, setDetalhes] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLiberarForm, setShowLiberarForm] = useState(false);
  const [activeStatus, setActiveStatus] = useState(currentStatus);

  // Liberar form fields
  const [empresa, setEmpresa] = useState('');
  const [loja, setLoja] = useState('');
  const [placa, setPlaca] = useState('');
  const [cilindrada, setCilindrada] = useState('');
  const [precoTabela, setPrecoTabela] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');

  const formatKm = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  useEffect(() => {
    if (!open) return;
    setActiveStatus(currentStatus);
    setDetalhes('');
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
            .in('status_to', ['adquirida'])
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
            .in('status_to', ['vendido'])
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
        ...Object.fromEntries(PREPARACAO_COLUMNS.map(c => [c.value, c.label])),
      };
      const remapStatus = (s: string) => STATUS_REMAP[s] || s;

      // Merge and sort by date descending
      const merged = [...prepHistory, ...avalHistory, ...showroomHistory]
        .map(h => ({ ...h, status_to: remapStatus(h.status_to), status_from: remapStatus(h.status_from) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setHistory(merged);
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
    statusFrom: string;
    statusTo: string;
    observacoes: string | null;
    changedBy: string;
    changedByName: string;
  }) => {
    const { error } = await supabase.from('status_history').insert({
      entity_id: avaliacaoId,
      entity_type: 'preparacao',
      status_from: params.statusFrom,
      status_to: params.statusTo,
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
        statusFrom,
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
        tipo: avaliacao.tipo_aquisicao === 'consignada' ? 'consignada' : 'propria',
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
        observacoes: detalhes.trim() || null,
        data_entrada: new Date().toISOString(),
      } as any);

      if (estoqueError) {
        console.error('Erro ao registrar no estoque:', estoqueError);
        toast.error('Erro ao registrar no estoque');
        return;
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
        statusFrom,
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
    if (btn.value === 'preparacao' && (activeStatus === 'aguardando_aceite' || activeStatus === 'aguardando_liberacao_estoque')) return false;
    if (btn.value === 'aceite' && activeStatus !== 'aguardando_aceite') return false;
    if (btn.value === 'liberar' && activeStatus !== 'aguardando_liberacao_estoque') return false;
    return true;
  });

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
              <div className="bg-muted/50 rounded-lg p-4 border border-border/50 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-base font-bold text-foreground">{avaliacaoData.atendimento?.nome_cliente || 'N/A'}</span>
                  {avaliacaoData.tipo_aquisicao && (
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-600">
                      {avaliacaoData.tipo_aquisicao === 'propria' ? 'Própria' : 'Consignada'}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Moto</span>
                    <span className="font-medium text-foreground">{avaliacaoData.moto?.marca} {avaliacaoData.moto?.modelo}</span>
                  </div>
                  {avaliacaoData.moto?.placa && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Placa</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.placa}</span>
                    </div>
                  )}
                  {avaliacaoData.moto?.categoria && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Categoria</span>
                      <span className="font-medium text-foreground">{avaliacaoData.moto.categoria}</span>
                    </div>
                  )}
                  {avaliacaoData.valor_fechamento != null && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Valor Fechamento</span>
                      <span className="font-semibold text-foreground">{formatCurrency(avaliacaoData.valor_fechamento)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator className="my-1" />

            {!showLiberarForm ? (
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
                  {visibleButtons.filter(btn => ['preparacao', 'aceite', 'liberar'].includes(btn.value)).map(btn => {
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

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Observações da Moto</label>
                    <Textarea
                      placeholder="Ex: Manual, chave reserva, acessórios..."
                      value={detalhes}
                      onChange={e => setDetalhes(e.target.value)}
                      rows={2}
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