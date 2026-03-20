import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Loader2, History, Clock, Wrench, Truck, CheckCircle, Package, AlertCircle, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  status_from: string;
  status_to: string;
  observacoes: string | null;
  changed_by_name: string | null;
  created_at: string;
}

const getStatusLabel = (value: string) => PREPARACAO_COLUMNS.find(c => c.value === value)?.label || value;
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

  useEffect(() => {
    if (!open) return;
    setActiveStatus(currentStatus);
    setDetalhes('');
    setShowLiberarForm(false);
    setEmpresa('');
    setLoja('');
    setPlaca('');
    setCilindrada('');
    setPrecoTabela('');
    setValorFechamento('');

    const loadHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('status_history')
        .select('*')
        .eq('entity_id', avaliacaoId)
        .eq('entity_type', 'preparacao')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar histórico:', error);
        setHistory([]);
      } else {
        setHistory((data as HistoryEntry[]) || []);
      }

      setLoading(false);
    };

    loadHistory();
  }, [open, avaliacaoId, currentStatus]);

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
      const observacoes = detalhes.trim() || `Status alterado para ${getStatusLabel(targetStatus)}.`;

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
          preparacao_status: 'aguardando_liberacao_estoque',
          situacao: 'adquirida',
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
        statusTo: 'aguardando_liberacao_estoque',
        observacoes: `Moto liberada para estoque. Empresa: ${empresa}, Loja: ${loja}, Placa: ${placa.trim().toUpperCase()}${detalhes.trim() ? `. ${detalhes.trim()}` : ''}`,
        changedBy: user.id,
        changedByName: userName,
      });

      if (!historySaved) {
        toast.error('Estoque registrado, mas erro ao registrar histórico');
      } else {
        toast.success('Moto registrada no estoque com sucesso!');
      }

      setActiveStatus('aguardando_liberacao_estoque');
      onStatusChanged?.('aguardando_liberacao_estoque');
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col px-6">
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo de Preparação
          </DialogTitle>
          <Badge style={{ backgroundColor: `${getStatusHex(activeStatus)}20`, color: getStatusHex(activeStatus) }}>
            {getStatusLabel(activeStatus)}
          </Badge>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden px-0.5">
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
                <div className="space-y-2 max-w-md">
                  <label className="text-sm font-medium">Detalhes da movimentação</label>
                  <Textarea
                    placeholder="Descreva os detalhes..."
                    value={detalhes}
                    onChange={e => setDetalhes(e.target.value)}
                    rows={2}
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
                <div className="space-y-3">
                  <label className="text-sm font-medium">Dados para Registro no Estoque</label>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Empresa *</label>
                      <Select value={empresa} onValueChange={setEmpresa}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MMATOS">MMATOS</SelectItem>
                          <SelectItem value="FAG">FAG</SelectItem>
                        </SelectContent>
                      </Select>
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
                        onChange={e => setCilindrada(e.target.value)}
                        placeholder="Ex: 800"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Preço de Tabela *</label>
                      <Input
                        value={precoTabela}
                        onChange={e => setPrecoTabela(formatCurrencyInput(e.target.value))}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Valor de Fechamento *</label>
                      <Input
                        value={valorFechamento}
                        onChange={e => setValorFechamento(formatCurrencyInput(e.target.value))}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Observações</label>
                    <Textarea
                      placeholder="Observações adicionais..."
                      value={detalhes}
                      onChange={e => setDetalhes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowLiberarForm(false)} disabled={saving}>
                      Voltar
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

            {/* History */}
            <div className="space-y-2 min-h-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Histórico de Movimentações</span>
              </div>

              <div className="overflow-y-auto max-h-[200px] space-y-2 pr-1" style={{ scrollbarWidth: 'thin', scrollbarGutter: 'stable' }}>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="bg-muted/50 rounded-lg p-3 space-y-1 border border-border/50">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]" style={{ borderColor: getStatusHex(h.status_from), color: getStatusHex(h.status_from) }}>
                            {getStatusLabel(h.status_from)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">→</span>
                          <Badge className="text-[10px]" style={{ backgroundColor: `${getStatusHex(h.status_to)}20`, color: getStatusHex(h.status_to) }}>
                            {getStatusLabel(h.status_to)}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(h.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {h.observacoes && (
                        <p className="text-xs text-muted-foreground">{h.observacoes}</p>
                      )}
                      {h.changed_by_name && (
                        <p className="text-[10px] text-muted-foreground/70">por {h.changed_by_name}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PreparacaoProcessoDialog;