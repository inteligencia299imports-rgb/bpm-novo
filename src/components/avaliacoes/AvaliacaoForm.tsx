import React, { useState, useEffect } from 'react';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass, isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import { useAuth } from '@/contexts/AuthContext';
import ContratoConsignacaoDialog from '@/components/consignacao/ContratoConsignacaoDialog';
import ContratoCompraDialog from '@/components/avaliacoes/ContratoCompraDialog';
import CustosOficinaDialog from '@/components/avaliacoes/CustosOficinaDialog';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Save, Loader2, User, Store, Tag, DollarSign, Camera, Edit, MessageCircle, CheckCircle, XCircle, Clock, Search, CheckCircle2, FileText, Trash2, Wrench, ArrowLeftRight, ShieldCheck, Handshake, Bike, IdCard, Pencil } from 'lucide-react';
import { SEXOS, UFS } from '@/types/crm';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import DocumentUpload from '@/components/showroom/DocumentUpload';
import StatusTimeline from '@/components/shared/StatusTimeline';
import ObservacoesProcesso from '@/components/shared/ObservacoesProcesso';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { SituacaoAvaliacao, MotoFoto } from '@/types/crm';
import { toast } from 'sonner';
import DetailSkeleton from '@/components/shared/DetailSkeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  avaliacaoId: string;
  onClose: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const formatKm = (km: string | null) => {
  if (!km) return null;
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR') + ' km';
};

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Currency mask: formats input as "1.234,56"
const applyCurrencyMask = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  const formatted = (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatted;
};

const parseCurrencyToNumber = (value: string): number | null => {
  if (!value) return null;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

const numberToCurrencyMask = (value: number | null): string => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const CurrencyField = ({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
  <div className="space-y-1.5">
    <Label>{label} <span className="text-destructive">*</span></Label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        value={value}
        onChange={onChange}
        className="pl-10"
        placeholder="0,00"
        inputMode="numeric"
      />
    </div>
  </div>
);

const AvaliacaoForm: React.FC<Props> = ({ avaliacaoId, onClose }) => {
  const { user, role, userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [showEvalDialog, setShowEvalDialog] = useState(false);
  const [contratoConsignacaoOpen, setContratoConsignacaoOpen] = useState(false);
  const [contratoCompraOpen, setContratoCompraOpen] = useState(false);
  const [showPhotosDialog, setShowPhotosDialog] = useState(false);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(null);
  const [atpvUrl, setAtpvUrl] = useState<string | null>(null);
  const [procuracaoUrl, setProcuracaoUrl] = useState<string | null>(null);
  const [consultaRealizada, setConsultaRealizada] = useState(false);
  const [consultaSolicitada, setConsultaSolicitada] = useState(false);
  const [resultadoConsulta, setResultadoConsulta] = useState<string | null>(null);
  const [showResultadoConsulta, setShowResultadoConsulta] = useState(false);
  const canEdit = role === 'avaliador' || role === 'gestor' || role === 'vendedor';
  const [history, setHistory] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [custosOpen, setCustosOpen] = useState(false);
  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [editSexo, setEditSexo] = useState('');
  const [editUf, setEditUf] = useState('');
  const [editCpfCnpj, setEditCpfCnpj] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editEndereco, setEditEndereco] = useState('');
  const [editCep, setEditCep] = useState('');
  const [savingCliente, setSavingCliente] = useState(false);

  const openEditCliente = () => {
    if (!at) return;
    setEditNome(at.nome_cliente || '');
    setEditTelefone(at.telefone ? formatPhone(at.telefone) : '');
    setEditSexo(at.sexo || '');
    setEditUf(at.uf || '');
    setEditCpfCnpj((at as any).cpf_cnpj || '');
    setEditEmail((at as any).email || '');
    setEditEndereco((at as any).endereco || '');
    setEditCep((at as any).cep || '');
    setEditClienteOpen(true);
  };

  const handleSaveCliente = async () => {
    const digits = editTelefone.replace(/\D/g, '');
    if (!editNome.trim() || digits.length !== 11 || !editSexo || !editUf) {
      toast.error('Preencha Nome, Telefone (11 dígitos), Sexo e UF');
      return;
    }
    setSavingCliente(true);
    const { error } = await supabase.from('atendimentos').update({
      nome_cliente: editNome.trim().toUpperCase(),
      telefone: digits,
      sexo: editSexo,
      uf: editUf,
      cpf_cnpj: editCpfCnpj || null,
      email: editEmail || null,
      endereco: editEndereco || null,
      cep: editCep || null,
    } as any).eq('id', at?.id);
    setSavingCliente(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Dados do cliente atualizados!');
      setEditClienteOpen(false);
    }
  };

  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const refreshHistory = async () => {
    if (!avaliacao) return;
    const motoId = avaliacao.moto_avaliacao_id;
    const atId = avaliacao.atendimento_id;
    if (!motoId) return;
    const [{ data: histAval }, { data: histShowroom }, { data: histConsignacao }] = await Promise.all([
      supabase.from('status_history').select('*').in('entity_type', ['avaliacao', 'consulta']).eq('entity_id', motoId).order('created_at', { ascending: true }),
      supabase.from('status_history').select('*').in('entity_type', ['showroom', 'contrato']).eq('entity_id', atId).order('created_at', { ascending: true }),
      supabase.from('status_history').select('*').eq('entity_type', 'consignacao').eq('entity_id', avaliacao.id).order('created_at', { ascending: true }),
    ]);
    const merged = [...(histAval || []), ...(histShowroom || []), ...(histConsignacao || [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setHistory(merged);
  };

  const handleDeleteAvaliacao = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_avaliacao_cascade', { _avaliacao_id: avaliacaoId });
      if (error) throw error;
      toast.success('Avaliação excluída com sucesso');
      onClose();
    } catch (err: any) {
      toast.error('Erro ao excluir avaliação: ' + (err.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  // form fields (stored as masked strings)
  const [valorFipe, setValorFipe] = useState('');
  const [menorValor, setMenorValor] = useState('');
  const [maiorValor, setMaiorValor] = useState('');
  const [quantoPede, setQuantoPede] = useState('');
  const [quantoVende, setQuantoVende] = useState('');
  const [quantoVendeErrado, setQuantoVendeErrado] = useState('');
  const [avalConsig, setAvalConsig] = useState('');
  const [avalCompra, setAvalCompra] = useState('');
  const [prevCustosLoja, setPrevCustosLoja] = useState('');
  const [prevCustosCliente, setPrevCustosCliente] = useState('');
  const [obsAvaliador, setObsAvaliador] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [valorFechamentoEdit, setValorFechamentoEdit] = useState('');
  const [precoAcaoEdit, setPrecoAcaoEdit] = useState('');
  const [estoqueId, setEstoqueId] = useState<string | null>(null);
  const [dispensadaMotivo, setDispensadaMotivo] = useState<string | null>(null);
  const [savingDispensada, setSavingDispensada] = useState(false);
  const [estoqueVendido, setEstoqueVendido] = useState(false);

  const loadAvaliacao = async () => {
    const { data } = await supabase
      .from('avaliacoes')
      .select(`
        *,
        atendimentos (id, nome_cliente, telefone, loja, vendedor_id, interesse, sexo, uf, tipo_atendimento, origem, temperatura, created_at, cnh_url, cpf_cnpj, email, cep, endereco),
        motos_avaliacao (id, marca, modelo, ano_fabricacao, ano_modelo, placa, km, cor, categoria, observacoes, crlv_url, atpv_url, procuracao_url, consulta_realizada, consulta_solicitada, resultado_consulta, tem_manual, tem_chave_reserva, manutencao_vencida)
      `)
      .eq('id', avaliacaoId)
      .single();

    if (data) {
      setAvaliacao({ ...data, atendimento: data.atendimentos, moto_avaliacao: data.motos_avaliacao });
      setCnhUrl((data.atendimentos as any)?.cnh_url || null);
      setCrlvUrl((data.motos_avaliacao as any)?.crlv_url || null);
      setAtpvUrl((data.motos_avaliacao as any)?.atpv_url || null);
      setProcuracaoUrl((data.motos_avaliacao as any)?.procuracao_url || null);
      setConsultaRealizada(!!(data.motos_avaliacao as any)?.consulta_realizada);
      setConsultaSolicitada(!!(data.motos_avaliacao as any)?.consulta_solicitada);
      setResultadoConsulta((data.motos_avaliacao as any)?.resultado_consulta || null);
      setValorFipe(numberToCurrencyMask(data.valor_fipe));
      setMenorValor(numberToCurrencyMask(data.menor_valor));
      setMaiorValor(numberToCurrencyMask(data.maior_valor));
      setQuantoPede(numberToCurrencyMask(data.quanto_pede));
      setQuantoVende(numberToCurrencyMask(data.quanto_vende));
      setQuantoVendeErrado(numberToCurrencyMask(data.quanto_vende_errado));
      setAvalConsig(numberToCurrencyMask(data.avaliacao_consignacao));
      setAvalCompra(numberToCurrencyMask(data.avaliacao_compra));
      setPrevCustosLoja(numberToCurrencyMask(data.previsao_custos_loja));
      setPrevCustosCliente(numberToCurrencyMask(data.previsao_custos_cliente));
      setObsAvaliador(data.observacao_avaliador || '');
      setClassificacao((data as any).classificacao || '');
      setValorFechamentoEdit(numberToCurrencyMask(data.valor_fechamento));

      // Fetch estoque data if available
      if (data.id) {
        const { data: estoqueData } = await supabase.from('estoque').select('id, preco_acao, status').eq('avaliacao_id', data.id).maybeSingle();
        if (estoqueData) {
          setEstoqueId(estoqueData.id);
          setPrecoAcaoEdit(numberToCurrencyMask(estoqueData.preco_acao));
          setEstoqueVendido(estoqueData.status === 'vendido' || estoqueData.status === 'sinal');
        }
      }

      // Fetch vendedor name
      const vendedorId = (data.atendimentos as any)?.vendedor_id;
      if (vendedorId) {
        const { data: vendedorData } = await supabase.from('user_roles').select('nome').eq('user_id', vendedorId).single();
        if (vendedorData?.nome) setVendedorNome(vendedorData.nome);
      }

      if (data.moto_avaliacao_id) {
        const { data: fotosData } = await supabase.from('moto_fotos').select('*').eq('moto_avaliacao_id', data.moto_avaliacao_id);
        if (fotosData) setFotos(fotosData);

        // Fetch history: avaliacao + consulta (by moto_avaliacao_id) + showroom (by atendimento_id)
        const [{ data: histAval }, { data: histShowroom }, { data: histConsignacao }] = await Promise.all([
          supabase
            .from('status_history')
            .select('*')
            .in('entity_type', ['avaliacao', 'consulta'])
            .eq('entity_id', data.moto_avaliacao_id)
            .order('created_at', { ascending: true }),
          supabase
            .from('status_history')
            .select('*')
            .in('entity_type', ['showroom', 'contrato'])
            .eq('entity_id', data.atendimento_id)
            .order('created_at', { ascending: true }),
          supabase
            .from('status_history')
            .select('*')
            .eq('entity_type', 'consignacao')
            .eq('entity_id', data.id)
            .order('created_at', { ascending: true }),
        ]);
        const merged = [...(histAval || []), ...(histShowroom || []), ...(histConsignacao || [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setHistory(merged);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAvaliacao();
  }, [avaliacaoId]);

  // Realtime: atualizar quando valor_fechamento ou outros campos mudarem externamente
  useEffect(() => {
    const channel = supabase
      .channel(`avaliacao-${avaliacaoId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'avaliacoes',
        filter: `id=eq.${avaliacaoId}`,
      }, (payload) => {
        const newData = payload.new as any;
        setAvaliacao((prev: any) => prev ? { ...prev, ...newData } : prev);
        setValorFechamentoEdit(numberToCurrencyMask(newData.valor_fechamento));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [avaliacaoId]);

  const handleCurrencyChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(applyCurrencyMask(e.target.value));
  };

  const allFieldsFilled = () => {
    return [valorFipe, menorValor, maiorValor, quantoPede, quantoVende, quantoVendeErrado, avalConsig, avalCompra, prevCustosLoja, prevCustosCliente, obsAvaliador].every(v => v.trim() !== '') && classificacao !== '';
  };

  const handleSave = async () => {
    if (!allFieldsFilled()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setSaving(true);
    const updateData: any = {
      valor_fipe: parseCurrencyToNumber(valorFipe),
      menor_valor: parseCurrencyToNumber(menorValor),
      maior_valor: parseCurrencyToNumber(maiorValor),
      quanto_pede: parseCurrencyToNumber(quantoPede),
      quanto_vende: parseCurrencyToNumber(quantoVende),
      quanto_vende_errado: parseCurrencyToNumber(quantoVendeErrado),
      avaliacao_consignacao: parseCurrencyToNumber(avalConsig),
      avaliacao_compra: parseCurrencyToNumber(avalCompra),
      previsao_custos_loja: parseCurrencyToNumber(prevCustosLoja),
      previsao_custos_cliente: parseCurrencyToNumber(prevCustosCliente),
      observacao_avaliador: obsAvaliador || null,
      classificacao: classificacao || null,
      avaliador_id: user!.id,
      situacao: avaliacao?.situacao === 'sem_avaliar' ? 'em_aberto' : avaliacao?.situacao ?? 'em_aberto',
      ...((avaliacao?.situacao === 'adquirida' || avaliacao?.situacao === 'estoque') && valorFechamentoEdit.trim() !== '' ? { valor_fechamento: parseCurrencyToNumber(valorFechamentoEdit) } : {}),
    };

    const { error } = await supabase.from('avaliacoes').update(updateData).eq('id', avaliacaoId);

    if (error) {
      toast.error('Erro ao salvar avaliação');
    } else {
      // Atualizar preço ação no estoque se aplicável
      if (estoqueId && precoAcaoEdit.trim() !== '') {
        await supabase.from('estoque').update({ preco_acao: parseCurrencyToNumber(precoAcaoEdit) }).eq('id', estoqueId);
      }
      // Registrar no histórico
      const isFirstEvaluation = avaliacao?.situacao === 'sem_avaliar';
      if (avaliacao?.moto_avaliacao_id) {
        await supabase.from('status_history').insert({
          entity_type: 'avaliacao',
          entity_id: avaliacao.moto_avaliacao_id,
          status: isFirstEvaluation ? 'avaliada' : 'avaliacao_editada',
          changed_by: user?.id,
          changed_by_name: userName || user?.email || null,
        } as any);
      }
      // Notificar o vendedor responsável
      const vendedorId = (avaliacao as any)?.atendimento?.vendedor_id || (avaliacao as any)?.atendimentos?.vendedor_id;
      const motoInfo = (avaliacao as any)?.moto_avaliacao || (avaliacao as any)?.motos_avaliacao;
      if (vendedorId && vendedorId !== user?.id) {
        await supabase.from('notifications').insert({
          user_id: vendedorId,
          title: 'Avaliação Finalizada',
          message: `A avaliação da moto ${motoInfo?.marca || ''} ${motoInfo?.modelo || ''} ${motoInfo?.placa ? `(${motoInfo.placa})` : ''} foi concluída. | Por: ${userName || user?.email || 'Usuário'}`,
          entity_id: avaliacao?.atendimento_id || (avaliacao as any)?.atendimento?.id,
          entity_type: 'avaliacao',
        });
      }
      toast.success('Avaliação salva!');
      setShowEvalDialog(false);
      setAvaliacao((prev: any) => ({ ...prev, ...updateData }));
      refreshHistory();
    }
    setSaving(false);
  };

  const [tipoAquisicaoPopup, setTipoAquisicaoPopup] = useState(false);
  const [valorFechamentoAquisicao, setValorFechamentoAquisicao] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);
  const [savingAquisicao, setSavingAquisicao] = useState(false);
  const [obsMotaAquisicao, setObsMotaAquisicao] = useState('');
  const [aquisManual, setAquisManual] = useState('');
  const [aquisChaveReserva, setAquisChaveReserva] = useState('');
  const [aquisRevisaoVencida, setAquisRevisaoVencida] = useState('');
  const [isConvertendo, setIsConvertendo] = useState(false);
  const handleStatusChange = async (newStatus: SituacaoAvaliacao, tipoAquisicao?: string, valorFechamento?: number, observacoes?: string) => {
    const updateData: any = { situacao: newStatus };
    if (tipoAquisicao) updateData.tipo_aquisicao = tipoAquisicao;
    if (valorFechamento && valorFechamento > 0) updateData.valor_fechamento = valorFechamento;
   const { error } = await supabase.from('avaliacoes').update(updateData).eq('id', avaliacaoId);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      const label = SITUACOES_AVALIACAO.find(s => s.value === newStatus)?.label;
      toast.success(`Status alterado para ${label}`);
      setAvaliacao((prev: any) => ({ ...prev, situacao: newStatus }));

      // Registrar no histórico
      if (avaliacao?.moto_avaliacao_id) {
        const historyObs = observacoes?.trim() || null;
        await supabase.from('status_history').insert({
          entity_type: 'avaliacao',
          entity_id: avaliacao.moto_avaliacao_id,
          status: newStatus,
          changed_by: user?.id,
          changed_by_name: userName || user?.email || null,
          observacoes: historyObs,
        } as any);
      }
      refreshHistory();

      // Sync: dispensada em avaliação → dispensada no showroom + registrar histórico
      if (newStatus === 'dispensada' && avaliacao?.atendimento_id) {
        const { data: atData } = await supabase.from('atendimentos').select('situacao').eq('id', avaliacao.atendimento_id).maybeSingle();
        await supabase.from('atendimentos').update({ situacao: 'dispensada' }).eq('id', avaliacao.atendimento_id);
        await supabase.from('status_history').insert({
          entity_type: 'showroom',
          entity_id: avaliacao.atendimento_id,
          status: 'dispensada',
          changed_by: user?.id,
          changed_by_name: userName || user?.email || null,
          observacoes: observacoes || null,
        } as any);
      }
    }
  };

  const handleSaveAquisicao = async () => {
    if (!tipoSelecionado) {
      toast.error('Selecione o tipo de aquisição');
      return;
    }
    const valor = parseCurrencyToNumber(valorFechamentoAquisicao);
    if (interesse === 'vender' && (!valor || valor <= 0)) {
      toast.error('Informe o valor de fechamento');
      return;
    }
    setSavingAquisicao(true);
    // Salvar dados da moto (observações + manual/chave/revisão)
    if (avaliacao?.moto_avaliacao_id) {
      const motoUpdate: any = {};
      if (obsMotaAquisicao.trim()) motoUpdate.observacoes = obsMotaAquisicao.trim().toUpperCase();
      if (aquisManual) motoUpdate.tem_manual = aquisManual === 'sim';
      if (aquisChaveReserva) motoUpdate.tem_chave_reserva = aquisChaveReserva === 'sim';
      if (aquisRevisaoVencida) motoUpdate.manutencao_vencida = aquisRevisaoVencida === 'sim';
      if (Object.keys(motoUpdate).length > 0) {
        await supabase.from('motos_avaliacao').update(motoUpdate).eq('id', avaliacao.moto_avaliacao_id);
      }
    }
    await handleStatusChange('adquirida', tipoSelecionado, valor && valor > 0 ? valor : undefined, obsMotaAquisicao.trim().toUpperCase() || undefined);
    setSavingAquisicao(false);
    setTipoAquisicaoPopup(false);
    setValorFechamentoAquisicao('');
    setTipoSelecionado(null);
    setObsMotaAquisicao('');
    setIsConvertendo(false);
  };

  const handleSaveConversao = async () => {
    if (!tipoSelecionado) {
      toast.error('Selecione o tipo de aquisição');
      return;
    }
    const valor = parseCurrencyToNumber(valorFechamentoAquisicao);
    if (!valor || valor <= 0) {
      toast.error('Informe o valor de fechamento');
      return;
    }
    setSavingAquisicao(true);
    
    const currentTipo = avaliacao?.tipo_aquisicao;
    // consignada → convertida; any propria-like → consignada
    const newTipo = isTipoConsignada(currentTipo) ? 'convertida' : 'consignada';
    
    if (avaliacao?.moto_avaliacao_id) {
      const motoUpdate: any = {};
      if (obsMotaAquisicao.trim()) motoUpdate.observacoes = obsMotaAquisicao.trim().toUpperCase();
      if (aquisManual) motoUpdate.tem_manual = aquisManual === 'sim';
      if (aquisChaveReserva) motoUpdate.tem_chave_reserva = aquisChaveReserva === 'sim';
      if (aquisRevisaoVencida) motoUpdate.manutencao_vencida = aquisRevisaoVencida === 'sim';
      if (Object.keys(motoUpdate).length > 0) {
        await supabase.from('motos_avaliacao').update(motoUpdate).eq('id', avaliacao.moto_avaliacao_id);
      }
    }
    
    const { error } = await supabase.from('avaliacoes').update({
      tipo_aquisicao: newTipo,
      valor_fechamento: valor,
    }).eq('id', avaliacaoId);
    
    if (error) {
      toast.error('Erro ao converter aquisição');
    } else {
      const tipoLabel = getTipoAquisicaoLabel(newTipo) || newTipo;
      const fromLabel = getTipoAquisicaoLabel(currentTipo) || currentTipo;
      if (avaliacao?.moto_avaliacao_id) {
        await supabase.from('status_history').insert({
          entity_type: 'avaliacao',
          entity_id: avaliacao.moto_avaliacao_id,
          status: tipoLabel,
          changed_by: user?.id,
          changed_by_name: userName || user?.email || null,
          observacoes: `Conversão de ${fromLabel} para ${tipoLabel}`,
        } as any);
      }
      toast.success(`Moto convertida para ${tipoLabel}!`);
      setAvaliacao((prev: any) => ({ ...prev, tipo_aquisicao: newTipo, valor_fechamento: valor }));
      refreshHistory();
    }
    
    setSavingAquisicao(false);
    setTipoAquisicaoPopup(false);
    setValorFechamentoAquisicao('');
    setTipoSelecionado(null);
    setObsMotaAquisicao('');
    setIsConvertendo(false);
  };

  if (loading) {
    return <DetailSkeleton onClose={onClose} cards={6} />;
  }

  const moto = avaliacao?.moto_avaliacao;
  const at = avaliacao?.atendimento;
  const sit = SITUACOES_AVALIACAO.find(s => s.value === avaliacao?.situacao);
  const interesse = at?.interesse;

  const hasEvaluation = !!(avaliacao?.valor_fipe || avaliacao?.avaliacao_compra || avaliacao?.avaliacao_consignacao || avaliacao?.quanto_pede);

  const whatsappUrl = (() => {
    if (!at?.telefone) return '';
    const digits = at.telefone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  const InfoItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    ) : null
  );

  const getInteresseLabel = (int: string) => {
    switch (int) {
      case 'comprar': return 'Comprar';
      case 'vender': return 'Vender';
      case 'trocar': return 'Trocar';
      default: return int;
    }
  };

  // Status buttons config - filter out current status
  // "Adquirida" not available if interesse is "trocar"
  const statusButtons = [
    { value: 'em_aberto' as SituacaoAvaliacao, label: 'Em Aberto', icon: <Clock className="h-4 w-4" />, color: '#2EC5FF' },
    { value: 'adquirida' as SituacaoAvaliacao, label: 'Adquirida', icon: <CheckCircle className="h-4 w-4" />, color: '#169d53' },
    { value: 'dispensada' as SituacaoAvaliacao, label: 'Dispensada', icon: <XCircle className="h-4 w-4" />, color: '#FF3B30' },
  ]
    .filter(b => b.value !== avaliacao?.situacao)
    .filter(b => !(b.value === 'adquirida' && interesse === 'trocar'))
    .filter(b => !(b.value === 'adquirida' && !hasEvaluation))
    .filter(b => !(b.value === 'adquirida' && (!cnhUrl || !crlvUrl || !consultaRealizada)))
    .filter(b => !(b.value === 'adquirida' && (avaliacao?.situacao === 'adquirida' || avaliacao?.situacao === 'estoque')))
    .filter(b => !(b.value === 'em_aberto' && avaliacao?.situacao !== 'dispensada'))
    .filter(b => !(b.value === 'dispensada' && avaliacao?.situacao === 'estoque'));


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold truncate">{at?.nome_cliente}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
              {avaliacao?.tipo_aquisicao && (
                <Badge variant="outline" className={`text-[10px] shrink-0 ${getTipoAquisicaoBadgeClass(avaliacao.tipo_aquisicao)}`}>
                  {getTipoAquisicaoLabel(avaliacao.tipo_aquisicao)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {avaliacao?.created_at && format(new Date(avaliacao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {avaliacao?.situacao === 'adquirida' && avaliacao?.tipo_aquisicao === 'consignada' && (
              <Button size="sm" onClick={() => setContratoConsignacaoOpen(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Contrato
              </Button>
            )}
            {avaliacao?.situacao === 'adquirida' && isTipoPropria(avaliacao?.tipo_aquisicao) && (
              <Button size="sm" onClick={() => setContratoCompraOpen(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Contrato
              </Button>
            )}
            {(avaliacao?.situacao === 'adquirida' || avaliacao?.situacao === 'estoque') && (
              <Button size="sm" variant="outline" onClick={() => setCustosOpen(true)} className="gap-1.5">
                <Wrench className="h-4 w-4" /> Custos
              </Button>
            )}
            {(role === 'gestor') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-1.5">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir avaliação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é irreversível. Serão excluídos: avaliação, moto de avaliação, fotos, contrato de consignação, estoque vinculado e todo o histórico de movimentações relacionado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAvaliacao} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      {deleting ? 'Excluindo...' : 'Excluir'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={at?.nome_cliente} />
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{at?.telefone ? formatPhone(at.telefone) : '-'}</span>
                    {at?.telefone && (
                      <button
                        onClick={() => window.open(whatsappUrl, '_blank')}
                        className="text-green-600 hover:text-green-700 transition-colors"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <InfoItem label="Sexo" value={at?.sexo} />
                <InfoItem label="UF" value={at?.uf} />
                {(at as any)?.cpf_cnpj && <InfoItem label="CPF/CNPJ" value={(at as any).cpf_cnpj} />}
                {(at as any)?.email && <InfoItem label="E-mail" value={(at as any).email} />}
                {(at as any)?.cep && <InfoItem label="CEP" value={(at as any).cep} />}
                {(at as any)?.endereco && <InfoItem label="Endereço" value={(at as any).endereco} />}
              </div>
              <Separator className="my-2" />
              <DocumentUpload
                label="CNH"
                currentUrl={cnhUrl}
                bucketPath={`docs/${at?.id}/cnh`}
                onUploaded={async (url) => {
                  await supabase.from('atendimentos').update({ cnh_url: url } as any).eq('id', at?.id);
                  setCnhUrl(url);
                }}
                onRemoved={async () => {
                  await supabase.from('atendimentos').update({ cnh_url: null } as any).eq('id', at?.id);
                  setCnhUrl(null);
                }}
              />
            </CardContent>
          </Card>

          {/* Dados do Atendimento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Dados do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendedorNome && (
                <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                  <IdCard className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">{vendedorNome}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Loja" value={at?.loja} />
                <InfoItem label="Tipo" value={at?.tipo_atendimento} />
                <InfoItem label="Interesse" value={at?.interesse ? getInteresseLabel(at.interesse) : null} />
                <InfoItem label="Origem" value={at?.origem} />
                <InfoItem label="Temperatura" value={at?.temperatura} />
              </div>
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Marca" value={moto?.marca} />
                <InfoItem label="Modelo" value={(moto?.modelo || '').toUpperCase()} />
                <InfoItem label="Ano Fabricação" value={moto?.ano_fabricacao} />
                <InfoItem label="Ano Modelo" value={moto?.ano_modelo} />
                <InfoItem label="Categoria" value={moto?.categoria} />
                <InfoItem label="Cor" value={moto?.cor} />
                <InfoItem label="Placa" value={moto?.placa?.replace(/-/g, '')} />
                <InfoItem label="KM" value={formatKm(moto?.km)} />
              </div>
              {(moto?.tem_manual != null || moto?.tem_chave_reserva != null || moto?.manutencao_vencida != null) && (
                <div className="flex items-center gap-3 text-xs">
                  {moto?.tem_manual != null && (
                    <span className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${moto.tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                      Manual
                    </span>
                  )}
                  {moto?.tem_chave_reserva != null && (
                    <span className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${moto.tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                      Chave Reserva
                    </span>
                  )}
                  {moto?.manutencao_vencida != null && (
                    <span className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${moto.manutencao_vencida ? 'bg-red-500' : 'bg-green-500'}`} />
                      Revisão
                    </span>
                  )}
                </div>
              )}
              {moto?.observacoes && (
                <div className="mt-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações</span>
                  <p className="text-sm mt-1">{moto.observacoes}</p>
                </div>
              )}
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="outline" className={`gap-1.5 ${fotos.length > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setShowPhotosDialog(true)}>
                  <Camera className="h-4 w-4" /> {fotos.length > 0 ? `Fotos (${fotos.length}) ✓` : 'Incluir Fotos'}
                </Button>
                <DocumentUpload
                  label="CRLV"
                  currentUrl={crlvUrl}
                  bucketPath={`docs/${moto?.id}/crlv`}
                  onUploaded={async (url) => {
                    await supabase.from('motos_avaliacao').update({ crlv_url: url } as any).eq('id', moto?.id);
                    setCrlvUrl(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('motos_avaliacao').update({ crlv_url: null } as any).eq('id', moto?.id);
                    setCrlvUrl(null);
                  }}
                />
                <DocumentUpload
                  label="ATPV"
                  currentUrl={atpvUrl}
                  bucketPath={`docs/${moto?.id}/atpv`}
                  onUploaded={async (url) => {
                    await supabase.from('motos_avaliacao').update({ atpv_url: url } as any).eq('id', moto?.id);
                    setAtpvUrl(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('motos_avaliacao').update({ atpv_url: null } as any).eq('id', moto?.id);
                    setAtpvUrl(null);
                  }}
                />
                <DocumentUpload
                  label="Procuração"
                  currentUrl={procuracaoUrl}
                  bucketPath={`docs/${moto?.id}/procuracao`}
                  onUploaded={async (url) => {
                    await supabase.from('motos_avaliacao').update({ procuracao_url: url } as any).eq('id', moto?.id);
                    setProcuracaoUrl(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('motos_avaliacao').update({ procuracao_url: null } as any).eq('id', moto?.id);
                    setProcuracaoUrl(null);
                  }}
                />
                {cnhUrl && crlvUrl && hasEvaluation && !consultaSolicitada && !consultaRealizada && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={async () => {
                      await supabase.from('motos_avaliacao').update({ 
                        consulta_solicitada: true,
                        consulta_realizada: false,
                        resultado_consulta: null,
                      } as any).eq('id', moto?.id);
                      await supabase.from('status_history').insert({
                        entity_type: 'consulta',
                        entity_id: moto?.id,
                        status: 'consulta_solicitada',
                        changed_by: user?.id,
                        changed_by_name: userName || user?.email || null,
                      });
                      setConsultaSolicitada(true);
                      refreshHistory();
                      await supabase.rpc('notify_consulta', {
                        _title: 'Consulta Solicitada',
                        _message: `${moto?.marca} ${moto?.modelo}${moto?.placa ? ` (${moto.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
                        _entity_id: moto?.id,
                        _entity_type: 'consulta',
                      });
                      toast.success('Consulta solicitada com sucesso!');
                    }}
                  >
                    <Search className="h-4 w-4" /> Solicitar Consulta
                  </Button>
                )}
                {consultaSolicitada && !consultaRealizada && (
                  <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1">
                    <Clock className="h-3 w-3" /> Consulta Solicitada
                  </Badge>
                )}
                {consultaRealizada && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-green-500 text-green-600 hover:bg-green-50"
                    onClick={() => setShowResultadoConsulta(true)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Consulta Realizada ✓
                  </Button>
                )}
                {cnhUrl && crlvUrl && consultaRealizada && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={async () => {
                      await supabase.from('motos_avaliacao').update({ 
                        consulta_solicitada: true,
                        consulta_realizada: false,
                        resultado_consulta: null,
                      } as any).eq('id', moto?.id);
                      await supabase.from('status_history').insert({
                        entity_type: 'consulta',
                        entity_id: moto?.id,
                        status: 'consulta_solicitada',
                        changed_by: user?.id,
                        changed_by_name: userName || user?.email || null,
                      });
                      setConsultaSolicitada(true);
                      setConsultaRealizada(false);
                      refreshHistory();
                      await supabase.rpc('notify_consulta', {
                        _title: 'Consulta Solicitada',
                        _message: `${moto?.marca} ${moto?.modelo}${moto?.placa ? ` (${moto.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
                        _entity_id: moto?.id,
                        _entity_type: 'consulta',
                      });
                      toast.success('Consulta solicitada com sucesso!');
                    }}
                  >
                    <Search className="h-4 w-4" /> Nova Consulta
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Avaliação Comercial */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Avaliação Comercial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasEvaluation ? (
                <div className="space-y-3">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <InfoItem label="Valor FIPE" value={formatCurrency(avaliacao?.valor_fipe)} />
                      <InfoItem label="Menor Valor" value={formatCurrency(avaliacao?.menor_valor)} />
                      <InfoItem label="Maior Valor" value={formatCurrency(avaliacao?.maior_valor)} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <InfoItem label="Quanto Pede" value={formatCurrency(avaliacao?.quanto_pede)} />
                      <InfoItem label="Quanto Vende" value={formatCurrency(avaliacao?.quanto_vende)} />
                      <InfoItem label="Se Der Errado" value={formatCurrency(avaliacao?.quanto_vende_errado)} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <InfoItem label="Aval. Consignação" value={formatCurrency(avaliacao?.avaliacao_consignacao)} />
                      <InfoItem label="Custos Cliente" value={formatCurrency(avaliacao?.previsao_custos_cliente)} />
                      <InfoItem label="Custos Loja" value={formatCurrency(avaliacao?.previsao_custos_loja)} />
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse Cliente</span>
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(
                            (avaliacao?.avaliacao_consignacao ?? 0) - (avaliacao?.previsao_custos_loja ?? 0)
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <InfoItem label="Aval. Compra" value={formatCurrency(avaliacao?.avaliacao_compra)} />
                      <InfoItem label="Custos Cliente" value={formatCurrency(avaliacao?.previsao_custos_cliente)} />
                      <InfoItem label="Custos Loja" value={formatCurrency(avaliacao?.previsao_custos_loja)} />
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse Cliente</span>
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(
                            (avaliacao?.avaliacao_compra ?? 0) - (avaliacao?.previsao_custos_loja ?? 0)
                          )}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-primary">REPASSE CLIENTE = AVALIAÇÃO - CUSTOS LOJA</p>
                    <Separator />
                    {/* Destaque: Quanto Vende, Valor de Fechamento, Margem Prevista */}
                    {(() => {
                      const quantoVendeVal = avaliacao?.quanto_vende ?? 0;
                      const fechamentoVal = avaliacao?.valor_fechamento ?? 0;
                      const margem = quantoVendeVal - fechamentoVal;
                      const margemPct = quantoVendeVal > 0 ? Math.round((margem / quantoVendeVal) * 1000) / 10 : 0;
                      const margemPositiva = margem >= 0;
                      return (
                        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Quanto Vende</span>
                              <p className="text-base font-bold text-primary">{formatCurrency(quantoVendeVal)}</p>
                            </div>
                            <div>
                              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Valor Fechamento</span>
                              <p className="text-base font-bold text-primary">{formatCurrency(fechamentoVal)}</p>
                            </div>
                            <div>
                              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Margem Prevista</span>
                              <p className={`text-base font-bold ${margemPositiva ? 'text-primary' : 'text-destructive'}`}>
                                {formatCurrency(margem)}{quantoVendeVal > 0 && ` (${margemPct.toFixed(1)}%)`}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  {avaliacao?.observacao_avaliador && (
                    <div className="mt-2">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observação do Avaliador</span>
                      <p className="text-sm mt-1">{avaliacao.observacao_avaliador}</p>
                    </div>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" className="gap-1.5 mt-3" onClick={() => setShowEvalDialog(true)}>
                      <Edit className="h-4 w-4" /> Editar Avaliação
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">Avaliação ainda não realizada</p>
                  {canEdit && (
                    <Button size="sm" className="gap-1.5" onClick={() => setShowEvalDialog(true)}>
                      <DollarSign className="h-4 w-4" /> Fazer Avaliação
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Observações */}
          {avaliacaoId && <ObservacoesProcesso entityId={avaliacaoId} entityType="avaliacao" title="Observações do Atendimento" />}

          {/* Histórico de Movimentações */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Histórico de Movimentações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline history={history} formatLabel={(raw) => {
                const remap: Record<string, string> = { vendido: 'adquirida' };
                const mapped = remap[raw] || raw;
                return mapped.replace(/_/g, ' ').replace(/\bavaliacao\b/gi, 'avaliação');
              }} renderPopupExtra={(h) => {
                if (h.observacoes) {
                  return (
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {h.status === 'consulta_realizada' ? 'Resultado da Consulta' : 'Observações'}
                      </span>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap">{h.observacoes}</p>
                    </div>
                  );
                }
                return null;
              }} />
            </CardContent>
          </Card>

           <div className="md:col-span-2 flex flex-col items-center gap-3">
            <div className="flex gap-2 flex-wrap justify-center">
              {(avaliacao?.situacao === 'adquirida' || avaliacao?.situacao === 'estoque') && avaliacao?.tipo_aquisicao && !estoqueVendido && (
                <Button
                  size="sm"
                  className="gap-2 text-white hover:opacity-90"
                  style={{ backgroundColor: '#1E3A5F' }}
                  onClick={() => {
                    setIsConvertendo(true);
                    setObsMotaAquisicao('');
                    setValorFechamentoAquisicao('');
                    const ma = avaliacao?.moto_avaliacao || (avaliacao as any)?.motos_avaliacao;
                    setAquisManual(ma?.tem_manual ? 'sim' : ma?.tem_manual === false ? 'nao' : '');
                    setAquisChaveReserva(ma?.tem_chave_reserva ? 'sim' : ma?.tem_chave_reserva === false ? 'nao' : '');
                    setAquisRevisaoVencida(ma?.manutencao_vencida ? 'sim' : ma?.manutencao_vencida === false ? 'nao' : '');
                    // Pre-select the only available option
                    const currentTipo = avaliacao.tipo_aquisicao;
                    const oppositeTipo = (currentTipo === 'consignada') ? 'propria' : 'consignada';
                    setTipoSelecionado(oppositeTipo);
                    setTipoAquisicaoPopup(true);
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" /> Converter
                </Button>
              )}
              {statusButtons.map(btn => (
                <Button
                  key={btn.value}
                  size="sm"
                  className="gap-2 text-white hover:opacity-90"
                  style={{ backgroundColor: btn.color }}
                  onClick={() => {
                    if (btn.value === 'adquirida') {
                      setIsConvertendo(false);
                      setObsMotaAquisicao('');
                      const ma = avaliacao?.moto_avaliacao || avaliacao?.motos_avaliacao;
                      setAquisManual(ma?.tem_manual ? 'sim' : ma?.tem_manual === false ? 'nao' : '');
                      setAquisChaveReserva(ma?.tem_chave_reserva ? 'sim' : ma?.tem_chave_reserva === false ? 'nao' : '');
                      setAquisRevisaoVencida(ma?.manutencao_vencida ? 'sim' : ma?.manutencao_vencida === false ? 'nao' : '');
                      setTipoAquisicaoPopup(true);
                      return;
                    }
                    if (btn.value === 'dispensada') {
                      setDispensadaMotivo('');
                      return;
                    }
                    handleStatusChange(btn.value);
                  }}
                >
                  {btn.icon}
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Dialog de Avaliação Comercial */}
      <Dialog open={showEvalDialog} onOpenChange={setShowEvalDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Avaliação Comercial
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <CurrencyField label="Valor FIPE" value={valorFipe} onChange={handleCurrencyChange(setValorFipe)} />
            <CurrencyField label="Menor Valor" value={menorValor} onChange={handleCurrencyChange(setMenorValor)} />
            <CurrencyField label="Maior Valor" value={maiorValor} onChange={handleCurrencyChange(setMaiorValor)} />
            <CurrencyField label="Quanto Pede?" value={quantoPede} onChange={handleCurrencyChange(setQuantoPede)} />
            <CurrencyField label="Quanto Vende?" value={quantoVende} onChange={handleCurrencyChange(setQuantoVende)} />
            <CurrencyField label="Quanto Vende (se der errado)?" value={quantoVendeErrado} onChange={handleCurrencyChange(setQuantoVendeErrado)} />
            <CurrencyField label="Avaliação Consignação" value={avalConsig} onChange={handleCurrencyChange(setAvalConsig)} />
            <CurrencyField label="Avaliação Compra" value={avalCompra} onChange={handleCurrencyChange(setAvalCompra)} />
            <CurrencyField label="Previsão Custos Loja" value={prevCustosLoja} onChange={handleCurrencyChange(setPrevCustosLoja)} />
            <CurrencyField label="Previsão Custos Cliente" value={prevCustosCliente} onChange={handleCurrencyChange(setPrevCustosCliente)} />
            {(avaliacao?.situacao === 'adquirida' || avaliacao?.situacao === 'estoque') && (
              <CurrencyField label="Valor de Fechamento" value={valorFechamentoEdit} onChange={handleCurrencyChange(setValorFechamentoEdit)} />
            )}
            <div className="space-y-1.5">
              <Label>Preço Ação</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  value={precoAcaoEdit}
                  onChange={handleCurrencyChange(setPrecoAcaoEdit)}
                  className="pl-10"
                  placeholder="0,00"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Classificação da Moto <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                {['A+', 'A', 'B', 'C'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassificacao(c)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${classificacao === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação do Avaliador <span className="text-destructive">*</span></Label>
              <Textarea value={obsAvaliador} onChange={e => setObsAvaliador(e.target.value)} rows={3} placeholder="Observações sobre a avaliação..." />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={() => setShowEvalDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Fotos */}
      <Dialog open={showPhotosDialog} onOpenChange={setShowPhotosDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Fotos da Moto
            </DialogTitle>
          </DialogHeader>
          {fotos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {fotos.map(f => (
                <div key={f.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img src={f.url} alt={f.tipo} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(f.url, '_blank')} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma foto incluída
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={() => setShowPhotosDialog(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Tipo de Aquisição / Conversão */}
      <Dialog open={tipoAquisicaoPopup} onOpenChange={(o) => { if (!o) { setTipoAquisicaoPopup(false); setValorFechamentoAquisicao(''); setTipoSelecionado(null); setObsMotaAquisicao(''); setIsConvertendo(false); } }}>
        <DialogContent className="w-[96vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isConvertendo ? <ArrowLeftRight className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
              {isConvertendo ? 'Conversão' : 'Aquisição'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Valor de Fechamento (R$) <span className="text-destructive">*</span></label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  className="pl-10"
                  placeholder="0,00"
                  value={valorFechamentoAquisicao}
                  onChange={(e) => setValorFechamentoAquisicao(applyCurrencyMask(e.target.value))}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Tipo de Aquisição <span className="text-destructive">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
                {isConvertendo ? (
                  (() => {
                    const currentTipo = avaliacao?.tipo_aquisicao;
                    const oppositeLabel = currentTipo === 'consignada' ? 'Própria' : 'Consignada';
                    return (
                      <Button
                        variant="default"
                        className="col-span-2 sm:col-span-4"
                        disabled
                      >
                        {oppositeLabel}
                      </Button>
                    );
                  })()
                ) : (
                  <>
                    <Button
                      variant={tipoSelecionado === 'propria' ? 'default' : 'outline'}
                      className={`w-full gap-2 ${tipoSelecionado === 'propria' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : 'border-green-500 text-green-600 hover:bg-green-50'}`}
                      onClick={() => setTipoSelecionado('propria')}
                    >
                      <ShieldCheck className="h-4 w-4" /> Própria
                    </Button>
                    <Button
                      variant={tipoSelecionado === 'consignada' ? 'default' : 'outline'}
                      className={`w-full gap-2 ${tipoSelecionado === 'consignada' ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' : 'border-purple-500 text-purple-600 hover:bg-purple-50'}`}
                      onClick={() => setTipoSelecionado('consignada')}
                    >
                      <Handshake className="h-4 w-4" /> Consignada
                    </Button>
                    <Button
                      variant={tipoSelecionado === 'test-ride' ? 'default' : 'outline'}
                      className={`w-full gap-2 ${tipoSelecionado === 'test-ride' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : 'border-orange-500 text-orange-600 hover:bg-orange-50'}`}
                      onClick={() => setTipoSelecionado('test-ride')}
                    >
                      <Bike className="h-4 w-4" /> Test-Ride
                    </Button>
                    <Button
                      variant={tipoSelecionado === 'repasse' ? 'default' : 'outline'}
                      className={`w-full gap-2 ${tipoSelecionado === 'repasse' ? 'bg-muted-foreground hover:bg-muted-foreground/90 text-background border-muted-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      onClick={() => setTipoSelecionado('repasse')}
                    >
                      <ArrowLeftRight className="h-4 w-4" /> Repasse
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Manual</Label>
                <RadioGroup value={aquisManual} onValueChange={setAquisManual} className="flex gap-3">
                  <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="aq-manual-sim" /><Label htmlFor="aq-manual-sim" className="text-xs">Sim</Label></div>
                  <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="aq-manual-nao" /><Label htmlFor="aq-manual-nao" className="text-xs">Não</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Chave Reserva</Label>
                <RadioGroup value={aquisChaveReserva} onValueChange={setAquisChaveReserva} className="flex gap-3">
                  <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="aq-chave-sim" /><Label htmlFor="aq-chave-sim" className="text-xs">Sim</Label></div>
                  <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="aq-chave-nao" /><Label htmlFor="aq-chave-nao" className="text-xs">Não</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Revisão Vencida</Label>
                <RadioGroup value={aquisRevisaoVencida} onValueChange={setAquisRevisaoVencida} className="flex gap-3">
                  <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="aq-rev-sim" /><Label htmlFor="aq-rev-sim" className="text-xs">Sim</Label></div>
                  <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="aq-rev-nao" /><Label htmlFor="aq-rev-nao" className="text-xs">Não</Label></div>
                </RadioGroup>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Observações da Moto</label>
              <Textarea
                className="mt-1"
                placeholder="Ex: Manual, chave reserva, acessórios..."
                value={obsMotaAquisicao}
                onChange={(e) => setObsMotaAquisicao(e.target.value.toUpperCase())}
                rows={2}
              />
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                className="w-full sm:flex-1 gap-2"
                onClick={() => { setTipoAquisicaoPopup(false); setValorFechamentoAquisicao(''); setTipoSelecionado(null); setObsMotaAquisicao(''); setIsConvertendo(false); }}
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              {valorFechamentoAquisicao.trim() !== '' && parseCurrencyToNumber(valorFechamentoAquisicao) !== null && parseCurrencyToNumber(valorFechamentoAquisicao)! > 0 && tipoSelecionado && (
                <Button
                  className="w-full sm:flex-1 gap-2"
                  onClick={isConvertendo ? handleSaveConversao : handleSaveAquisicao}
                  disabled={savingAquisicao}
                >
                  {savingAquisicao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingAquisicao ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {avaliacao?.situacao === 'adquirida' && avaliacao?.tipo_aquisicao === 'consignada' && (
        <ContratoConsignacaoDialog
          open={contratoConsignacaoOpen}
          onOpenChange={setContratoConsignacaoOpen}
          avaliacao={avaliacao}
        />
      )}

      {avaliacao?.situacao === 'adquirida' && isTipoPropria(avaliacao?.tipo_aquisicao) && (
        <ContratoCompraDialog
          open={contratoCompraOpen}
          onOpenChange={setContratoCompraOpen}
          avaliacao={avaliacao}
        />
      )}

      <CustosOficinaDialog
        open={custosOpen}
        onOpenChange={setCustosOpen}
        avaliacaoId={avaliacaoId}
      />

      <Dialog open={showResultadoConsulta} onOpenChange={setShowResultadoConsulta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Resultado da Consulta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{resultadoConsulta || 'Nenhum resultado registrado.'}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog motivo dispensada */}
      <Dialog open={dispensadaMotivo !== null} onOpenChange={(open) => { if (!open) setDispensadaMotivo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Dispensar Avaliação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo <span className="text-destructive">*</span></Label>
            <Textarea
              value={dispensadaMotivo || ''}
              onChange={(e) => setDispensadaMotivo(e.target.value)}
              placeholder="Informe o motivo..."
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDispensadaMotivo(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!dispensadaMotivo?.trim() || savingDispensada}
                onClick={async () => {
                  if (!dispensadaMotivo?.trim()) {
                    toast.error('Informe o motivo');
                    return;
                  }
                  setSavingDispensada(true);
                  await handleStatusChange('dispensada', undefined, undefined, dispensadaMotivo.trim().toUpperCase());
                  setSavingDispensada(false);
                  setDispensadaMotivo(null);
                }}
              >
                {savingDispensada ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvaliacaoForm;
