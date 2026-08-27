import React, { useState, useEffect } from 'react';
import { isTipoPropria, isTipoConsignada } from '@/lib/tipoAquisicao';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Bike, MessageCircle, FileText, ClipboardList, DollarSign, AlertTriangle, ShieldAlert, IdCard, Pencil, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { SEXOS, UFS, ANOS_MOTO, CORES_MOTO, CATEGORIAS_MOTO } from '@/types/crm';
import DocumentUpload from '@/components/showroom/DocumentUpload';
import ClienteEditDialog from '@/components/shared/ClienteEditDialog';
import { formatPersonName } from '@/lib/utils';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';


import DetailSkeleton from '@/components/shared/DetailSkeleton';
import ObservacoesProcesso from '@/components/shared/ObservacoesProcesso';
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

  // Moto edit state
  const [editMotoOpen, setEditMotoOpen] = useState(false);
  const [editMarca, setEditMarca] = useState('');
  const [editModelo, setEditModelo] = useState('');
  const [editPlaca, setEditPlaca] = useState('');
  const [editKm, setEditKm] = useState('');
  const [editAnoFab, setEditAnoFab] = useState('');
  const [editAnoMod, setEditAnoMod] = useState('');
  const [editCor, setEditCor] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [editCilindrada, setEditCilindrada] = useState('');
  const [editMotoObs, setEditMotoObs] = useState('');
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
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
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
    setEditKm(moto.km ? (parseInt(moto.km.replace(/\D/g,''),10) || 0).toLocaleString('pt-BR') : '');
    setEditAnoFab(moto.ano_fabricacao || '');
    setEditAnoMod(moto.ano_modelo || '');
    setEditCor(moto.cor || '');
    setEditCategoria(moto.categoria || '');
    setEditCilindrada(moto.cilindrada ? (parseInt(moto.cilindrada.replace(/\D/g,''),10) || 0).toLocaleString('pt-BR') : '');
    setEditMotoObs(moto.observacoes || '');
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
    setSavingMoto(true);
    const { error } = await supabase.from('avaliacoes').update({
      marca: editMarca.trim(),
      modelo: editModelo.trim(),
      placa: editPlaca.trim() || null,
      km: editKm.replace(/\D/g, '') || null,
      ano_fabricacao: editAnoFab.trim() || null,
      ano_modelo: editAnoMod.trim() || null,
      cor: editCor.trim() || null,
      categoria: editCategoria.trim() || null,
      cilindrada: editCilindrada.replace(/\D/g, '') || null,
      observacoes: editMotoObs.trim() || null,
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
        placa: editPlaca.trim() || null,
        km: editKm.replace(/\D/g, '') || null,
        ano_fabricacao: editAnoFab.trim() || null,
        ano_modelo: editAnoMod.trim() || null,
        cor: editCor.trim() || null,
        categoria: editCategoria.trim() || null,
        cilindrada: editCilindrada.replace(/\D/g, '') || null,
        observacoes: editMotoObs.trim() || null,
        tem_manual: editTemManual,
        tem_chave_reserva: editTemChaveReserva,
        manutencao_vencida: editManutencaoVencida,
      });
      toast.success('Dados da moto atualizados!');
      setEditMotoOpen(false);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes, avRes, estRes, histRes] = await Promise.all([
        atendimento?.cliente_id
          ? supabase.from('clientes_fornecedores_documentos').select('arquivo_url').eq('cliente_fornecedor_id', atendimento.cliente_id).eq('tipo_documento', 'cnh').maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('avaliacoes').select('quanto_pede, valor_fechamento, avaliador_id, crlv_url').eq('id', item.id).maybeSingle(),
        supabase.from('estoque').select('status, observacoes').eq('avaliacao_id', item.id).maybeSingle(),
        supabase.from('status_history').select('created_at').eq('entity_type', 'avaliacao').eq('entity_id', item.id).eq('status', 'adquirida').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      ]);
      setCnhUrl((cnhRes.data as any)?.arquivo_url || null);
      setCrlvUrl((avRes.data as any)?.crlv_url || null);
      setQuantoPede(avRes.data?.quanto_pede ?? null);
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
        if (tipo === 'test-ride') {
          // Test-ride não exige NF nem Vistoria
        } else if (isTipoPropria(tipo)) {
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Dados da Moto
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={openEditMoto} title="Editar dados da moto">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {avaliadorNome && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                    <IdCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{avaliadorNome}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Marca / Modelo" value={`${moto.marca} ${(moto.modelo || '').toUpperCase()}`} />
                  {moto.placa && <InfoItem label="Placa" value={moto.placa.replace(/-/g, '')} />}
                  {moto.km && <InfoItem label="KM" value={formatKm(moto.km)} />}
                  {ano && <InfoItem label="Ano" value={ano} />}
                  {moto.cor && <InfoItem label="Cor" value={<span className="uppercase">{moto.cor}</span>} />}
                  {moto.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{moto.categoria}</span>} />}
                </div>
                {/* Estoque Status */}
                {estoqueStatus && ['servico', 'indisponivel_manual', 'bloqueio_juridico'].includes(estoqueStatus.status) && (
                  <>
                    <Separator className="my-2" />
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
                <Separator className="my-2" />
                <DocumentUpload
                  label="CRLV"
                  currentUrl={crlvUrl}
                  bucketPath={moto.id ? `crlv/${moto.id}` : ''}
                  onUploaded={(url) => {
                    setCrlvUrl(url);
                    if (moto.id) {
                      supabase.from('avaliacoes').update({ crlv_url: url }).eq('id', moto.id);
                    }
                  }}
                  onRemoved={() => {
                    setCrlvUrl(null);
                    if (moto.id) {
                      supabase.from('avaliacoes').update({ crlv_url: null }).eq('id', moto.id);
                    }
                  }}
                />
                <Separator className="my-3" />
                <MaintenanceBadges
                  temManual={moto.tem_manual}
                  temChaveReserva={moto.tem_chave_reserva}
                  manutencaoVencida={moto.manutencao_vencida}
                />
                {moto.observacoes && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs text-muted-foreground italic">{moto.observacoes}</p>
                  </>
                )}
                {(entityType === 'consignacao' || entityType === 'pos_compra') && (quantoPede != null || valorFechamento != null) && (
                  <>
                    <Separator className="my-3" />
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

          {/* Observações do Processo */}
          <ObservacoesProcesso entityId={item.id} entityType={entityType} />

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
        <DialogContent className="max-w-xl h-[85dvh] max-h-[85dvh] flex flex-col overflow-hidden p-0">
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
                  <Input value={editPlaca} onChange={e => setEditPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" maxLength={7} />
                </div>
                <div>
                  <Label>KM</Label>
                  <Input value={editKm} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setEditKm(d ? parseInt(d,10).toLocaleString('pt-BR') : ''); }} placeholder="0" inputMode="numeric" />
                </div>
              </div>
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
              <div>
                <Label>Observações</Label>
                <Textarea value={editMotoObs} onChange={e => setEditMotoObs(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="edit-manual" checked={editTemManual} onCheckedChange={(v) => setEditTemManual(!!v)} />
                  <Label htmlFor="edit-manual" className="cursor-pointer">Tem manual</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="edit-chave" checked={editTemChaveReserva} onCheckedChange={(v) => setEditTemChaveReserva(!!v)} />
                  <Label htmlFor="edit-chave" className="cursor-pointer">Tem chave reserva</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="edit-manut" checked={editManutencaoVencida} onCheckedChange={(v) => setEditManutencaoVencida(!!v)} />
                  <Label htmlFor="edit-manut" className="cursor-pointer">Manutenção vencida</Label>
                </div>
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
