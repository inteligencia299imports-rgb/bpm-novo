import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Edit, Trash2, Phone, MapPin, Tag, User, Thermometer, Store, Calendar, Bike, FileText, MessageCircle, Camera, Send, Sparkles, DollarSign, XCircle, Clock, Eye, Search, CheckCircle2, Loader2, Pencil } from 'lucide-react';
import type { Atendimento, MotoInteresse, MotoAvaliacao, SituacaoShowroom } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES, SEXOS, UFS } from '@/types/crm';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import PhotoUpload from './PhotoUpload';
import DocumentUpload from './DocumentUpload';
import { useAuth } from '@/contexts/AuthContext';
import StatusTimeline from '@/components/shared/StatusTimeline';
import DetailSkeleton from '@/components/shared/DetailSkeleton';
import ContratoDialog from './ContratoDialog';

interface Props {
  atendimento: Atendimento;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
  onStatusUpdated?: () => void;
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

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
};

const AtendimentoDetail: React.FC<Props> = ({ atendimento, onClose, onEdit, onDeleted, onStatusUpdated }) => {
  const { user, userName, role } = useAuth();
  const [motosInteresse, setMotosInteresse] = useState<MotoInteresse[]>([]);
  const [motosAvaliacao, setMotosAvaliacao] = useState<MotoAvaliacao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<string, any>>({});
  const [estoqueData, setEstoqueData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [photoMotoId, setPhotoMotoId] = useState<string | null>(null);
  const [viewAvaliacaoData, setViewAvaliacaoData] = useState<any>(null);
  const [cnhUrl, setCnhUrl] = useState<string | null>(atendimento.cnh_url || null);
  const [crlvUrls, setCrlvUrls] = useState<Record<string, string | null>>({});
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const [valorPopup, setValorPopup] = useState<{ valorSinal: string; valorVenda: string; valorFechamento: string; modo: 'sinal' | 'vendido' } | null>(null);
  const [savingValor, setSavingValor] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [contratoOpen, setContratoOpen] = useState(false);
  const [motivoPopup, setMotivoPopup] = useState<{ modo: 'pendente' | 'perdido'; motivo: string } | null>(null);
  const [savingMotivo, setSavingMotivo] = useState(false);
  const [showResultadoConsulta, setShowResultadoConsulta] = useState<string | null>(null);
  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [editSexo, setEditSexo] = useState('');
  const [editUf, setEditUf] = useState('');
  const [savingCliente, setSavingCliente] = useState(false);
  const [editCpfCnpj, setEditCpfCnpj] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editEndereco, setEditEndereco] = useState('');
  const [editCep, setEditCep] = useState('');

  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);

      // Fetch showroom history immediately (no dependency on motoIds)
      const showroomHistoryPromise = supabase
        .from('status_history')
        .select('*')
        .eq('entity_type', 'showroom')
        .eq('entity_id', atendimento.id)
        .order('created_at', { ascending: true });

      const [resInt, resAv, resAval, showroomRes] = await Promise.all([
        supabase.from('motos_interesse').select('*').eq('atendimento_id', atendimento.id),
        supabase.from('motos_avaliacao').select('*').eq('atendimento_id', atendimento.id),
        supabase.from('avaliacoes').select('*').eq('atendimento_id', atendimento.id),
        showroomHistoryPromise,
      ]);

      const motosInt = (resInt.data as unknown as MotoInteresse[]) || [];
      setMotosInteresse(motosInt);

      const motosAv = (resAv.data as unknown as MotoAvaliacao[]) || [];
      setMotosAvaliacao(motosAv);
      
      // Init CRLV URLs from fetched data
      const crlvMap: Record<string, string | null> = {};
      for (const m of motosAv) {
        crlvMap[m.id] = (m as any).crlv_url || null;
      }
      setCrlvUrls(crlvMap);

      // Store showroom history temporarily
      const showroomHistoryData = showroomRes.data || [];

      // Now fetch secondary data in parallel without blocking the UI
      const motoIds = motosAv.map(m => m.id);
      const estoqueIds = motosInt.filter(m => m.origem === 'estoque' && m.estoque_moto_id).map(m => m.estoque_moto_id!);

      // Fetch all secondary data in parallel
      const estoquePromise = estoqueIds.length > 0
        ? supabase.from('estoque').select('*, motos_avaliacao(tem_manual, tem_chave_reserva, manutencao_em_dia)').in('id', estoqueIds).then(r => r)
        : Promise.resolve({ data: null as any[] | null });

      const avaliadorIds = resAval.data
        ? [...new Set(resAval.data.map((av: any) => av.avaliador_id).filter(Boolean))]
        : [];
      const avaliadorPromise = avaliadorIds.length > 0
        ? supabase.from('user_roles').select('user_id, nome').in('user_id', avaliadorIds).then(r => r)
        : Promise.resolve({ data: null as any[] | null });

      const consultaPromise = motoIds.length > 0
        ? supabase.from('status_history').select('*').eq('entity_type', 'consulta').in('entity_id', motoIds).order('created_at', { ascending: true }).then(r => r)
        : Promise.resolve({ data: [] as any[] });
      const avaliacaoHistPromise = motoIds.length > 0
        ? supabase.from('status_history').select('*').eq('entity_type', 'avaliacao').in('entity_id', motoIds).order('created_at', { ascending: true }).then(r => r)
        : Promise.resolve({ data: [] as any[] });
      const fotosCountPromise = motoIds.length > 0
        ? supabase.from('moto_fotos').select('moto_avaliacao_id').in('moto_avaliacao_id', motoIds).then(r => r)
        : Promise.resolve({ data: [] as any[] });

      const [estoqueRes, rolesRes, consultaRes, avaliacaoRes, fotosCountRes] = await Promise.all([
        estoquePromise, avaliadorPromise, consultaPromise, avaliacaoHistPromise, fotosCountPromise,
      ]);

      // Update estoque
      if (estoqueRes.data) {
        const estoqueMap: Record<string, any> = {};
        for (const item of estoqueRes.data) {
          estoqueMap[item.id] = {
            ...item,
            tem_manual: item.motos_avaliacao?.tem_manual ?? null,
            tem_chave_reserva: item.motos_avaliacao?.tem_chave_reserva ?? null,
            manutencao_em_dia: item.motos_avaliacao?.manutencao_em_dia ?? null,
          };
        }
        setEstoqueData(estoqueMap);
      }

      // Update photo counts
      if (fotosCountRes.data) {
        const countMap: Record<string, number> = {};
        for (const f of fotosCountRes.data) {
          countMap[f.moto_avaliacao_id] = (countMap[f.moto_avaliacao_id] || 0) + 1;
        }
        setPhotoCountMap(countMap);
      }

      // Map avaliacoes with avaliador names
      const avalMap: Record<string, any> = {};
      if (resAval.data) {
        let avaliadorNames: Record<string, string> = {};
        if (rolesRes.data) {
          for (const r of rolesRes.data) {
            avaliadorNames[r.user_id] = r.nome;
          }
        }
        for (const av of resAval.data) {
          avalMap[(av as any).moto_avaliacao_id] = { ...av, avaliador_nome: avaliadorNames[(av as any).avaliador_id] || null };
        }
      }
      setAvaliacoes(avalMap);

      // Merge full history
      const fullHistory = [
        ...showroomHistoryData,
        ...(consultaRes.data || []),
        ...(avaliacaoRes.data || []),
      ];
      fullHistory.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setHistory(fullHistory);
      setLoading(false);
    };
    fetchRelated();
  }, [atendimento.id]);

  const handleDelete = async () => {
    try {
      const { error } = await supabase.rpc('delete_atendimento_cascade', { _atendimento_id: atendimento.id });
      if (error) throw error;
      toast.success('Atendimento excluído');
      onDeleted();
    } catch (err: any) {
      toast.error('Erro ao excluir atendimento: ' + (err.message || ''));
    }
  };

  const InfoItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    ) : null
  );

  const whatsappUrl = (() => {
    const digits = atendimento.telefone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  const handleStatusChange = async (value: SituacaoShowroom, label: string, extraData?: Record<string, any>, observacoes?: string) => {
    const previousStatus = atendimento.situacao;
    const updateData: any = { situacao: value, ...extraData };
    const { error } = await supabase.from('atendimentos').update(updateData).eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      // Record in status_history (fire and forget for speed, await later)
      const historyPromise = supabase.from('status_history').insert({
        entity_type: 'showroom',
        entity_id: atendimento.id,
        status_from: previousStatus,
        status_to: value,
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
        observacoes: observacoes || null,
      }).then(r => r);

      toast.success(`Status alterado para ${label}`);

      // Sync: perdido no showroom → perdido nas avaliações + reverter estoque
      if (value === 'perdido') {
        const { data: avaliacoesData } = await supabase.from('avaliacoes').select('id, moto_avaliacao_id, situacao').eq('atendimento_id', atendimento.id);
        
        const promises: PromiseLike<any>[] = [
          historyPromise,
          supabase.from('avaliacoes').update({ situacao: 'perdido' }).eq('atendimento_id', atendimento.id).then(r => r),
        ];

        // Record history for each avaliacao in parallel
        if (avaliacoesData) {
          for (const av of avaliacoesData) {
            promises.push(supabase.from('status_history').insert({
              entity_type: 'avaliacao',
              entity_id: av.moto_avaliacao_id,
              status_from: av.situacao || 'em_aberto',
              status_to: 'perdido',
              changed_by: user?.id,
              changed_by_name: userName || user?.email || null,
              observacoes: observacoes || null,
            }).then(r => r));
          }
        }

        // Reverter moto de interesse no estoque para disponível
        for (const mi of motosInteresse) {
          if (mi.estoque_moto_id) {
            promises.push(supabase.from('estoque').update({
              status: 'disponivel',
              atendimento_venda_id: null,
              data_venda: null,
              valor_venda: null,
              valor_sinal: null,
            }).eq('id', mi.estoque_moto_id).eq('atendimento_venda_id', atendimento.id).then(r => r));
          }
        }

        // Remover do estoque motos de troca que entraram via este atendimento
        if (atendimento.interesse === 'trocar') {
          for (const moto of motosAvaliacao) {
            const av = avaliacoes[moto.id];
            if (av) {
              promises.push(supabase.from('estoque').delete().eq('avaliacao_id', av.id).then(r => r));
            }
          }
        }

        await Promise.all(promises);
      }
      // Sync: dispensada no showroom → dispensada nas avaliações
      else if (value === 'dispensada') {
        const { data: avaliacoesData } = await supabase.from('avaliacoes').select('id, moto_avaliacao_id, situacao').eq('atendimento_id', atendimento.id);
        
        const promises: PromiseLike<any>[] = [
          historyPromise,
          supabase.from('avaliacoes').update({ situacao: 'dispensada' }).eq('atendimento_id', atendimento.id).then(r => r),
        ];

        if (avaliacoesData) {
          for (const av of avaliacoesData) {
            promises.push(supabase.from('status_history').insert({
              entity_type: 'avaliacao',
              entity_id: av.moto_avaliacao_id,
              status_from: av.situacao || 'em_aberto',
              status_to: 'dispensada',
              changed_by: user?.id,
              changed_by_name: userName || user?.email || null,
              observacoes: observacoes || null,
            }).then(r => r));
          }
        }

        await Promise.all(promises);
      } else {
        await historyPromise;
      }

      if (onStatusUpdated) {
        onStatusUpdated();
      } else {
        onDeleted();
      }
    }
  };

  const handleSaveMotivo = async () => {
    if (!motivoPopup) return;
    if (!motivoPopup.motivo.trim()) {
      toast.error('Informe o motivo para alterar o status');
      return;
    }
    setSavingMotivo(true);
    const label = motivoPopup.modo === 'pendente' ? 'Pendente' : 'Perdido';
    await handleStatusChange(motivoPopup.modo as SituacaoShowroom, label, undefined, motivoPopup.motivo.trim().toUpperCase());
    setSavingMotivo(false);
    setMotivoPopup(null);
  };

  const handleSaveValor = async () => {
    if (!valorPopup) return;
    const sinal = parseCurrencyInput(valorPopup.valorSinal);
    const venda = parseCurrencyInput(valorPopup.valorVenda);
    
    if (valorPopup.modo === 'sinal' && sinal <= 0) {
      toast.error('Informe o valor do sinal');
      return;
    }
    if (valorPopup.modo === 'vendido' && venda <= 0) {
      toast.error('Informe o valor da venda');
      return;
    }
    
    setSavingValor(true);
    const updateData: any = {};
    if (sinal > 0) updateData.valor_sinal = sinal;
    if (venda > 0) updateData.valor_venda = venda;
    const newStatus = valorPopup.modo;
    const label = newStatus === 'vendido' ? 'Vendido' : 'Sinal';

    // Atualizar estoque ANTES de mudar o status (pois handleStatusChange pode desmontar o componente)
    if (newStatus === 'vendido' || newStatus === 'sinal') {
      const estoquePromises: PromiseLike<any>[] = [];
      for (const mi of motosInteresse) {
        if (mi.estoque_moto_id) {
          const estoqueUpdate: any = {
            atendimento_venda_id: atendimento.id,
            status: newStatus === 'vendido' ? 'vendido' : 'sinal',
            valor_venda: venda > 0 ? venda : null,
            valor_sinal: sinal > 0 ? sinal : null,
          };
          if (newStatus === 'vendido') {
            estoqueUpdate.data_venda = new Date().toISOString();
          }
          estoquePromises.push(supabase.from('estoque').update(estoqueUpdate).eq('id', mi.estoque_moto_id).then(r => r));
        }
      }

      // Se for troca e vendido, marcar todas as avaliações como adquirida/própria com valor de fechamento
      if (newStatus === 'vendido' && atendimento.interesse === 'trocar') {
        const fechamento = parseCurrencyInput(valorPopup.valorFechamento);
        for (const moto of motosAvaliacao) {
          const av = avaliacoes[moto.id];
          if (av) {
            const avUpdate: any = {
              situacao: 'adquirida',
              tipo_aquisicao: 'propria',
            };
            if (fechamento > 0) avUpdate.valor_fechamento = fechamento;
            estoquePromises.push(supabase.from('avaliacoes').update(avUpdate).eq('id', av.id).then(r => r));
          }
        }
        // Sync valor_fechamento to contratos table too
        if (fechamento > 0) {
          estoquePromises.push(
            supabase.from('contratos').update({ valor_fechamento: fechamento }).eq('atendimento_id', atendimento.id).then(r => r)
          );
        }
      }
      await Promise.all(estoquePromises);
    }

    await handleStatusChange(newStatus as SituacaoShowroom, label, updateData);

    setSavingValor(false);
    setValorPopup(null);
  };

  const isAvaliada = (motoId: string) => {
    const av = avaliacoes[motoId];
    return av && av.situacao !== 'sem_avaliar';
  };

  const formatPhoneInput = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const openEditCliente = () => {
    setEditNome(atendimento.nome_cliente);
    setEditTelefone(formatPhoneInput(atendimento.telefone));
    setEditSexo(atendimento.sexo);
    setEditUf(atendimento.uf);
    setEditCpfCnpj((atendimento as any).cpf_cnpj || '');
    setEditEmail((atendimento as any).email || '');
    setEditEndereco((atendimento as any).endereco || '');
    setEditCep((atendimento as any).cep || '');
    setEditClienteOpen(true);
  };

  const handleSaveCliente = async () => {
    const digits = editTelefone.replace(/\D/g, '');
    if (!editNome.trim() || digits.length !== 11 || !editSexo || !editUf) {
      toast.error('Preencha todos os campos corretamente');
      return;
    }
    setSavingCliente(true);
    const { error } = await supabase.from('atendimentos').update({
      nome_cliente: editNome.trim(),
      telefone: digits,
      sexo: editSexo,
      uf: editUf,
      cpf_cnpj: editCpfCnpj.trim() || null,
      email: editEmail.trim() || null,
      endereco: editEndereco.trim() || null,
      cep: editCep.trim() || null,
    } as any).eq('id', atendimento.id);
    setSavingCliente(false);
    if (error) {
      toast.error('Erro ao salvar dados do cliente');
    } else {
      toast.success('Dados do cliente atualizados!');
      setEditClienteOpen(false);
      if (onStatusUpdated) onStatusUpdated(); else onDeleted();
    }
  };

  if (loading) {
    return <DetailSkeleton onClose={onClose} />;
  }

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
              <h1 className="text-lg sm:text-xl font-bold truncate">{atendimento.nome_cliente}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {atendimento.situacao === 'pendente' && (() => {
              const lastPendente = [...history].reverse().find(h => h.entity_type === 'showroom' && h.status_to === 'pendente' && h.observacoes);
              return lastPendente ? (
                <p className="text-xs text-yellow-600 mt-0.5 italic">Motivo: {lastPendente.observacoes}</p>
              ) : null;
            })()}
          </div>
          {/* Desktop buttons */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {(atendimento.situacao === 'sinal' || atendimento.situacao === 'vendido') && (
              <Button size="sm" onClick={() => setContratoOpen(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Contrato
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(atendimento.id)}>
              <Edit className="h-4 w-4" /> Editar
            </Button>
            {role === 'gestor' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-1.5">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é irreversível. O atendimento de <strong>{atendimento.nome_cliente}</strong> e todos os dados relacionados (avaliações, motos, contratos, histórico) serão permanentemente excluídos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        {/* Mobile buttons - below name/date, centered, equal width */}
        <div className="flex sm:hidden gap-2 justify-center">
          {(atendimento.situacao === 'sinal' || atendimento.situacao === 'vendido') && (
            <Button size="sm" onClick={() => setContratoOpen(true)} className="flex-1">
              <FileText className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(atendimento.id)}>
            <Edit className="h-4 w-4" />
          </Button>
          {role === 'gestor' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="flex-1">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é irreversível. O atendimento de <strong>{atendimento.nome_cliente}</strong> e todos os dados relacionados (avaliações, motos, contratos, histórico) serão permanentemente excluídos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Dados do Cliente
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEditCliente} title="Editar dados do cliente">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={atendimento.nome_cliente} />
                <div>
                  <span className="text-xs text-muted-foreground">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{formatPhone(atendimento.telefone)}</span>
                    <button
                      onClick={() => window.open(whatsappUrl, '_blank')}
                      className="text-green-600 hover:text-green-700 transition-colors"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <InfoItem label="Sexo" value={atendimento.sexo} />
                <InfoItem label="UF" value={atendimento.uf} />
                <InfoItem label="CPF/CNPJ" value={(atendimento as any).cpf_cnpj} />
                <InfoItem label="E-mail" value={(atendimento as any).email} />
                <InfoItem label="Endereço" value={(atendimento as any).endereco} />
                <InfoItem label="CEP" value={(atendimento as any).cep} />
              </div>
              <Separator className="my-2" />
              <DocumentUpload
                label="CNH"
                currentUrl={cnhUrl}
                bucketPath={`docs/${atendimento.id}/cnh`}
                onUploaded={async (url) => {
                  await supabase.from('atendimentos').update({ cnh_url: url } as any).eq('id', atendimento.id);
                  setCnhUrl(url);
                }}
                onRemoved={async () => {
                  await supabase.from('atendimentos').update({ cnh_url: null } as any).eq('id', atendimento.id);
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
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Loja" value={atendimento.loja} />
                <InfoItem label="Tipo de Atendimento" value={atendimento.tipo_atendimento} />
                <InfoItem label="Interesse" value={int?.label} />
                <InfoItem label="Origem" value={atendimento.origem} />
                <InfoItem label="Temperatura" value={atendimento.temperatura} />
                <InfoItem label="Situação" value={sit?.label} />
              </div>
            </CardContent>
          </Card>

          {/* Motos de Interesse (Compra) */}
          {motosInteresse.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Moto de Interesse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {motosInteresse.map((moto, idx) => {
                  const isEstoque = moto.origem === 'estoque' && moto.estoque_moto_id;
                  const estItem = isEstoque ? estoqueData[moto.estoque_moto_id!] : null;
                  return (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    {estItem ? (
                      <>
                        {/* Header like estoque card */}
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-foreground">{estItem.marca} {estItem.modelo}</p>
                            <p className="text-xs text-muted-foreground">
                              {[estItem.ano_fabricacao, estItem.ano_modelo].filter(Boolean).join('/')}
                              {estItem.cilindrada ? ` · ${estItem.cilindrada}cc` : ''}
                            </p>
                          </div>
                          {atendimento.loja?.toLowerCase() !== 'ducati' && (
                            <Badge variant="outline" className={`text-xs ${
                              estItem.status === 'vendido' ? 'border-[#169d53] text-[#169d53]' :
                              estItem.status === 'sinal' ? 'border-[#7e6597] text-[#7e6597]' :
                              estItem.status === 'indisponivel' ? 'border-orange-500 text-orange-600' :
                              estItem.status === 'indisponivel_manual' ? 'border-destructive text-destructive' :
                              estItem.status === 'bloqueio_juridico' ? 'border-muted-foreground text-muted-foreground' :
                              ''
                            }`}>
                              {estItem.status === 'vendido' ? 'Vendido' : estItem.status === 'sinal' ? 'Sinal' : estItem.status === 'indisponivel' ? 'Serviço' : estItem.status === 'indisponivel_manual' ? 'Indisponível' : estItem.status === 'bloqueio_juridico' ? 'Bloqueio Jurídico' : 'Estoque'}
                            </Badge>
                          )}
                        </div>
                        {/* Estoque observation for special statuses */}
                        {estItem.observacoes && ['indisponivel', 'indisponivel_manual', 'bloqueio_juridico'].includes(estItem.status) && (
                          <div className={`text-xs italic flex items-start gap-1.5 rounded p-2 ${
                            estItem.status === 'indisponivel' ? 'text-orange-600 bg-orange-500/10' :
                            estItem.status === 'indisponivel_manual' ? 'text-destructive bg-destructive/10' :
                            'text-muted-foreground bg-muted'
                          }`}>
                            {estItem.observacoes}
                          </div>
                        )}
                        {atendimento.loja?.toLowerCase() === 'ducati' ? (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {moto.chassi && (
                              <>
                                <span className="text-muted-foreground">Chassi</span>
                                <span className="font-medium text-foreground">{moto.chassi}</span>
                              </>
                            )}
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {estItem.placa && (
                            <>
                              <span className="text-muted-foreground">Placa</span>
                              <span className="font-medium text-foreground">{estItem.placa.replace(/-/g, '')}</span>
                            </>
                          )}
                          {estItem.cor && (
                            <>
                              <span className="text-muted-foreground">Cor</span>
                              <span className="text-foreground">{estItem.cor}</span>
                            </>
                          )}
                          {estItem.categoria && (
                            <>
                              <span className="text-muted-foreground">Categoria</span>
                              <span className="text-foreground">{estItem.categoria}</span>
                            </>
                          )}
                          {estItem.km && (
                            <>
                              <span className="text-muted-foreground">KM</span>
                              <span className="text-foreground">{estItem.km}</span>
                            </>
                          )}
                          <span className="text-muted-foreground">Tipo</span>
                          <span className="text-foreground capitalize">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${estItem.tipo === 'consignada' ? 'border-purple-500 text-purple-600' : 'border-green-500 text-green-600'}`}>
                              {estItem.tipo === 'propria' ? 'Própria' : 'Consignada'}
                            </Badge>
                          </span>
                          {estItem.empresa && (
                            <>
                              <span className="text-muted-foreground">Empresa</span>
                              <span className="text-foreground">{estItem.empresa}</span>
                            </>
                          )}
                        </div>
                        )}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${estItem.tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                            Manual
                          </span>
                          <span className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${estItem.tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                            Chave Reserva
                          </span>
                          <span className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${estItem.manutencao_em_dia ? 'bg-red-500' : 'bg-green-500'}`} />
                            Revisão
                          </span>
                        </div>
                        {/* Prices section */}
                        <div className="pt-2 border-t border-border space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Preço</p>
                              <p className="font-semibold text-foreground">{formatCurrency(estItem.preco)}</p>
                            </div>
                            {estItem.preco_acao != null && (
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Preço Ação</p>
                                <p className="font-semibold text-success">{formatCurrency(estItem.preco_acao)}</p>
                              </div>
                            )}
                          </div>
                          {(atendimento as any).valor_sinal != null && (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">Valor do Sinal</p>
                                <p className="font-semibold text-amber-600">{formatCurrency((atendimento as any).valor_sinal)}</p>
                              </div>
                            </div>
                          )}
                          {(atendimento as any).valor_venda != null && (
                            <>
                              <Separator />
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor de Venda</p>
                                  <p className="font-semibold text-primary">{formatCurrency((atendimento as any).valor_venda)}</p>
                                </div>
                                {estItem.preco_acao != null && (
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Diferença (Venda - Ação)</p>
                                    {(() => {
                                      const diff = ((atendimento as any).valor_venda || 0) - (estItem.preco_acao || 0);
                                      return (
                                        <p className={`font-semibold ${diff >= 0 ? 'text-success' : 'text-destructive'}`}>
                                          {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                                        </p>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {estItem.observacoes && (
                          <p className="text-xs text-muted-foreground italic">{estItem.observacoes}</p>
                        )}
                      </>
                    ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {atendimento.loja?.toLowerCase() !== 'ducati' && <InfoItem label="Origem" value="Externo" />}
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano" value={moto.ano} />
                      {atendimento.loja?.toLowerCase() === 'ducati' && moto.chassi && <InfoItem label="Chassi" value={moto.chassi} />}
                    </div>
                    )}
                  </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Motos de Avaliação (Venda/Troca) - ocultar quando interesse é compra */}
          {motosAvaliacao.length > 0 && atendimento.interesse !== 'comprar' && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {motosAvaliacao.some(m => (m as any).consulta_solicitada && !(m as any).consulta_realizada) && (
                      <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1">
                        <Clock className="h-3 w-3" /> Consulta Solicitada
                      </Badge>
                    )}
                    {motosAvaliacao.some(m => m.enviada_avaliacao && !isAvaliada(m.id)) && (
                      <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1">
                        <Clock className="h-3 w-3" /> Aguardando avaliação
                      </Badge>
                    )}
                    {motosAvaliacao.some(m => avaliacoes[m.id]?.situacao === 'adquirida' && avaliacoes[m.id]?.tipo_aquisicao) && (
                      <Badge variant="outline" className={`text-[10px] ${motosAvaliacao.some(m => avaliacoes[m.id]?.tipo_aquisicao === 'consignada') ? 'border-purple-500 text-purple-600' : 'border-green-500 text-green-600'}`}>
                        {motosAvaliacao.some(m => avaliacoes[m.id]?.tipo_aquisicao === 'consignada') ? 'Consignada' : 'Própria'}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {motosAvaliacao.map((moto, idx) => (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={(moto.modelo || '').toUpperCase()} />
                      <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />
                      <InfoItem label="Ano Modelo" value={moto.ano_modelo} />
                      <InfoItem label="Categoria" value={moto.categoria} />
                      <InfoItem label="Cor" value={moto.cor} />
                      <InfoItem label="Placa" value={moto.placa?.replace(/-/g, '')} />
                      <InfoItem label="KM" value={formatKm(moto.km)} />
                    </div>
                    <div className="flex items-center gap-3 text-xs mt-3">
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${(moto as any).tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                        Manual
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${(moto as any).tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                        Chave Reserva
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${(moto as any).manutencao_em_dia ? 'bg-red-500' : 'bg-green-500'}`} />
                        Revisão
                      </span>
                    </div>
                    {moto.observacoes && (
                      <div className="mt-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações da Moto</span>
                        <p className="text-sm mt-1">{moto.observacoes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {/* 1. Incluir Fotos */}
                      <Button size="sm" variant="outline" className={`gap-1.5 ${(photoCountMap[moto.id] || 0) > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setPhotoMotoId(moto.id)}>
                        <Camera className="h-4 w-4" /> {(photoCountMap[moto.id] || 0) > 0 ? `Fotos (${photoCountMap[moto.id]}) ✓` : 'Incluir Fotos'}
                      </Button>

                      {/* 2. CRLV */}
                      <DocumentUpload
                        label="CRLV"
                        currentUrl={crlvUrls[moto.id] || null}
                        bucketPath={`docs/${moto.id}/crlv`}
                        onUploaded={async (url) => {
                          await supabase.from('motos_avaliacao').update({ crlv_url: url } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: url }));
                        }}
                        onRemoved={async () => {
                          await supabase.from('motos_avaliacao').update({ crlv_url: null } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: null }));
                        }}
                      />

                      {/* 3. Avaliada / Solicitar Avaliação */}
                      {!moto.enviada_avaliacao ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={async () => {
                            
                            const { error: avError } = await supabase.from('avaliacoes').insert({
                              atendimento_id: atendimento.id,
                              moto_avaliacao_id: moto.id,
                            });
                            if (avError) {
                              toast.error('Erro ao enviar para avaliação');
                              console.error(avError);
                              return;
                            }
                            const { error: mError } = await supabase
                              .from('motos_avaliacao')
                              .update({ enviada_avaliacao: true })
                              .eq('id', moto.id);
                            if (mError) {
                              toast.error('Erro ao atualizar moto');
                              console.error(mError);
                              return;
                            }
                            // Registrar no histórico
                            const historyEntry = {
                              entity_type: 'avaliacao',
                              entity_id: moto.id,
                              status_from: 'sem_avaliacao',
                              status_to: 'avaliacao_solicitada',
                              changed_by: user?.id,
                              changed_by_name: userName || user?.email || null,
                            };
                            const { data: insertedHistory } = await supabase.from('status_history').insert(historyEntry as any).select().single();
                            if (insertedHistory) {
                              setHistory(prev => [...prev, insertedHistory].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                            }
                            // Notificar avaliadores
                            await supabase.rpc('notify_role', {
                              _role: 'avaliador' as any,
                              _title: 'Avaliação Solicitada',
                              _message: `Nova avaliação solicitada: ${moto.marca} ${moto.modelo} ${moto.placa ? `(${moto.placa})` : ''} - Cliente: ${atendimento.nome_cliente} | Por: ${userName || user?.email || 'Usuário'}`,
                              _entity_id: atendimento.id,
                              _entity_type: 'avaliacao',
                            });
                            toast.success('Enviado para avaliação!');
                            setMotosAvaliacao(prev => prev.map(m => m.id === moto.id ? { ...m, enviada_avaliacao: true } : m));
                          }}
                        >
                          <Send className="h-4 w-4" /> Enviar para Avaliação
                        </Button>
                      ) : isAvaliada(moto.id) ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-green-500 text-green-600 hover:bg-green-50"
                            onClick={() => setViewAvaliacaoData(avaliacoes[moto.id])}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Avaliada ✓
                          </Button>
                        </>
                      ) : null}

                      {/* 4. Consulta Realizada / Nova Consulta */}
                      {(moto as any).consulta_realizada && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-green-500 text-green-600 hover:bg-green-50"
                          onClick={() => setShowResultadoConsulta((moto as any).resultado_consulta || 'Nenhum resultado registrado.')}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Consulta Realizada ✓
                        </Button>
                      )}
                      {cnhUrl && crlvUrls[moto.id] && isAvaliada(moto.id) && (!(moto as any).consulta_solicitada || (moto as any).consulta_realizada) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={async () => {
                            const previousStatus = (moto as any).consulta_realizada ? 'consulta_realizada' : 'sem_consulta';
                            await supabase.from('motos_avaliacao').update({ 
                              consulta_solicitada: true, 
                              consulta_realizada: false,
                              resultado_consulta: null 
                            } as any).eq('id', moto.id);
                            const { data: insertedConsulta } = await supabase.from('status_history').insert({
                              entity_type: 'consulta',
                              entity_id: moto.id,
                              status_from: previousStatus,
                              status_to: 'consulta_solicitada',
                              changed_by: user?.id,
                              changed_by_name: userName || user?.email || null,
                            }).select().single();
                            if (insertedConsulta) {
                              setHistory(prev => [...prev, insertedConsulta].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                            }
                            setMotosAvaliacao(prev => prev.map(m => m.id === moto.id ? { ...m, consulta_solicitada: true, consulta_realizada: false, resultado_consulta: null } as any : m));
                            // Notify secretárias
                            await supabase.rpc('notify_role', {
                              _role: 'secretaria',
                              _title: 'Consulta Solicitada',
                              _message: `${atendimento?.nome_cliente} - ${moto.marca} ${moto.modelo}${moto.placa ? ` (${moto.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
                              _entity_id: moto.id,
                              _entity_type: 'consulta',
                            });
                            toast.success('Consulta solicitada com sucesso!');
                          }}
                        >
                          <Search className="h-4 w-4" /> {(moto as any).consulta_realizada ? 'Nova Consulta' : 'Solicitar Consulta'}
                        </Button>
                      )}
                      {(moto as any).consulta_solicitada && !(moto as any).consulta_realizada && (
                        <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1 h-7 flex items-center">
                          <Clock className="h-3 w-3" /> Consulta Solicitada
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {atendimento.observacoes && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{atendimento.observacoes}</p>
              </CardContent>
            </Card>
          )}

          {/* Histórico de Movimentações */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Histórico de Movimentações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
              ) : (
                <StatusTimeline
                  history={history}
                  renderPopupExtra={(h) => {
                    if (h.observacoes) {
                      return (
                        <div>
                          <span className="text-xs text-muted-foreground">Observações</span>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{h.observacoes}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Status Actions + Delete */}
           <div className="md:col-span-2 flex justify-center w-full">
            <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
              {[
                { value: 'pendente' as SituacaoShowroom, label: 'Pendente', icon: <Clock className="h-4 w-4" />, color: '#da6220' },
                { value: 'sinal' as SituacaoShowroom, label: 'Sinal', icon: <Sparkles className="h-4 w-4" />, color: '#7e6597' },
                { value: 'vendido' as SituacaoShowroom, label: 'Vendido', icon: <DollarSign className="h-4 w-4" />, color: '#169d53' },
                { value: 'perdido' as SituacaoShowroom, label: 'Perdido', icon: <XCircle className="h-4 w-4" />, color: '#FF3B30' },
                { value: 'dispensada' as SituacaoShowroom, label: 'Dispensada', icon: <XCircle className="h-4 w-4" />, color: '#FF8C00' },
              ]
                .filter(b => b.value !== atendimento.situacao)
                .filter(b => {
                  if (b.value === 'dispensada') return false;
                  if (atendimento.interesse === 'vender' && (b.value === 'sinal' || b.value === 'vendido')) {
                    return false;
                  }
                  if ((b.value === 'sinal' || b.value === 'vendido') && !motosInteresse.some(m => m.origem === 'estoque')) {
                    return false;
                  }
                  // Hide sinal/vendido if the estoque moto is already sold or reserved by another atendimento
                  if ((b.value === 'sinal' || b.value === 'vendido')) {
                    const motoEst = motosInteresse.find(m => m.origem === 'estoque' && m.estoque_moto_id);
                    if (motoEst) {
                      const est = estoqueData[motoEst.estoque_moto_id!];
                      if (est && (est.status === 'vendido' || est.status === 'indisponivel' || est.status === 'indisponivel_manual' || est.status === 'bloqueio_juridico' || (est.status === 'sinal' && est.atendimento_venda_id && est.atendimento_venda_id !== atendimento.id))) {
                        return false;
                      }
                    }
                  }
                  return true;
                })
                .map(btn => (
                  <Button
                    key={btn.value}
                    size="sm"
                    variant="outline"
                    className="gap-2 sm:min-w-[120px] flex-1 sm:flex-none hover:opacity-90 h-9 bg-transparent"
                    style={{ borderColor: btn.color, color: btn.color }}
                    onClick={async () => {
                      if (btn.value === 'sinal' || btn.value === 'vendido') {
                        // Sinal requires all motos avaliadas when it's a trade
                        if (btn.value === 'sinal' && atendimento.interesse === 'trocar') {
                          const allMotosAvaliadas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => isAvaliada(m.id));
                          if (!allMotosAvaliadas) {
                            toast.error('Para marcar como Sinal, a moto de troca precisa ter sido avaliada.');
                            return;
                          }
                        }
                        if (btn.value === 'vendido' && atendimento.interesse === 'trocar') {
                          const faltando: string[] = [];
                         if (!cnhUrl) faltando.push('CNH do cliente');
                          
                          const allCrlvs = motosAvaliacao.length > 0 && motosAvaliacao.every(m => crlvUrls[m.id]);
                          if (!allCrlvs) faltando.push('CRLV da moto');
                          
                          const allMotosAvaliadas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => isAvaliada(m.id));
                          if (!allMotosAvaliadas) faltando.push('Avaliação da moto ter sido feita');
                          
                          const allConsultas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => (m as any).consulta_realizada);
                          if (!allConsultas) faltando.push('Consulta documentacional realizada');
                          
                          if (faltando.length > 0) {
                            toast.error('Para finalizar como Vendido, certifique-se de que a CNH do cliente e o CRLV da moto foram enviados, e que a avaliação e a consulta de documentação já foram concluídas.');
                            return;
                          }
                        }
                        const toInput = (v: number | null | undefined) => v ? formatCurrencyInput(Math.round(v * 100).toString()) : '';
                        // Fetch latest values from DB to avoid stale data after contract save
                        const [{ data: freshAtend }, { data: freshContrato }] = await Promise.all([
                          supabase.from('atendimentos').select('valor_sinal, valor_venda').eq('id', atendimento.id).maybeSingle(),
                          supabase.from('contratos').select('valor_fechamento').eq('atendimento_id', atendimento.id).maybeSingle(),
                        ]);
                        const freshSinal = freshAtend?.valor_sinal ?? atendimento.valor_sinal;
                        const freshVenda = freshAtend?.valor_venda ?? atendimento.valor_venda;
                        // Fetch valor_fechamento: first from avaliacoes, fallback to contratos
                        let freshFechamento: number | null = freshContrato?.valor_fechamento ?? null;
                        if (motosAvaliacao.length > 0) {
                          const firstMotoId = motosAvaliacao[0].id;
                          const av = avaliacoes[firstMotoId];
                          if (av) {
                            const { data: freshAv } = await supabase.from('avaliacoes').select('valor_fechamento').eq('id', av.id).maybeSingle();
                            const avFechamento = freshAv?.valor_fechamento ?? av.valor_fechamento ?? null;
                            if (avFechamento) freshFechamento = avFechamento;
                          }
                        }
                        setValorPopup({ valorSinal: toInput(freshSinal), valorVenda: toInput(freshVenda), valorFechamento: toInput(freshFechamento), modo: btn.value as 'sinal' | 'vendido' });
                      } else if (btn.value === 'pendente' || btn.value === 'perdido') {
                        setMotivoPopup({ modo: btn.value as 'pendente' | 'perdido', motivo: '' });
                      } else {
                        handleStatusChange(btn.value, btn.label);
                      }
                    }}
                  >
                    {btn.icon}
                    <span className="hidden sm:inline">{btn.label}</span>
                  </Button>
                ))}
            </div>
           </div>
        </div>
      </ScrollArea>

      {/* Dialog de Fotos */}
      <Dialog open={!!photoMotoId} onOpenChange={async (o) => {
        if (!o && photoMotoId) {
          const { data } = await supabase.from('moto_fotos').select('id').eq('moto_avaliacao_id', photoMotoId);
          setPhotoCountMap(prev => ({ ...prev, [photoMotoId]: data?.length || 0 }));
          setPhotoMotoId(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Fotos da Moto
            </DialogTitle>
          </DialogHeader>
          {photoMotoId && <PhotoUpload motoAvaliacaoId={photoMotoId} />}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={async () => {
              if (photoMotoId) {
                const { data } = await supabase.from('moto_fotos').select('id').eq('moto_avaliacao_id', photoMotoId);
                setPhotoCountMap(prev => ({ ...prev, [photoMotoId]: data?.length || 0 }));
              }
              setPhotoMotoId(null);
            }}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Valores da Avaliação */}
      <Dialog open={!!viewAvaliacaoData} onOpenChange={(o) => !o && setViewAvaliacaoData(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="pb-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" /> Avaliação Comercial
            </DialogTitle>
            {viewAvaliacaoData?.avaliador_nome && (
              <p className="text-sm text-muted-foreground">
                Avaliado por <span className="font-medium text-foreground">{viewAvaliacaoData.avaliador_nome}</span>
              </p>
            )}
          </DialogHeader>
          {viewAvaliacaoData && (
            <div className="space-y-5 pt-2">
              {/* Consignação */}
              <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consignação</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-start">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Avaliação</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.avaliacao_consignacao)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Cliente</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_cliente)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Loja</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_loja)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-primary block mb-0.5 font-semibold">Repasse Cliente</span>
                    <p className="text-base font-bold text-primary">
                      {formatCurrency(
                        (viewAvaliacaoData.avaliacao_consignacao ?? 0) - (viewAvaliacaoData.previsao_custos_loja ?? 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Compra */}
              <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compra</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-start">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Avaliação</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.avaliacao_compra)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Cliente</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_cliente)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Loja</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_loja)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-primary block mb-0.5 font-semibold">Repasse Cliente</span>
                    <p className="text-base font-bold text-primary">
                      {formatCurrency(
                        (viewAvaliacaoData.avaliacao_compra ?? 0) - (viewAvaliacaoData.previsao_custos_loja ?? 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] font-medium text-muted-foreground text-center">REPASSE CLIENTE = AVALIAÇÃO − CUSTOS LOJA</p>

              {/* Observação */}
              {viewAvaliacaoData.observacao_avaliador && (
                <>
                  <Separator />
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Observação do Avaliador</h4>
                    <p className="text-sm leading-relaxed">{viewAvaliacaoData.observacao_avaliador}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Dialog de Valor (Sinal/Venda) */}
      <Dialog open={!!valorPopup} onOpenChange={(o) => !o && setValorPopup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="h-5 w-5" /> {valorPopup?.modo === 'vendido' ? 'Finalizar Venda' : 'Registrar Sinal'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {valorPopup?.modo === 'sinal' && (
              <div>
                <label className="text-sm font-medium text-foreground">Valor do Sinal (R$)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    className="pl-10"
                    placeholder="0,00"
                    value={valorPopup?.valorSinal || ''}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setValorPopup(prev => prev ? { ...prev, valorSinal: formatted } : null);
                    }}
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}
            {valorPopup?.modo === 'vendido' && (
              <>
                {atendimento.interesse === 'trocar' && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Valor de Fechamento da Moto do Cliente (R$)</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                      <Input
                        className="pl-10"
                        placeholder="0,00"
                        value={valorPopup?.valorFechamento || ''}
                        onChange={(e) => {
                          const formatted = formatCurrencyInput(e.target.value);
                          setValorPopup(prev => prev ? { ...prev, valorFechamento: formatted } : null);
                        }}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground">Valor da Venda (R$) <span className="text-destructive">*</span></label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      className="pl-10"
                      placeholder="0,00"
                      value={valorPopup?.valorVenda || ''}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value);
                        setValorPopup(prev => prev ? { ...prev, valorVenda: formatted } : null);
                      }}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </>
            )}
            <Button
              className="w-full"
              onClick={handleSaveValor}
              disabled={savingValor}
            >
              {savingValor ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog de Contrato */}
      <ContratoDialog
        open={contratoOpen}
        onOpenChange={setContratoOpen}
        atendimento={atendimento}
        motosInteresse={motosInteresse}
        motosAvaliacao={motosAvaliacao}
        estoqueData={estoqueData}
        avaliacoes={avaliacoes}
      />
      {/* Dialog de Motivo (Pendente/Perdido) */}
      <Dialog open={!!motivoPopup} onOpenChange={(o) => !o && setMotivoPopup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {motivoPopup?.modo === 'perdido' ? <XCircle className="h-5 w-5 text-destructive" /> : <Clock className="h-5 w-5 text-yellow-500" />}
              {motivoPopup?.modo === 'perdido' ? 'Marcar como Perdido' : 'Marcar como Pendente'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Motivo *</label>
              <Textarea
                className="mt-1 uppercase"
                placeholder="Informe o motivo..."
                value={motivoPopup?.motivo || ''}
                onChange={(e) => setMotivoPopup(prev => prev ? { ...prev, motivo: e.target.value.toUpperCase() } : null)}
                rows={3}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSaveMotivo}
              disabled={savingMotivo}
            >
              {savingMotivo ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showResultadoConsulta} onOpenChange={() => setShowResultadoConsulta(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Resultado da Consulta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{showResultadoConsulta}</p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Editar Cliente */}
      <Dialog open={editClienteOpen} onOpenChange={setEditClienteOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editar Dados do Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={editNome}
                onChange={e => {
                  const formatted = e.target.value
                    .toLowerCase()
                    .replace(/(?:^|\s)\S/g, match => match.toUpperCase());
                  setEditNome(formatted);
                }}
                placeholder="Nome Sobrenome"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input
                value={editTelefone}
                onChange={e => setEditTelefone(formatPhoneInput(e.target.value))}
                placeholder="(61) 90000-0000"
                maxLength={15}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo *</Label>
              <Select value={editSexo} onValueChange={setEditSexo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SEXOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>UF *</Label>
              <Select value={editUf} onValueChange={setEditUf}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input
                value={editCpfCnpj}
                onChange={e => setEditCpfCnpj(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="cliente@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço</Label>
              <Input
                value={editEndereco}
                onChange={e => setEditEndereco(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input
                value={editCep}
                onChange={e => setEditCep(e.target.value)}
                placeholder="00000-000"
              />
            </div>
            <Button onClick={handleSaveCliente} disabled={savingCliente} className="w-full gap-2">
              {savingCliente ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtendimentoDetail;