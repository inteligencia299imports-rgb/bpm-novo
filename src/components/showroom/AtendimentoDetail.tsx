import React, { useEffect, useState, useCallback } from 'react';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Edit, Phone, MapPin, Tag, User, Thermometer, Store, Calendar as CalendarIcon, Bike, FileText, Camera, Send, Sparkles, DollarSign, XCircle, Clock, Eye, Search, CheckCircle2, Loader2, Pencil, Truck, RotateCw, AlertTriangle } from 'lucide-react';
import WhatsAppIcon from '@/components/shared/WhatsAppIcon';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { normalizeChassi, normalizeRenavam, normalizePlaca, validateChassi, validateRenavam } from '@/lib/veiculoValidators';
import { processarCnhAnexada } from '@/lib/cnhAnexo';
import { removerCrlvDoStorage } from '@/lib/crlvAnexo';
import { fetchEstoqueUnificado, type EstoqueFonte } from '@/lib/estoqueMoto';
import { MARCA_MODELO_SELECT, flattenMarcaModeloList } from '@/lib/marcaModelo';
import { BPM_PROJETO_ID } from '@/lib/projeto';
import type { Atendimento, MotoInteresse, Avaliacao, SituacaoShowroom } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES, ANOS_MOTO, CORES_MOTO, CATEGORIAS_MOTO } from '@/types/crm';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { formatPersonName, firstLastName } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import PhotoUpload from './PhotoUpload';
import DocumentUpload from './DocumentUpload';
import ChassiRenavamFields from '@/components/shared/ChassiRenavamFields';
import PlacaInput from '@/components/shared/PlacaInput';
import { useAuth } from '@/contexts/AuthContext';
import StatusTimeline from '@/components/shared/StatusTimeline';
import AtendimentoObservacoes from './AtendimentoObservacoes';
import DetailSkeleton from '@/components/shared/DetailSkeleton';
import ContratoDialog from './ContratoDialog';
import ClienteEditDialog from '@/components/shared/ClienteEditDialog';

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
const formatCpfCnpj = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 14); if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); };
const formatCep = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? d.replace(/(\d{5})(\d)/, '$1-$2') : d; };
const enderecoResumo = (e?: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null }) => {
  if (!e) return undefined;
  const linha1 = [e.logradouro, e.numero].filter(Boolean).join(', ');
  const linha2 = [e.bairro, e.cidade].filter(Boolean).join(' - ');
  return [linha1, linha2].filter(Boolean).join(' | ') || undefined;
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
  const [motosAvaliacao, setMotosAvaliacao] = useState<Avaliacao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<string, any>>({});
  const [estoqueData, setEstoqueData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [photoMotoId, setPhotoMotoId] = useState<string | null>(null);
  const [viewAvaliacaoData, setViewAvaliacaoData] = useState<any>(null);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [cnhDocId, setCnhDocId] = useState<string | null>(null);
  const [, setClienteRefresh] = useState(0);
  const [crlvUrls, setCrlvUrls] = useState<Record<string, string | null>>({});
  const [atpvUrls, setAtpvUrls] = useState<Record<string, string | null>>({});
  const [procuracaoUrls, setProcuracaoUrls] = useState<Record<string, string | null>>({});
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const [valorPopup, setValorPopup] = useState<{ valorSinal: string; valorVenda: string; valorFechamento: string; modo: 'sinal' | 'vendido' } | null>(null);
  const [savingValor, setSavingValor] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [contratoOpen, setContratoOpen] = useState(false);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [entregaDate, setEntregaDate] = useState('');
  const [savingEntrega, setSavingEntrega] = useState(false);
  const [entregaDataConclusao, setEntregaDataConclusao] = useState<string | null>(null);
  const [motivoPopup, setMotivoPopup] = useState<{ modo: 'pendente' | 'perdido'; motivo: string } | null>(null);
  const [savingMotivo, setSavingMotivo] = useState(false);
  const [showResultadoConsulta, setShowResultadoConsulta] = useState<{ texto: string; motoId: string } | null>(null);
  const [solicitandoConsulta, setSolicitandoConsulta] = useState(false);
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [editClienteOpen, setEditClienteOpen] = useState(false);

  // Edicao de dados da moto avaliada
  const [editMotoId, setEditMotoId] = useState<string | null>(null);
  const [editMarcaId, setEditMarcaId] = useState('');
  const [editModeloId, setEditModeloId] = useState('');
  const [editPlaca, setEditPlaca] = useState('');
  const [editChassi, setEditChassi] = useState('');
  const [editRenavam, setEditRenavam] = useState('');
  const [editKm, setEditKm] = useState('');
  const [editAnoFab, setEditAnoFab] = useState('');
  const [editAnoMod, setEditAnoMod] = useState('');
  const [editCor, setEditCor] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [editCilindrada, setEditCilindrada] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');
  const [editTemManual, setEditTemManual] = useState(false);
  const [editTemChaveReserva, setEditTemChaveReserva] = useState(false);
  const [editManutencaoVencida, setEditManutencaoVencida] = useState(false);
  const [savingMotoEdit, setSavingMotoEdit] = useState(false);
  const { marcas: marcasCatalogo, getModelosByMarcaId } = useMarcasModelos();

  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);
  // Troca: enquanto a aquisição da moto do cliente não for aprovada no Pós-Compra,
  // contrato e entrega do lado da venda ficam bloqueados.
  const aguardandoAprovacaoAquisicao = Object.values(avaliacoes).some((av: any) => av?.aprovacao_status === 'aguardando');

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);

      supabase.from('clientes_fornecedores_documentos').select('id, arquivo_url').eq('cliente_fornecedor_id', atendimento.cliente_id).eq('tipo_documento', 'cnh').maybeSingle()
        .then(({ data }) => { setCnhUrl(data?.arquivo_url || null); setCnhDocId(data?.id || null); });

      // Fetch showroom history immediately (no dependency on motoIds)
      const showroomHistoryPromise = supabase
        .from('status_history')
        .select('*')
        .eq('entity_type', 'showroom')
        .eq('entity_id', atendimento.id)
        .order('created_at', { ascending: true });

      const [resInt, resAval, showroomRes] = await Promise.all([
        supabase.from('motos_interesse').select(`*, ${MARCA_MODELO_SELECT}`).eq('atendimento_id', atendimento.id),
        supabase.from('avaliacoes').select(`*, ${MARCA_MODELO_SELECT}`).eq('atendimento_id', atendimento.id),
        showroomHistoryPromise,
      ]);

      const motosInt = flattenMarcaModeloList(resInt.data) as unknown as MotoInteresse[];
      setMotosInteresse(motosInt);

      // motos_avaliacao foi fundida em avaliacoes: cada linha ja tem os
      // dados da moto e do processo juntos, com o mesmo id.
      const motosAv = flattenMarcaModeloList(resAval.data) as unknown as Avaliacao[];
      setMotosAvaliacao(motosAv);
      
      // Init document URLs from fetched data
      const crlvMap: Record<string, string | null> = {};
      const atpvMap: Record<string, string | null> = {};
      const procuracaoMap: Record<string, string | null> = {};
      for (const m of motosAv) {
        crlvMap[m.id] = (m as any).crlv_url || null;
        atpvMap[m.id] = (m as any).atpv_url || null;
        procuracaoMap[m.id] = (m as any).procuracao_url || null;
      }
      setCrlvUrls(crlvMap);
      setAtpvUrls(atpvMap);
      setProcuracaoUrls(procuracaoMap);

      // Store showroom history temporarily
      const showroomHistoryData = showroomRes.data || [];

      // Now fetch secondary data in parallel without blocking the UI
      const motoIds = motosAv.map(m => m.id);
      const estoqueRefs = motosInt
        .filter(m => m.origem === 'estoque' && m.estoque_moto_id)
        .map(m => ({ id: m.estoque_moto_id!, tipo: ((m as any).estoque_tipo === '0km' ? '0km' : 'seminova') as EstoqueFonte }));

      // Fetch all secondary data in parallel
      const estoquePromise = estoqueRefs.length > 0
        ? fetchEstoqueUnificado({ ids: estoqueRefs }).then(data => ({ data }))
        : Promise.resolve({ data: [] as any[] });

      const avaliadorIds = resAval.data
        ? [...new Set(resAval.data.map((av: any) => av.avaliador_id).filter(Boolean))]
        : [];
      const vendedorPromise = atendimento.vendedor_id
        ? (supabase as any).from('user_roles').select('nome').eq('user_id', atendimento.vendedor_id).eq('projeto_id', BPM_PROJETO_ID).maybeSingle().then(r => r)
        : Promise.resolve({ data: null as any });
      const allRoleIds = [...new Set([...avaliadorIds, atendimento.vendedor_id].filter(Boolean))];
      const avaliadorPromise = avaliadorIds.length > 0
        ? (supabase as any).from('user_roles').select('user_id, nome').in('user_id', avaliadorIds).eq('projeto_id', BPM_PROJETO_ID).then(r => r)
        : Promise.resolve({ data: null as any[] | null });

      const consultaPromise = motoIds.length > 0
        ? supabase.from('status_history').select('*').eq('entity_type', 'consulta').in('entity_id', motoIds).order('created_at', { ascending: true }).then(r => r)
        : Promise.resolve({ data: [] as any[] });
      const avaliacaoHistPromise = motoIds.length > 0
        ? supabase.from('status_history').select('*').eq('entity_type', 'avaliacao').in('entity_id', motoIds).order('created_at', { ascending: true }).then(r => r)
        : Promise.resolve({ data: [] as any[] });
      const fotosCountPromise = motoIds.length > 0
        ? supabase.from('moto_fotos').select('avaliacao_id').in('avaliacao_id', motoIds).then(r => r)
        : Promise.resolve({ data: [] as any[] });

      const [estoqueRes, rolesRes, consultaRes, avaliacaoRes, fotosCountRes, vendedorRes] = await Promise.all([
        estoquePromise, avaliadorPromise, consultaPromise, avaliacaoHistPromise, fotosCountPromise, vendedorPromise,
      ]);

      if (vendedorRes.data?.nome) setVendedorNome(firstLastName(vendedorRes.data.nome));

      // Update estoque
      if (estoqueRes.data) {
        const estoqueMap: Record<string, any> = {};
        for (const item of estoqueRes.data) {
          estoqueMap[(item as any).id] = item;
        }
        setEstoqueData(estoqueMap);
      }

      // Update photo counts
      if (fotosCountRes.data) {
        const countMap: Record<string, number> = {};
        for (const f of fotosCountRes.data) {
          countMap[f.avaliacao_id] = (countMap[f.avaliacao_id] || 0) + 1;
        }
        setPhotoCountMap(countMap);
      }

      // Map avaliacoes with avaliador names
      const avalMap: Record<string, any> = {};
      if (resAval.data) {
        let avaliadorNames: Record<string, string> = {};
        if (rolesRes.data) {
          for (const r of rolesRes.data) {
            avaliadorNames[r.user_id] = firstLastName(r.nome);
          }
        }
        for (const av of resAval.data) {
          avalMap[av.id] = { ...av, avaliador_nome: avaliadorNames[(av as any).avaliador_id] || null };
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

      // Fetch entrega data from pos_venda_processos
      if (atendimento.situacao === 'vendido') {
        const { data: entregaRow } = await supabase
          .from('pos_venda_processos')
          .select('data_conclusao')
          .eq('atendimento_id', atendimento.id)
          .eq('etapa', 'ENTREGA DA MOTO')
          .eq('concluida', true)
          .maybeSingle();
        setEntregaDataConclusao(entregaRow?.data_conclusao || null);
      }

      setLoading(false);
    };
    fetchRelated();
  }, [atendimento.id]);

  const InfoItem = ({ label, value, valueClassName }: { label: string; value: string | null | undefined; valueClassName?: string }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className={`text-sm font-semibold ${valueClassName || ''}`}>{value}</span>
      </div>
    ) : null
  );

  const whatsappUrl = (() => {
    const digits = (atendimento.cliente?.telefone || '').replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  const handleCnhUploaded = async (url: string) => {
    if (!atendimento.cliente_id) return;
    const prevUrl = cnhUrl;
    let docId = cnhDocId;
    if (docId) {
      await supabase.from('clientes_fornecedores_documentos').update({ arquivo_url: url }).eq('id', docId);
    } else {
      const { data } = await supabase.from('clientes_fornecedores_documentos')
        .insert({ cliente_fornecedor_id: atendimento.cliente_id, tipo_documento: 'cnh', arquivo_url: url })
        .select('id').single();
      docId = data?.id || null;
      setCnhDocId(docId);
    }
    setCnhUrl(url);

    const { aceita, resultado } = await processarCnhAnexada({
      clienteId: atendimento.cliente_id,
      url,
      bucketPath: `docs/${atendimento.cliente_id}/cnh`,
      rollback: async () => {
        if (docId && !prevUrl) {
          await supabase.from('clientes_fornecedores_documentos').delete().eq('id', docId);
          setCnhDocId(null);
        } else if (docId && prevUrl) {
          await supabase.from('clientes_fornecedores_documentos').update({ arquivo_url: prevUrl }).eq('id', docId);
        }
        setCnhUrl(prevUrl);
      },
    });
    if (aceita && resultado?.extraido && atendimento.cliente) {
      if (resultado.nome) (atendimento.cliente as any).nome_razao_social = resultado.nome;
      if (resultado.atualizou_cpf && resultado.cpf) (atendimento.cliente as any).cpf_cnpj = resultado.cpf;
      if (resultado.data_nascimento) (atendimento.cliente as any).data_nascimento = resultado.data_nascimento;
      setClienteRefresh((n) => n + 1);
    }
  };

  const handleCnhRemoved = async () => {
    if (cnhDocId) {
      await supabase.from('clientes_fornecedores_documentos').delete().eq('id', cnhDocId);
      setCnhDocId(null);
    }
    setCnhUrl(null);
  };

  const solicitarNovaConsultaMoto = async (motoId: string) => {
    setSolicitandoConsulta(true);
    const mt = motosAvaliacao.find((m) => m.id === motoId);
    await supabase.from('avaliacoes').update({
      consulta_solicitada: true,
      consulta_realizada: false,
      resultado_consulta: null,
    } as any).eq('id', motoId);
    const { data: inserted } = await supabase.from('status_history').insert({
      entity_type: 'consulta',
      entity_id: motoId,
      status: 'consulta_solicitada',
      changed_by: user?.id,
      changed_by_name: userName || user?.email || null,
    }).select().single();
    if (inserted) {
      setHistory(prev => [...prev, inserted].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    }
    setMotosAvaliacao(prev => prev.map(m => m.id === motoId ? { ...m, consulta_solicitada: true, consulta_realizada: false, resultado_consulta: null } as any : m));
    await supabase.rpc('notify_consulta', {
      _title: 'Consulta Solicitada',
      _message: `${atendimento?.cliente?.nome_razao_social} - ${mt?.marca} ${mt?.modelo}${mt?.placa ? ` (${mt.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
      _entity_id: motoId,
      _entity_type: 'consulta',
    });
    setSolicitandoConsulta(false);
    setShowResultadoConsulta(null);
    toast.success('Nova consulta solicitada!');
  };

  const openEditMoto = (moto: Avaliacao) => {
    setEditMotoId(moto.id);
    setEditMarcaId((moto as any).marca_id || '');
    setEditModeloId((moto as any).modelo_id || '');
    setEditPlaca(moto.placa || '');
    setEditChassi(moto.chassi || '');
    setEditRenavam(moto.renavam || '');
    setEditKm(moto.km ? (parseInt(moto.km.replace(/\D/g, ''), 10) || 0).toLocaleString('pt-BR') : '');
    setEditAnoFab(moto.ano_fabricacao || '');
    setEditAnoMod(moto.ano_modelo || '');
    setEditCor(moto.cor || '');
    setEditCategoria(moto.categoria || '');
    setEditCilindrada(moto.cilindrada ? (parseInt(moto.cilindrada.replace(/\D/g, ''), 10) || 0).toLocaleString('pt-BR') : '');
    setEditObservacoes(moto.observacoes || '');
    setEditTemManual((moto as any).tem_manual ?? false);
    setEditTemChaveReserva((moto as any).tem_chave_reserva ?? false);
    setEditManutencaoVencida((moto as any).manutencao_vencida ?? false);
  };

  const handleSaveMotoEdit = async () => {
    if (!editMotoId || !editMarcaId || !editModeloId) {
      toast.error('Marca e Modelo são obrigatórios');
      return;
    }
    // Placa fora do padrao nao bloqueia o salvamento -- e apenas um aviso
    // visual no campo (ver PlacaInput).
    const chassiCheck = validateChassi(editChassi);
    if (!chassiCheck.valid) {
      toast.error(chassiCheck.message || 'Chassi inválido');
      return;
    }
    const renavamCheck = validateRenavam(editRenavam);
    if (!renavamCheck.valid) {
      toast.error(renavamCheck.message || 'RENAVAM inválido');
      return;
    }
    setSavingMotoEdit(true);
    const updateData: any = {
      marca_id: editMarcaId,
      modelo_id: editModeloId,
      placa: normalizePlaca(editPlaca) || null,
      chassi: normalizeChassi(editChassi) || null,
      renavam: normalizeRenavam(editRenavam) || null,
      km: editKm.replace(/\D/g, '') || null,
      ano_fabricacao: editAnoFab.trim() || null,
      ano_modelo: editAnoMod.trim() || null,
      cor: editCor.trim() || null,
      categoria: editCategoria.trim() || null,
      cilindrada: editCilindrada.replace(/\D/g, '') || null,
      observacoes: editObservacoes.trim() || null,
      tem_manual: editTemManual,
      tem_chave_reserva: editTemChaveReserva,
      manutencao_vencida: editManutencaoVencida,
    };
    if (editMotoId && crlvUrls[editMotoId]) {
      // CRLV anexado: dados do documento são imutáveis.
      delete updateData.marca_id;
      delete updateData.modelo_id;
      delete updateData.ano_fabricacao;
      delete updateData.ano_modelo;
      delete updateData.placa;
      delete updateData.chassi;
      delete updateData.renavam;
    }
    const { error } = await supabase.from('avaliacoes').update(updateData).eq('id', editMotoId);
    setSavingMotoEdit(false);
    if (error) {
      toast.error('Erro ao salvar dados da moto');
      return;
    }
    const marcaNome = marcasCatalogo.find(x => x.id === editMarcaId)?.nome ?? '';
    const modeloNome = getModelosByMarcaId(editMarcaId).find(x => x.id === editModeloId)?.nome ?? '';
    setMotosAvaliacao(prev => prev.map(m => m.id === editMotoId ? { ...m, ...updateData, marca_id: editMarcaId, modelo_id: editModeloId, marca: marcaNome, modelo: modeloNome } : m));
    toast.success('Dados da moto atualizados!');
    setEditMotoId(null);
  };

  /** Retorna false quando o CRLV NÃO é da moto (o anexo deve ser desfeito). */
  const extrairDadosCrlv = async (avaliacaoId: string, url: string): Promise<boolean> => {
    const toastId = toast.loading('Conferindo o CRLV e extraindo os dados da moto…');
    try {
      const { data, error } = await supabase.functions.invoke('extrair-dados-crlv', {
        body: { avaliacao_id: avaliacaoId, url },
      });
      if (error || !data) {
        toast.warning('Não foi possível validar o CRLV automaticamente — confira os dados da moto manualmente.', { id: toastId });
        return true;
      }
      if (data.match === false) {
        toast.error(data.motivo || 'O CRLV não é da mesma moto. Anexo removido.', { id: toastId });
        return false;
      }
      if (!data.extraido) {
        console.warn('extrair-dados-crlv não extraiu:', data?.motivo || data);
        toast.warning('Não foi possível validar o CRLV automaticamente — confira os dados da moto manualmente.', { id: toastId });
        return true;
      }
      const campos: Record<string, string> = {};
      if (data.ano_fabricacao) campos.ano_fabricacao = data.ano_fabricacao;
      if (data.ano_modelo) campos.ano_modelo = data.ano_modelo;
      if (data.placa) campos.placa = data.placa;
      if (data.chassi) campos.chassi = data.chassi;
      if (data.renavam) campos.renavam = data.renavam;
      if (data.numero_crv) campos.numero_crv = data.numero_crv;
      if (Object.keys(campos).length > 0) {
        setMotosAvaliacao(prev => prev.map(m => m.id === avaliacaoId ? { ...m, ...campos } : m));
      }
      toast.success('CRLV conferido', { id: toastId });
      if (Array.isArray(data.divergencias) && data.divergencias.length) {
        toast.warning(`CRLV: ${data.divergencias.join('; ')}. Ajuste manualmente se necessário.`);
      }
      return true;
    } catch {
      toast.warning('Não foi possível validar o CRLV automaticamente — confira os dados da moto manualmente.', { id: toastId });
      return true;
    }
  };

  const handleStatusChange = async (value: SituacaoShowroom, label: string, extraData?: Record<string, any>, observacoes?: string) => {
    const updateData: any = { situacao: value, ...extraData };
    const { error } = await supabase.from('atendimentos_motos').update(updateData).eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      // Record in status_history (fire and forget for speed, await later)
      const historyPromise = supabase.from('status_history').insert({
        entity_type: 'showroom',
        entity_id: atendimento.id,
        status: value,
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
        observacoes: observacoes || null,
      }).then(r => r);

      toast.success(`Status alterado para ${label}`);

      // Sync: perdido no showroom → perdido nas avaliações + reverter estoque
      if (value === 'perdido') {
        const { data: avaliacoesData } = await supabase.from('avaliacoes').select('id, situacao').eq('atendimento_id', atendimento.id);

        const promises: PromiseLike<any>[] = [
          historyPromise,
          supabase.from('avaliacoes').update({ situacao: 'perdido' }).eq('atendimento_id', atendimento.id).then(r => r),
        ];

        // Record history for each avaliacao in parallel
        if (avaliacoesData) {
          for (const av of avaliacoesData) {
            promises.push(supabase.from('status_history').insert({
              entity_type: 'avaliacao',
              entity_id: av.id,
              status: 'perdido',
              changed_by: user?.id,
              changed_by_name: userName || user?.email || null,
              observacoes: observacoes || null,
            }).then(r => r));
          }
        }

        // Reverter moto de interesse no estoque para disponível
        for (const mi of motosInteresse) {
          if (mi.estoque_moto_id) {
            const tabela = (mi as any).estoque_tipo === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
            promises.push(supabase.from(tabela).update({
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
              promises.push(supabase.from('estoque_motos').delete().eq('avaliacao_id', av.id).then(r => r));
            }
          }
        }

        await Promise.all(promises);
      }
      // Sync: dispensada no showroom → dispensada nas avaliações
      else if (value === 'dispensada') {
        const { data: avaliacoesData } = await supabase.from('avaliacoes').select('id, situacao').eq('atendimento_id', atendimento.id);

        const promises: PromiseLike<any>[] = [
          historyPromise,
          supabase.from('avaliacoes').update({ situacao: 'dispensada' }).eq('atendimento_id', atendimento.id).then(r => r),
        ];

        if (avaliacoesData) {
          for (const av of avaliacoesData) {
            promises.push(supabase.from('status_history').insert({
              entity_type: 'avaliacao',
              entity_id: av.id,
              status: 'dispensada',
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
    if (valorPopup.modo === 'sinal' || valorPopup.modo === 'vendido') {
      let temCnh = !!cnhUrl;
      if (!temCnh) {
        const { data: cnhDoc } = await supabase
          .from('clientes_fornecedores_documentos')
          .select('id')
          .eq('cliente_fornecedor_id', atendimento.cliente_id)
          .eq('tipo_documento', 'cnh')
          .maybeSingle();
        temCnh = !!cnhDoc;
      }
      if (!temCnh) {
        toast.error('Anexe a CNH do cliente antes de registrar o sinal ou a venda.');
        return;
      }
    }

    setSavingValor(true);
    const updateData: any = {};
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
          const tabela = (mi as any).estoque_tipo === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
          console.log('[Estoque Update]', tabela, 'moto_id:', mi.estoque_moto_id, 'update:', estoqueUpdate);
          estoquePromises.push(
            supabase.from(tabela).update(estoqueUpdate).eq('id', mi.estoque_moto_id)
              .then(r => {
                if (r.error) {
                  console.error('[Estoque Update ERROR]', r.error);
                  toast.error(`Erro ao atualizar estoque: ${r.error.message}`);
                } else {
                  console.log('[Estoque Update OK] rows affected:', r.count);
                }
                return r;
              })
          );
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
              aprovacao_status: 'aguardando',
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

  const openEntrega = async () => {
    // Fetch current entrega step
    const { data: row } = await supabase
      .from('pos_venda_processos')
      .select('data_conclusao')
      .eq('atendimento_id', atendimento.id)
      .eq('etapa', 'ENTREGA DA MOTO')
      .maybeSingle();
    if (row?.data_conclusao) {
      const d = new Date(row.data_conclusao);
      setEntregaDate(d.toISOString().slice(0, 10));
    } else {
      setEntregaDate('');
    }
    setEntregaOpen(true);
  };

  const handleSaveEntrega = async () => {
    if (!entregaDate) {
      toast.error('Informe a data de entrega');
      return;
    }
    setSavingEntrega(true);
    const dataConclusao = `${entregaDate}T12:00:00`;

    // Check if the ENTREGA DA MOTO step already exists
    const { data: existing } = await supabase
      .from('pos_venda_processos')
      .select('id')
      .eq('atendimento_id', atendimento.id)
      .eq('etapa', 'ENTREGA DA MOTO')
      .maybeSingle();

    if (existing) {
      await supabase.from('pos_venda_processos').update({
        concluida: true,
        data_conclusao: dataConclusao,
      }).eq('id', existing.id);
    } else {
      await supabase.from('pos_venda_processos').insert({
        atendimento_id: atendimento.id,
        etapa: 'ENTREGA DA MOTO',
        concluida: true,
        data_conclusao: dataConclusao,
      });
    }

    setSavingEntrega(false);
    setEntregaDataConclusao(dataConclusao);
    toast.success('Data de entrega salva!');
    setEntregaOpen(false);
    if (onStatusUpdated) onStatusUpdated(); else onDeleted();
  };

  if (loading) {
    return <DetailSkeleton onClose={onClose} />;
  }

  // Contrato de venda abre como página (não como pop-up).
  if (contratoOpen) {
    return (
      <ContratoDialog
        open
        onOpenChange={setContratoOpen}
        atendimento={atendimento}
        motosInteresse={motosInteresse}
        motosAvaliacao={motosAvaliacao}
        estoqueData={estoqueData}
        avaliacoes={avaliacoes}
        onSaved={() => { if (onStatusUpdated) onStatusUpdated(); }}
      />
    );
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
              <h1 className="text-lg sm:text-xl font-bold truncate">{formatPersonName(atendimento.cliente?.nome_razao_social || '')}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {atendimento.situacao === 'pendente' && (() => {
              const lastPendente = [...history].reverse().find(h => h.entity_type === 'showroom' && h.status === 'pendente' && h.observacoes);
              return lastPendente ? (
                <p className="text-xs text-yellow-600 mt-0.5 italic">Motivo: {lastPendente.observacoes}</p>
              ) : null;
            })()}
          </div>
          {/* Desktop buttons */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {(atendimento.situacao === 'sinal' || atendimento.situacao === 'vendido') && !aguardandoAprovacaoAquisicao && (
              <Button size="sm" onClick={() => setContratoOpen(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Contrato
              </Button>
            )}
            {atendimento.situacao === 'vendido' && !aguardandoAprovacaoAquisicao && (
              <Button size="sm" variant="outline" onClick={openEntrega} className="gap-1.5">
                <Truck className="h-4 w-4" /> Entrega
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(atendimento.id)}>
              <Edit className="h-4 w-4" /> Editar
            </Button>
          </div>
        </div>
        {/* Mobile buttons - below name/date, centered, equal width */}
        <div className="flex sm:hidden gap-2 justify-center">
          {(atendimento.situacao === 'sinal' || atendimento.situacao === 'vendido') && !aguardandoAprovacaoAquisicao && (
            <Button size="sm" onClick={() => setContratoOpen(true)} className="flex-1">
              <FileText className="h-4 w-4" />
            </Button>
          )}
          {atendimento.situacao === 'vendido' && !aguardandoAprovacaoAquisicao && (
            <Button size="sm" variant="outline" onClick={openEntrega} className="flex-1">
              <Truck className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(atendimento.id)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {aguardandoAprovacaoAquisicao && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Aquisição da moto do cliente aguardando aprovação no Pós-Compra. Contrato e entrega ficam bloqueados até a aprovação.
          </p>
        </div>
      )}

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados do Cliente */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
                <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setEditClienteOpen(true)} title="Editar dados do cliente">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={atendimento.cliente ? formatPersonName(atendimento.cliente.nome_razao_social) : undefined} />
                <div>
                  <span className="text-xs text-muted-foreground">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{atendimento.cliente?.telefone ? formatPhone(atendimento.cliente.telefone) : '-'}</span>
                    <button
                      onClick={() => window.open(whatsappUrl, '_blank')}
                      className="text-green-600 hover:text-green-700 transition-colors"
                      title="Abrir WhatsApp"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <InfoItem label="Sexo" value={atendimento.cliente?.sexo} />
                <InfoItem label="UF" value={atendimento.cliente?.clientes_fornecedores_enderecos?.[0]?.uf} />
                <InfoItem label="CPF/CNPJ" value={atendimento.cliente?.cpf_cnpj ? formatCpfCnpj(atendimento.cliente.cpf_cnpj) : undefined} />
                <InfoItem label="E-mail" value={atendimento.cliente?.email} />
                <InfoItem label="Endereço" value={enderecoResumo(atendimento.cliente?.clientes_fornecedores_enderecos?.[0])} />
                <InfoItem label="CEP" value={atendimento.cliente?.clientes_fornecedores_enderecos?.[0]?.cep ? formatCep(atendimento.cliente.clientes_fornecedores_enderecos[0].cep!) : undefined} />
              </div>
              {atendimento.cliente_id && (
                <>
                  <Separator className="mt-auto" />
                  <DocumentUpload
                    label="CNH"
                    className="w-1/4"
                    currentUrl={cnhUrl}
                    bucketPath={`docs/${atendimento.cliente_id}/cnh`}
                    onUploaded={handleCnhUploaded}
                    onRemoved={handleCnhRemoved}
                    deferPreview
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Dados do Atendimento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Dados do Atendimento
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Vendedor" value={vendedorNome} valueClassName="text-primary" />
                <InfoItem label="Loja" value={atendimento.loja} />
                <InfoItem label="Tipo de Atendimento" value={atendimento.tipo_atendimento} />
                <InfoItem label="Interesse" value={int?.label} />
                <InfoItem label="Origem" value={atendimento.origem} />
                <InfoItem label="Temperatura" value={atendimento.temperatura} />
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
                          {!atendimento.loja?.toLowerCase().startsWith('ducati') && (
                            <Badge variant="outline" className={`text-xs ${
                              estItem.status === 'vendido' ? 'border-[#169d53] text-[#169d53]' :
                              estItem.status === 'sinal' ? 'border-[#b376c4] text-[#b376c4]' :
                              estItem.status === 'servico' ? 'border-orange-500 text-orange-600' :
                              estItem.status === 'indisponivel_manual' ? 'border-destructive text-destructive' :
                              estItem.status === 'bloqueio_juridico' ? 'border-muted-foreground text-muted-foreground' :
                              ''
                            }`}>
                              {estItem.status === 'vendido' ? 'Vendido' : estItem.status === 'sinal' ? 'Sinal' : estItem.status === 'servico' ? 'Serviço' : estItem.status === 'indisponivel_manual' ? 'Indisponível' : estItem.status === 'bloqueio_juridico' ? 'Bloqueio Jurídico' : 'Estoque'}
                            </Badge>
                          )}
                        </div>
                        {/* Estoque observation for special statuses */}
                        {estItem.observacoes && ['servico', 'indisponivel_manual', 'bloqueio_juridico'].includes(estItem.status) && (
                          <div className={`text-xs italic flex items-start gap-1.5 rounded p-2 ${
                            estItem.status === 'servico' ? 'text-orange-600 bg-orange-500/10' :
                            estItem.status === 'indisponivel_manual' ? 'text-destructive bg-destructive/10' :
                            'text-muted-foreground bg-muted'
                          }`}>
                            {estItem.observacoes}
                          </div>
                        )}
                        {atendimento.loja?.toLowerCase().startsWith('ducati') ? (
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
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTipoAquisicaoBadgeClass(estItem.tipo)}`}>
                              {getTipoAquisicaoLabel(estItem.tipo) || estItem.tipo}
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
                        <MaintenanceBadges
                          temManual={estItem.tem_manual}
                          temChaveReserva={estItem.tem_chave_reserva}
                          manutencaoVencida={estItem.manutencao_vencida}
                        />
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
                          {entregaDataConclusao && (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">Data de Entrega</p>
                                <p className="font-semibold text-foreground flex items-center gap-1.5">
                                  <Truck className="h-3.5 w-3.5" />
                                  {format(new Date(entregaDataConclusao), "dd/MM/yyyy")}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        {estItem.observacoes && (
                          <p className="text-xs text-muted-foreground italic">{estItem.observacoes}</p>
                        )}
                      </>
                    ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {!atendimento.loja?.toLowerCase().startsWith('ducati') && <InfoItem label="Origem" value="Externo" />}
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano" value={moto.ano} />
                      {atendimento.loja?.toLowerCase().startsWith('ducati') && moto.chassi && <InfoItem label="Chassi" value={moto.chassi} />}
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
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                    <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
                    {motosAvaliacao.some(m => (m as any).consulta_solicitada && !(m as any).consulta_realizada) && (
                      <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1">
                        <Clock className="h-3 w-3" /> Consulta Solicitada
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {motosAvaliacao.some(m => m.enviada_avaliacao && !isAvaliada(m.id)) && (
                      <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 gap-1">
                        <Clock className="h-3 w-3" /> Aguardando avaliação
                      </Badge>
                    )}
                    {motosAvaliacao.some(m => avaliacoes[m.id]?.situacao === 'adquirida' && avaliacoes[m.id]?.tipo_aquisicao) && (
                      <Badge variant="outline" className={`text-[10px] ${getTipoAquisicaoBadgeClass(motosAvaliacao.find(m => avaliacoes[m.id]?.situacao === 'adquirida')?.id ? avaliacoes[motosAvaliacao.find(m => avaliacoes[m.id]?.situacao === 'adquirida')!.id]?.tipo_aquisicao : null)}`}>
                        {getTipoAquisicaoLabel(motosAvaliacao.find(m => avaliacoes[m.id]?.situacao === 'adquirida')?.id ? avaliacoes[motosAvaliacao.find(m => avaliacoes[m.id]?.situacao === 'adquirida')!.id]?.tipo_aquisicao : null) || 'Própria'}
                      </Badge>
                    )}
                  </div>
                </div>
                <Separator className="mt-2" />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {motosAvaliacao.map((moto, idx) => (
                  <div key={moto.id} className="flex-1 flex flex-col gap-4">
                    {idx > 0 && <Separator />}
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid grid-cols-2 gap-4 flex-1">
                        <InfoItem label="Marca" value={moto.marca} />
                        <InfoItem label="Modelo" value={(moto.modelo || '').toUpperCase()} />
                        <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />
                        <InfoItem label="Ano Modelo" value={moto.ano_modelo} />
                        <InfoItem label="Categoria" value={moto.categoria} />
                        <InfoItem label="Cor" value={moto.cor} />
                        <InfoItem label="Placa" value={moto.placa?.replace(/-/g, '')} />
                        <InfoItem label="KM" value={formatKm(moto.km)} />
                        {(moto as any).chassi && <InfoItem label="Chassi" value={(moto as any).chassi} />}
                        {(moto as any).renavam && <InfoItem label="RENAVAM" value={(moto as any).renavam} />}
                        {moto.observacoes && (
                          <div className="col-span-2">
                            <InfoItem label="Observações" value={moto.observacoes} />
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEditMoto(moto)} title="Editar dados da moto">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <MaintenanceBadges
                      temManual={(moto as any).tem_manual}
                      temChaveReserva={(moto as any).tem_chave_reserva}
                      manutencaoVencida={(moto as any).manutencao_vencida}
                    />
                    <Separator className="mt-auto" />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className={`flex-1 gap-1.5 ${(photoCountMap[moto.id] || 0) > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setPhotoMotoId(moto.id)}>
                        <Camera className="h-4 w-4" /> {(photoCountMap[moto.id] || 0) > 0 ? `Fotos (${photoCountMap[moto.id]}) ✓` : 'Fotos'}
                      </Button>

                      {/* 3. Avaliada / Solicitar Avaliação */}
                      {!moto.enviada_avaliacao ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={async () => {
                            const { error: avError } = await supabase
                              .from('avaliacoes')
                              .update({ enviada_avaliacao: true })
                              .eq('id', moto.id);
                            if (avError) {
                              toast.error('Erro ao enviar para avaliação');
                              console.error(avError);
                              return;
                            }
                            // Registrar no histórico
                            const historyEntry = {
                              entity_type: 'avaliacao',
                              entity_id: moto.id,
                              status: 'avaliacao_solicitada',
                              changed_by: user?.id,
                              changed_by_name: userName || user?.email || null,
                            };
                            const { data: insertedHistory } = await supabase.from('status_history').insert(historyEntry as any).select().single();
                            if (insertedHistory) {
                              setHistory(prev => [...prev, insertedHistory].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                            }
                            // Notificar avaliadores
                            await supabase.rpc('notify_role', {
                              _role: 'gerente' as any,
                              _title: 'Avaliação Solicitada',
                              _message: `Nova avaliação solicitada: ${moto.marca} ${moto.modelo} ${moto.placa ? `(${moto.placa})` : ''} - Cliente: ${atendimento.cliente?.nome_razao_social} | Por: ${userName || user?.email || 'Usuário'}`,
                              _entity_id: atendimento.id,
                              _entity_type: 'avaliacao',
                            });
                            toast.success('Enviado para avaliação!');
                            setMotosAvaliacao(prev => prev.map(m => m.id === moto.id ? { ...m, enviada_avaliacao: true } : m));
                          }}
                        >
                          <Send className="h-4 w-4" /> Avaliação
                        </Button>
                      ) : isAvaliada(moto.id) ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-green-500 text-green-600 hover:bg-green-50"
                            onClick={() => setViewAvaliacaoData(avaliacoes[moto.id])}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Avaliada ✓
                          </Button>
                        </>
                      ) : null}

                      {/* 4. Consulta Realizada (abre resultado + "Nova Consulta" dentro) */}
                      {(moto as any).consulta_realizada && (() => {
                        const atencao = String((moto as any).resultado_consulta || '').includes('⚠️');
                        return (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`flex-1 gap-1.5 ${atencao
                            ? 'border-amber-500 text-amber-600 hover:bg-amber-50'
                            : 'border-green-500 text-green-600 hover:bg-green-50'}`}
                          onClick={() => setShowResultadoConsulta({ texto: (moto as any).resultado_consulta || 'Nenhum resultado registrado.', motoId: moto.id })}
                        >
                          {atencao ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Consulta{atencao ? '' : ' ✓'}
                        </Button>
                        );
                      })()}
                      {cnhUrl && crlvUrls[moto.id] && isAvaliada(moto.id) && !(moto as any).consulta_solicitada && !(moto as any).consulta_realizada && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          disabled={solicitandoConsulta}
                          onClick={() => solicitarNovaConsultaMoto(moto.id)}
                        >
                          <Search className="h-4 w-4" /> Consultar
                        </Button>
                      )}

                      <DocumentUpload
                        label="CRLV"
                        className="flex-1"
                        currentUrl={crlvUrls[moto.id] || null}
                        bucketPath={`docs/${moto.id}/crlv`}
                        deferPreview
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ crlv_url: url } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: url }));
                          const ok = await extrairDadosCrlv(moto.id, url);
                          if (!ok) {
                            await supabase.from('avaliacoes').update({ crlv_url: null } as any).eq('id', moto.id);
                            setCrlvUrls(prev => ({ ...prev, [moto.id]: null }));
                            await removerCrlvDoStorage(moto.id);
                          }
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ crlv_url: null } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: null }));
                        }}
                      />
                      <DocumentUpload
                        label="ATPV"
                        className="flex-1"
                        currentUrl={atpvUrls[moto.id] || null}
                        bucketPath={`docs/${moto.id}/atpv`}
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ atpv_url: url } as any).eq('id', moto.id);
                          setAtpvUrls(prev => ({ ...prev, [moto.id]: url }));
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ atpv_url: null } as any).eq('id', moto.id);
                          setAtpvUrls(prev => ({ ...prev, [moto.id]: null }));
                        }}
                      />
                      <DocumentUpload
                        label="Procuração"
                        className="flex-1"
                        currentUrl={procuracaoUrls[moto.id] || null}
                        bucketPath={`docs/${moto.id}/procuracao`}
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ procuracao_url: url } as any).eq('id', moto.id);
                          setProcuracaoUrls(prev => ({ ...prev, [moto.id]: url }));
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ procuracao_url: null } as any).eq('id', moto.id);
                          setProcuracaoUrls(prev => ({ ...prev, [moto.id]: null }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          <AtendimentoObservacoes idOperacao={atendimento.id} />

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
                { value: 'sinal' as SituacaoShowroom, label: 'Sinal', icon: <Sparkles className="h-4 w-4" />, color: '#b376c4' },
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
                  const isDucati = atendimento.loja?.toLowerCase().startsWith('ducati');
                  if ((b.value === 'sinal' || b.value === 'vendido') && !isDucati && !motosInteresse.some(m => m.origem === 'estoque')) {
                    return false;
                  }
                  // Hide sinal/vendido if the estoque moto is already sold or reserved by another atendimento
                  if ((b.value === 'sinal' || b.value === 'vendido')) {
                    const motoEst = motosInteresse.find(m => m.origem === 'estoque' && m.estoque_moto_id);
                    if (motoEst) {
                      const est = estoqueData[motoEst.estoque_moto_id!];
                      if (est && (est.status === 'vendido' || est.status === 'servico' || est.status === 'indisponivel_manual' || est.status === 'bloqueio_juridico' || (est.status === 'sinal' && est.atendimento_venda_id && est.atendimento_venda_id !== atendimento.id))) {
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
                        // CNH do cliente é obrigatória para registrar sinal ou venda de moto
                        if (!cnhUrl) {
                          toast.error('Anexe a CNH do cliente antes de registrar o sinal ou a venda.');
                          return;
                        }
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

                          const allCrlvs = motosAvaliacao.length > 0 && motosAvaliacao.every(m => crlvUrls[m.id]);
                          if (!allCrlvs) faltando.push('CRLV da moto');

                          const allMotosAvaliadas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => isAvaliada(m.id));
                          if (!allMotosAvaliadas) faltando.push('Avaliação da moto ter sido feita');

                          const allConsultas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => (m as any).consulta_realizada);
                          if (!allConsultas) faltando.push('Consulta documentacional realizada');

                          if (faltando.length > 0) {
                            toast.error('Para finalizar como Vendido, certifique-se de que o CRLV da moto foi enviado e de que a avaliação e a consulta de documentação já foram concluídas.');
                            return;
                          }
                        }
                        const toInput = (v: number | null | undefined) => v ? formatCurrencyInput(Math.round(v * 100).toString()) : '';
                        // Fetch latest values from DB to avoid stale data after contract save
                        const _miEst = motosInteresse.find(m => m.origem === 'estoque' && m.estoque_moto_id);
                        const _estTabela = (_miEst as any)?.estoque_tipo === '0km' ? 'estoque_motos_novas' : 'estoque_motos';
                        const [{ data: freshEstoque }, { data: freshContrato }] = await Promise.all([
                          supabase.from(_estTabela).select('valor_sinal, valor_venda').eq('atendimento_venda_id', atendimento.id).maybeSingle(),
                          supabase.from('contratos').select('valor_fechamento').eq('atendimento_id', atendimento.id).maybeSingle(),
                        ]);
                        const freshSinal = freshEstoque?.valor_sinal ?? atendimento.valor_sinal;
                        const freshVenda = freshEstoque?.valor_venda ?? atendimento.valor_venda;
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
          const { data } = await supabase.from('moto_fotos').select('id').eq('avaliacao_id', photoMotoId);
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
          {photoMotoId && <PhotoUpload avaliacaoId={photoMotoId} />}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={async () => {
              if (photoMotoId) {
                const { data } = await supabase.from('moto_fotos').select('id').eq('avaliacao_id', photoMotoId);
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

              {viewAvaliacaoData.observacao_avaliador && (
                <div className="rounded-lg border bg-muted/30 p-5 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Observação do Avaliador</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{viewAvaliacaoData.observacao_avaliador}</p>
                </div>
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
              <Search className="h-5 w-5 text-primary" /> Resultado da Consulta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm whitespace-pre-wrap">{showResultadoConsulta?.texto}</p>
            </div>
            <Separator className="mt-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 w-full"
              disabled={solicitandoConsulta}
              onClick={() => showResultadoConsulta && solicitarNovaConsultaMoto(showResultadoConsulta.motoId)}
            >
              <RotateCw className="h-4 w-4" /> Nova Consulta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Editar Cliente */}
      <ClienteEditDialog
        clienteId={atendimento.cliente_id}
        open={editClienteOpen}
        onOpenChange={setEditClienteOpen}
        onSaved={() => { if (onStatusUpdated) onStatusUpdated(); else onDeleted(); }}
      />
      {/* Dialog Editar Dados da Moto */}
      <Dialog open={!!editMotoId} onOpenChange={(o) => !o && setEditMotoId(null)}>
        <DialogContent className="max-w-xl max-h-[85dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Editar Dados da Moto</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 pr-7" style={{ scrollbarWidth: 'thin' }}>
            <div className="space-y-3 pb-4">
              {!!(editMotoId && crlvUrls[editMotoId]) && (
                <p className="text-xs text-muted-foreground">
                  Marca, modelo, anos, placa, chassi e RENAVAM vêm do CRLV anexado e não podem ser alterados aqui.
                </p>
              )}
              <div>
                <Label>Marca <span className="text-destructive">*</span></Label>
                <Select value={editMarcaId} onValueChange={(v) => { setEditMarcaId(v); setEditModeloId(''); }} disabled={!!(editMotoId && crlvUrls[editMotoId])}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{marcasCatalogo.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modelo <span className="text-destructive">*</span></Label>
                <Select value={editModeloId} onValueChange={setEditModeloId} disabled={!!(editMotoId && crlvUrls[editMotoId]) || !editMarcaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{getModelosByMarcaId(editMarcaId).map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Placa</Label>
                  <PlacaInput value={editPlaca} onChange={setEditPlaca} disabled={!!(editMotoId && crlvUrls[editMotoId])} />
                </div>
                <div>
                  <Label>KM</Label>
                  <Input value={editKm} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setEditKm(d ? parseInt(d, 10).toLocaleString('pt-BR') : ''); }} placeholder="0" inputMode="numeric" />
                </div>
              </div>
              <ChassiRenavamFields
                chassi={editChassi}
                renavam={editRenavam}
                onChassiChange={setEditChassi}
                onRenavamChange={setEditRenavam}
                disabled={!!(editMotoId && crlvUrls[editMotoId])}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ano Fab.</Label>
                  <Select value={editAnoFab} onValueChange={setEditAnoFab} disabled={!!(editMotoId && crlvUrls[editMotoId])}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ano Mod.</Label>
                  <Select value={editAnoMod} onValueChange={setEditAnoMod} disabled={!!(editMotoId && crlvUrls[editMotoId])}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cor</Label>
                  <Select value={editCor} onValueChange={setEditCor}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CORES_MOTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cilindrada</Label>
                  <Input value={editCilindrada} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setEditCilindrada(d ? parseInt(d, 10).toLocaleString('pt-BR') : ''); }} placeholder="0" inputMode="numeric" />
                </div>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={editCategoria} onValueChange={setEditCategoria}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{CATEGORIAS_MOTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label>Manual</Label>
                  <RadioGroup value={editTemManual ? 'sim' : 'nao'} onValueChange={(v) => setEditTemManual(v === 'sim')} className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="sim" id="atd-edit-manual-sim" />
                      <Label htmlFor="atd-edit-manual-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="atd-edit-manual-nao" />
                      <Label htmlFor="atd-edit-manual-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label>Chave Reserva</Label>
                  <RadioGroup value={editTemChaveReserva ? 'sim' : 'nao'} onValueChange={(v) => setEditTemChaveReserva(v === 'sim')} className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="sim" id="atd-edit-chave-sim" />
                      <Label htmlFor="atd-edit-chave-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="atd-edit-chave-nao" />
                      <Label htmlFor="atd-edit-chave-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label>Revisão Vencida</Label>
                  <RadioGroup value={editManutencaoVencida ? 'sim' : 'nao'} onValueChange={(v) => setEditManutencaoVencida(v === 'sim')} className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="sim" id="atd-edit-manut-sim" />
                      <Label htmlFor="atd-edit-manut-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="atd-edit-manut-nao" />
                      <Label htmlFor="atd-edit-manut-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              <div className="space-y-1.5 pt-3">
                <Label>Observações</Label>
                <Textarea
                  value={editObservacoes}
                  onChange={e => setEditObservacoes(e.target.value.toUpperCase())}
                  placeholder="Observações sobre a moto..."
                  rows={3}
                  className="uppercase"
                />
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t bg-background px-6 py-4">
            <Button onClick={handleSaveMotoEdit} disabled={savingMotoEdit} className="w-full gap-2">
              {savingMotoEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Data de Entrega */}
      <Dialog open={entregaOpen} onOpenChange={setEntregaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Data de Entrega
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full rounded-full h-10 px-4 justify-start text-left font-normal',
                      !entregaDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entregaDate
                      ? format(new Date(`${entregaDate}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })
                      : 'Selecionar data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entregaDate ? new Date(`${entregaDate}T12:00:00`) : undefined}
                    onSelect={(d) => {
                      if (!d) { setEntregaDate(''); return; }
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      setEntregaDate(`${y}-${m}-${day}`);
                    }}
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleSaveEntrega} disabled={savingEntrega} className="w-full gap-2">
              {savingEntrega ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtendimentoDetail;