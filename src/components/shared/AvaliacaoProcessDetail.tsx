import React, { useState, useEffect } from 'react';
import { isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Bike, MessageCircle, FileText, ClipboardList, DollarSign, AlertTriangle, ShieldAlert, IdCard, Pencil, Loader2, CheckCircle2, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { SEXOS, UFS, ANOS_MOTO, CORES_MOTO, CATEGORIAS_MOTO } from '@/types/crm';
import type { MotoFoto } from '@/types/crm';
import DocumentUpload from '@/components/showroom/DocumentUpload';
import ClienteEditDialog from '@/components/shared/ClienteEditDialog';
import ChassiRenavamFields from '@/components/shared/ChassiRenavamFields';
import PlacaInput from '@/components/shared/PlacaInput';
import { normalizeChassi, normalizeRenavam, normalizePlaca, validateChassi, validateRenavam } from '@/lib/veiculoValidators';
import { formatPersonName } from '@/lib/utils';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


import DetailSkeleton from '@/components/shared/DetailSkeleton';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';
import ContratoConsignacaoDialog from '@/components/consignacao/ContratoConsignacaoDialog';
import ConsignacaoProcessoDialog from '@/components/consignacao/ConsignacaoProcessoDialog';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';
import PosCompraProcessoDialog from '@/components/pos-compra/PosCompraProcessoDialog';
import PosCompraFinanceiroDialog from '@/components/pos-compra/PosCompraFinanceiroDialog';

interface Props {
  item: any;
  entityType: string;
  statusColumns: { value: string; label: string; hex: string }[];
  statusField: string;
  title: string;
  onClose: () => void;
}

const formatPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : v; };
const formatCpfCnpj = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 14); if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); };
const formatCep = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? d.replace(/(\d{5})(\d)/, '$1-$2') : d; };
const formatKm = (km: string | null | undefined) => { if (!km) return null; const n = parseInt(km.replace(/\D/g,''),10); return isNaN(n) ? km : n.toLocaleString('pt-BR') + ' km'; };
const formatCurrency = (v: number | null | undefined) => v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <p className="text-sm font-medium">{value || '-'}</p>
  </div>
);

const AvaliacaoProcessDetail: React.FC<Props> = ({ item, entityType, statusColumns, statusField, title, onClose }) => {
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(null);
  const [atpvUrl, setAtpvUrl] = useState<string | null>(null);
  const [procuracaoUrl, setProcuracaoUrl] = useState<string | null>(null);
  const [quantoPede, setQuantoPede] = useState<number | null>(null);
  const [valorFechamento, setValorFechamento] = useState<number | null>(null);
  const [contratoConsignacaoOpen, setContratoConsignacaoOpen] = useState(false);
  const [processoConsignacaoOpen, setProcessoConsignacaoOpen] = useState(false);
  const [processoPreparacaoOpen, setProcessoPreparacaoOpen] = useState(false);
  const [processoPosCompraOpen, setProcessoPosCompraOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [currentPreparacaoStatus, setCurrentPreparacaoStatus] = useState(item.preparacao_status || 'em_aberto');
  const [currentPosCompraStatus, setCurrentPosCompraStatus] = useState(item.pos_compra_status || 'em_aberto');
  const [currentConsignacaoStatus, setCurrentConsignacaoStatus] = useState(item.consignacao_status || 'em_aberto');
  const [loading, setLoading] = useState(true);
  const [estoqueStatus, setEstoqueStatus] = useState<{ status: string; observacoes: string | null } | null>(null);
  const [dataAquisicao, setDataAquisicao] = useState<string | null>(null);
  const [avaliadorNome, setAvaliadorNome] = useState<string | null>(null);
  const [pendingSteps, setPendingSteps] = useState<string[]>([]);
  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [showPhotosDialog, setShowPhotosDialog] = useState(false);

  // Moto edit state
  const [editMotoOpen, setEditMotoOpen] = useState(false);
  const [editMarca, setEditMarca] = useState('');
  const [editModelo, setEditModelo] = useState('');
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
  const [savingMoto, setSavingMoto] = useState(false);

  const { getMarcaNomes, getModelosPorMarca } = useMarcasModelos();

  const [motoData, setMotoData] = useState(item);
  const moto = motoData;
  const atendimento = item.atendimento || item.atendimentos;
  const statusValue = item[statusField] || 'em_aberto';
  const statusCol = statusColumns.find(c => c.value === statusValue);
  const whatsappUrl = atendimento?.cliente?.telefone ? `https://wa.me/55${atendimento.cliente.telefone.replace(/\D/g, '')}` : '';

  const openEditCliente = () => {
    if (!atendimento) return;
    setEditClienteOpen(true);
  };


  const openEditMoto = () => {
    if (!moto) return;
    setEditMarca(moto.marca || '');
    setEditModelo(moto.modelo || '');
    setEditPlaca(moto.placa || '');
    setEditChassi(moto.chassi || '');
    setEditRenavam(moto.renavam || '');
    setEditKm(moto.km ? (parseInt(moto.km.replace(/\D/g,''),10) || 0).toLocaleString('pt-BR') : '');
    setEditAnoFab(moto.ano_fabricacao || '');
    setEditAnoMod(moto.ano_modelo || '');
    setEditCor(moto.cor || '');
    setEditCategoria(moto.categoria || '');
    setEditCilindrada(moto.cilindrada ? (parseInt(moto.cilindrada.replace(/\D/g,''),10) || 0).toLocaleString('pt-BR') : '');
    setEditObservacoes(moto.observacoes || '');
    setEditTemManual(moto.tem_manual ?? false);
    setEditTemChaveReserva(moto.tem_chave_reserva ?? false);
    setEditManutencaoVencida(moto.manutencao_vencida ?? false);
    setEditMotoOpen(true);
  };

  const handleSaveMoto = async () => {
    if (!editMarca.trim() || !editModelo.trim()) {
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
    const placaVal = normalizePlaca(editPlaca) || null;
    const chassiVal = normalizeChassi(editChassi) || null;
    const renavamVal = normalizeRenavam(editRenavam) || null;
    setSavingMoto(true);
    const { error } = await supabase.from('avaliacoes').update({
      marca: editMarca.trim(),
      modelo: editModelo.trim(),
      placa: placaVal,
      chassi: chassiVal,
      renavam: renavamVal,
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
    }).eq('id', moto.id);
    setSavingMoto(false);
    if (error) {
      toast.error('Erro ao salvar dados da moto');
      console.error(error);
    } else {
      setMotoData({
        ...moto,
        marca: editMarca.trim(),
        modelo: editModelo.trim(),
        placa: placaVal,
        chassi: chassiVal,
        renavam: renavamVal,
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
      });
      toast.success('Dados da moto atualizados!');
      setEditMotoOpen(false);
    }
  };

  const extrairDadosCrlv = async (url: string) => {
    if (!moto.id) return;
    const toastId = toast.loading('Conferindo o CRLV e extraindo os dados da moto…');
    try {
      const { data, error } = await supabase.functions.invoke('extrair-dados-crlv', {
        body: { avaliacao_id: moto.id, url },
      });
      if (error || !data) {
        toast.dismiss(toastId);
        return;
      }
      if (data.match === false) {
        toast.error(data.motivo || 'O documento CRLV não é da mesma moto.', { id: toastId });
        return;
      }
      if (!data.extraido) {
        console.warn('extrair-dados-crlv não extraiu:', data?.motivo || data);
        toast.dismiss(toastId);
        return;
      }
      const campos: Record<string, string> = {};
      if (data.ano_fabricacao) campos.ano_fabricacao = data.ano_fabricacao;
      if (data.ano_modelo) campos.ano_modelo = data.ano_modelo;
      if (data.placa) campos.placa = data.placa;
      if (data.chassi) campos.chassi = data.chassi;
      if (data.renavam) campos.renavam = data.renavam;
      if (data.numero_crv) campos.numero_crv = data.numero_crv;
      if (Object.keys(campos).length === 0) {
        toast.dismiss(toastId);
        return;
      }
      setMotoData((prev: any) => ({ ...prev, ...campos }));
      toast.success('Dados do CRLV extraídos e conferidos', { id: toastId });
    } catch {
      // extracao e best-effort -- falha aqui nunca deve incomodar o usuario
      toast.dismiss(toastId);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes, avRes, estRes, histRes, fotosRes] = await Promise.all([
        atendimento?.cliente_id
          ? supabase.from('clientes_fornecedores_documentos').select('arquivo_url').eq('cliente_fornecedor_id', atendimento.cliente_id).eq('tipo_documento', 'cnh').maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('avaliacoes').select('quanto_pede, valor_fechamento, avaliador_id, crlv_url, atpv_url, procuracao_url').eq('id', item.id).maybeSingle(),
        supabase.from('estoque_motos').select('status, observacoes').eq('avaliacao_id', item.id).maybeSingle(),
        supabase.from('status_history').select('created_at').eq('entity_type', 'avaliacao').eq('entity_id', item.id).eq('status', 'adquirida').order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('moto_fotos').select('*').eq('avaliacao_id', item.id),
      ]);
      setCnhUrl((cnhRes.data as any)?.arquivo_url || null);
      setCrlvUrl((avRes.data as any)?.crlv_url || null);
      setAtpvUrl((avRes.data as any)?.atpv_url || null);
      setProcuracaoUrl((avRes.data as any)?.procuracao_url || null);
      setQuantoPede(avRes.data?.quanto_pede ?? null);
      if (fotosRes.data) setFotos(fotosRes.data);
      setValorFechamento(avRes.data?.valor_fechamento ?? null);
      setEstoqueStatus(estRes.data ? { status: estRes.data.status, observacoes: estRes.data.observacoes } : null);
      setDataAquisicao(histRes.data?.created_at || null);

      if (avRes.data?.avaliador_id) {
        const { data: roleData } = await (supabase as any).from('user_roles').select('nome').eq('user_id', avRes.data.avaliador_id).single();
        if (roleData?.nome) setAvaliadorNome(roleData.nome);
      }

      // Fetch pending release steps for preparacao
      if (entityType === 'preparacao') {
        const tipo = item.tipo_aquisicao;
        const pending: string[] = [];
        if (isTipoPropria(tipo)) {
          const { data: pcSteps } = await supabase.from('pos_compra_processos')
            .select('etapa, concluida')
            .eq('avaliacao_id', item.id)
            .in('etapa', ['NF EMITIDA', 'VISTORIA/CADEIA DOMINIAL']);
          const nf = pcSteps?.find(p => p.etapa === 'NF EMITIDA');
          const vistoria = pcSteps?.find(p => p.etapa === 'VISTORIA/CADEIA DOMINIAL');
          if (!nf?.concluida) pending.push('NF Emitida (Pós-Compra)');
          if (!vistoria?.concluida) pending.push('Vistoria/Cadeia Dominial (Pós-Compra)');
        } else if (isTipoConsignada(tipo)) {
          const { data: consigSteps } = await supabase.from('consignacao_processos')
            .select('etapa, concluida')
            .eq('avaliacao_id', item.id)
            .eq('etapa', 'NF EMITIDA');
          const nf = consigSteps?.find(p => p.etapa === 'NF EMITIDA');
          if (!nf?.concluida) pending.push('NF Emitida (Consignação)');
        }
        setPendingSteps(pending);
      }

      setLoading(false);
    };
    loadAll();
  }, [atendimento?.id, moto?.id, item.id, entityType]);

  if (loading) {
    return <DetailSkeleton onClose={onClose} cards={3} />;
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
              <h1 className="text-lg sm:text-xl font-bold truncate uppercase">
                {moto ? `${moto.marca} ${moto.modelo}` : atendimento?.cliente?.nome_razao_social || 'N/A'}
              </h1>
              {statusCol && (
                <Badge className="text-[10px] shrink-0" style={{ backgroundColor: `${statusCol.hex}20`, color: statusCol.hex }}>
                  {statusCol.label}
                </Badge>
              )}
              {entityType === 'pos_compra' && atendimento?.interesse === 'trocar' && (
                <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary">
                  Troca
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {moto?.placa && <span className="mr-2">{moto.placa.replace(/-/g, '')}</span>}
              {format(new Date(dataAquisicao || item.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          {entityType === 'consignacao' && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setProcessoConsignacaoOpen(true)} className="gap-1.5">
                <ClipboardList className="h-4 w-4" /> Processo
              </Button>
            </div>
          )}
          {entityType === 'preparacao' && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setProcessoPreparacaoOpen(true)} className="gap-1.5">
                <ClipboardList className="h-4 w-4" /> Processo
              </Button>
            </div>
          )}
          {entityType === 'pos_compra' && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setFinanceiroOpen(true)} className="gap-1.5">
                <DollarSign className="h-4 w-4" /> Financeiro
              </Button>
              <Button size="sm" onClick={() => setProcessoPosCompraOpen(true)} className="gap-1.5">
                <ClipboardList className="h-4 w-4" /> Processo
              </Button>
            </div>
          )}
        </div>
        {entityType === 'consignacao' && (
          <div className="flex sm:hidden gap-2 justify-center">
            <Button size="sm" onClick={() => setProcessoConsignacaoOpen(true)} className="flex-1 gap-1.5">
              <ClipboardList className="h-4 w-4" /> Processo
            </Button>
          </div>
        )}
        {entityType === 'preparacao' && (
          <div className="flex sm:hidden gap-2 justify-center">
            <Button size="sm" onClick={() => setProcessoPreparacaoOpen(true)} className="flex-1 gap-1.5">
              <ClipboardList className="h-4 w-4" /> Processo
            </Button>
          </div>
        )}
        {entityType === 'pos_compra' && (
          <div className="flex sm:hidden gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={() => setFinanceiroOpen(true)} className="flex-1 gap-1.5">
              <DollarSign className="h-4 w-4" /> Financeiro
            </Button>
            <Button size="sm" onClick={() => setProcessoPosCompraOpen(true)} className="flex-1 gap-1.5">
              <ClipboardList className="h-4 w-4" /> Processo
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Pending release steps for preparacao */}
      {entityType === 'preparacao' && pendingSteps.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Pendências para liberação ao estoque</p>
            {pendingSteps.map(step => (
              <p key={step} className="text-xs text-orange-600 dark:text-orange-400">• {step}</p>
            ))}
          </div>
        </div>
      )}
      {entityType === 'preparacao' && pendingSteps.length === 0 && item.situacao !== 'estoque' && (
        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">Todos os processos concluídos</p>
        </div>
      )}

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={openEditCliente} title="Editar dados do cliente">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={formatPersonName(atendimento?.cliente?.nome_razao_social || '')} />
                {atendimento?.cliente?.telefone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Telefone</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{formatPhone(atendimento.cliente.telefone)}</span>
                      {whatsappUrl && (
                        <button onClick={() => window.open(whatsappUrl, '_blank')} className="text-green-600 hover:text-green-700 transition-colors" title="Abrir WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <InfoItem label="Loja" value={atendimento?.loja} />
                {atendimento?.cliente?.cpf_cnpj && <InfoItem label="CPF/CNPJ" value={formatCpfCnpj(atendimento.cliente.cpf_cnpj)} />}
                {atendimento?.cliente?.email && <InfoItem label="E-mail" value={atendimento.cliente.email} />}
                {atendimento?.cliente?.clientes_fornecedores_enderecos?.[0]?.cep && <InfoItem label="CEP" value={formatCep(atendimento.cliente.clientes_fornecedores_enderecos[0].cep)} />}
                {atendimento?.cliente?.clientes_fornecedores_enderecos?.[0]?.logradouro && <InfoItem label="Endereço" value={atendimento.cliente.clientes_fornecedores_enderecos[0].logradouro} />}
              </div>
              {cnhUrl && (
                <>
                  <Separator className="my-2" />
                  <span className="text-xs text-green-600 font-medium">CNH anexada</span>
                </>
              )}
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          {moto && (
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Dados da Moto
                  {entityType !== 'preparacao' && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={openEditMoto} title="Editar dados da moto">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardTitle>
                <Separator className="mt-2" />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                {avaliadorNome && (
                  <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                    <IdCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{avaliadorNome}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Marca" value={moto.marca} />
                  <InfoItem label="Modelo" value={(moto.modelo || '').toUpperCase()} />
                  {moto.ano_fabricacao && <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />}
                  {moto.ano_modelo && <InfoItem label="Ano Modelo" value={moto.ano_modelo} />}
                  {moto.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{moto.categoria}</span>} />}
                  {moto.cor && <InfoItem label="Cor" value={<span className="uppercase">{moto.cor}</span>} />}
                  {moto.placa && <InfoItem label="Placa" value={moto.placa.replace(/-/g, '')} />}
                  {moto.km && <InfoItem label="KM" value={formatKm(moto.km)} />}
                  {moto.chassi && <InfoItem label="Chassi" value={moto.chassi} />}
                  {moto.renavam && <InfoItem label="RENAVAM" value={moto.renavam} />}
                  {moto.observacoes && (
                    <div className="col-span-2">
                      <InfoItem label="Observações" value={moto.observacoes} />
                    </div>
                  )}
                </div>
                <MaintenanceBadges
                  temManual={moto.tem_manual}
                  temChaveReserva={moto.tem_chave_reserva}
                  manutencaoVencida={moto.manutencao_vencida}
                />
                {/* Estoque Status */}
                {estoqueStatus && ['servico', 'indisponivel_manual', 'bloqueio_juridico'].includes(estoqueStatus.status) && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <Badge variant="outline" className={`text-xs gap-1 ${
                        estoqueStatus.status === 'servico' ? 'border-orange-500 text-orange-600' :
                        estoqueStatus.status === 'indisponivel_manual' ? 'border-destructive text-destructive' :
                        'border-muted-foreground text-muted-foreground'
                      }`}>
                        {estoqueStatus.status === 'servico' && 'Serviço'}
                        {estoqueStatus.status === 'indisponivel_manual' && <><AlertTriangle className="h-3 w-3" /> Indisponível</>}
                        {estoqueStatus.status === 'bloqueio_juridico' && <><ShieldAlert className="h-3 w-3" /> Bloqueio Jurídico</>}
                      </Badge>
                      {estoqueStatus.observacoes && (
                        <p className={`text-xs italic rounded p-2 ${
                          estoqueStatus.status === 'servico' ? 'text-orange-600 bg-orange-500/10' :
                          estoqueStatus.status === 'indisponivel_manual' ? 'text-destructive bg-destructive/10' :
                          'text-muted-foreground bg-muted'
                        }`}>{estoqueStatus.observacoes}</p>
                      )}
                    </div>
                  </>
                )}
                {entityType !== 'preparacao' && (
                  <>
                    <Separator className="mt-auto" />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className={`flex-1 gap-1.5 ${fotos.length > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setShowPhotosDialog(true)}>
                        <Camera className="h-4 w-4" /> {fotos.length > 0 ? `Fotos (${fotos.length}) ✓` : 'Fotos'}
                      </Button>
                      <DocumentUpload
                        label="CRLV"
                        className="flex-1"
                        currentUrl={crlvUrl}
                        bucketPath={moto.id ? `docs/${moto.id}/crlv` : ''}
                        onUploaded={(url) => {
                          setCrlvUrl(url);
                          if (moto.id) supabase.from('avaliacoes').update({ crlv_url: url }).eq('id', moto.id);
                          extrairDadosCrlv(url);
                        }}
                        onRemoved={() => {
                          setCrlvUrl(null);
                          if (moto.id) supabase.from('avaliacoes').update({ crlv_url: null }).eq('id', moto.id);
                        }}
                      />
                      <DocumentUpload
                        label="ATPV"
                        className="flex-1"
                        currentUrl={atpvUrl}
                        bucketPath={moto.id ? `docs/${moto.id}/atpv` : ''}
                        onUploaded={(url) => {
                          setAtpvUrl(url);
                          if (moto.id) supabase.from('avaliacoes').update({ atpv_url: url }).eq('id', moto.id);
                        }}
                        onRemoved={() => {
                          setAtpvUrl(null);
                          if (moto.id) supabase.from('avaliacoes').update({ atpv_url: null }).eq('id', moto.id);
                        }}
                      />
                      <DocumentUpload
                        label="Procuração"
                        className="flex-1"
                        currentUrl={procuracaoUrl}
                        bucketPath={moto.id ? `docs/${moto.id}/procuracao` : ''}
                        onUploaded={(url) => {
                          setProcuracaoUrl(url);
                          if (moto.id) supabase.from('avaliacoes').update({ procuracao_url: url }).eq('id', moto.id);
                        }}
                        onRemoved={() => {
                          setProcuracaoUrl(null);
                          if (moto.id) supabase.from('avaliacoes').update({ procuracao_url: null }).eq('id', moto.id);
                        }}
                      />
                    </div>
                  </>
                )}
                {(entityType === 'consignacao' || entityType === 'pos_compra') && (quantoPede != null || valorFechamento != null) && (
                  <>
                    <Separator />
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="grid grid-cols-2 gap-4">
                        {quantoPede != null && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Quanto Pede</span>
                            <p className="text-base font-semibold text-primary">{formatCurrency(quantoPede)}</p>
                          </div>
                        )}
                        {valorFechamento != null && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Valor Fechamento</span>
                            <p className="text-base font-semibold text-primary">{formatCurrency(valorFechamento)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dialog Fotos */}
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

          {/* Observações */}
          {atendimento?.id && <AtendimentoObservacoes idOperacao={atendimento.id} />}

        </div>
      </ScrollArea>

      {entityType === 'consignacao' && (
        <ConsignacaoProcessoDialog
          open={processoConsignacaoOpen}
          onOpenChange={setProcessoConsignacaoOpen}
          avaliacaoId={item.id}
          onStatusChanged={(newStatus) => {
            setCurrentConsignacaoStatus(newStatus);
            item.consignacao_status = newStatus;
          }}
        />
      )}

      {entityType === 'preparacao' && (
        <PreparacaoProcessoDialog
          open={processoPreparacaoOpen}
          onOpenChange={setProcessoPreparacaoOpen}
          avaliacaoId={item.id}
          currentStatus={currentPreparacaoStatus}
          avaliacaoData={item}
          onStatusChanged={(newStatus) => {
            setCurrentPreparacaoStatus(newStatus);
            item.preparacao_status = newStatus;
          }}
        />
      )}

      {entityType === 'pos_compra' && (
        <>
          <PosCompraProcessoDialog
            open={processoPosCompraOpen}
            onOpenChange={setProcessoPosCompraOpen}
            avaliacaoId={item.id}
            onStatusChanged={(newStatus) => {
              setCurrentPosCompraStatus(newStatus);
              item.pos_compra_status = newStatus;
            }}
          />
          <PosCompraFinanceiroDialog
            open={financeiroOpen}
            onOpenChange={setFinanceiroOpen}
            avaliacaoId={item.id}
          />
        </>
      )}

      {/* Dialog Editar Cliente */}
      <ClienteEditDialog
        clienteId={atendimento?.cliente_id || null}
        open={editClienteOpen}
        onOpenChange={setEditClienteOpen}
      />

      {/* Dialog Editar Moto */}
      <Dialog open={editMotoOpen} onOpenChange={setEditMotoOpen}>
        <DialogContent className="max-w-xl max-h-[85dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Editar Dados da Moto</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 pr-7" style={{ scrollbarWidth: 'thin' }}>
            <div className="space-y-3 pb-4">
              <div>
                <Label>Marca <span className="text-destructive">*</span></Label>
                <Select value={editMarca} onValueChange={(v) => { setEditMarca(v); setEditModelo(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{getMarcaNomes().map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modelo <span className="text-destructive">*</span></Label>
                <Select value={editModelo} onValueChange={setEditModelo}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{getModelosPorMarca(editMarca).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Placa</Label>
                  <PlacaInput value={editPlaca} onChange={setEditPlaca} />
                </div>
                <div>
                  <Label>KM</Label>
                  <Input value={editKm} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setEditKm(d ? parseInt(d,10).toLocaleString('pt-BR') : ''); }} placeholder="0" inputMode="numeric" />
                </div>
              </div>
              <ChassiRenavamFields
                chassi={editChassi}
                renavam={editRenavam}
                onChassiChange={setEditChassi}
                onRenavamChange={setEditRenavam}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ano Fab.</Label>
                  <Select value={editAnoFab} onValueChange={setEditAnoFab}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{ANOS_MOTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ano Mod.</Label>
                  <Select value={editAnoMod} onValueChange={setEditAnoMod}>
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
                  <Input value={editCilindrada} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setEditCilindrada(d ? parseInt(d,10).toLocaleString('pt-BR') : ''); }} placeholder="0" inputMode="numeric" />
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
                      <RadioGroupItem value="sim" id="edit-manual-sim" />
                      <Label htmlFor="edit-manual-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="edit-manual-nao" />
                      <Label htmlFor="edit-manual-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label>Chave Reserva</Label>
                  <RadioGroup value={editTemChaveReserva ? 'sim' : 'nao'} onValueChange={(v) => setEditTemChaveReserva(v === 'sim')} className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="sim" id="edit-chave-sim" />
                      <Label htmlFor="edit-chave-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="edit-chave-nao" />
                      <Label htmlFor="edit-chave-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label>Revisão Vencida</Label>
                  <RadioGroup value={editManutencaoVencida ? 'sim' : 'nao'} onValueChange={(v) => setEditManutencaoVencida(v === 'sim')} className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="sim" id="edit-manut-sim" />
                      <Label htmlFor="edit-manut-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="nao" id="edit-manut-nao" />
                      <Label htmlFor="edit-manut-nao" className="cursor-pointer font-normal">Não</Label>
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
            <Button onClick={handleSaveMoto} disabled={savingMoto} className="w-full gap-2">
              {savingMoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvaliacaoProcessDetail;
