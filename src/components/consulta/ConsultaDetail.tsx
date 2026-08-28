import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User, Phone, MapPin, Bike, Clock, ArrowRight, RotateCw, Calendar, Palette, Tag, FileText, Save, Search, Camera, Satellite, Loader2 } from 'lucide-react';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import ConsultaVeicularResultado from './ConsultaVeicularResultado';
import type { ConsultaVeiculoResultado } from '@/types/consultaVeicular';
import type { MotoFoto } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import DocumentUpload from '@/components/showroom/DocumentUpload';
import StatusTimeline from '@/components/shared/StatusTimeline';
import DetailSkeleton from '@/components/shared/DetailSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatPersonName } from '@/lib/utils';

interface ConsultaDetailProps {
  moto: any;
  onClose: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
};
const formatCpfCnpj = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 14); if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); };
const formatCep = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? d.replace(/(\d{5})(\d)/, '$1-$2') : d; };

const formatKm = (km: string | null | undefined) => {
  if (!km) return null;
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR') + ' km';
};

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <p className="text-sm font-medium">{value || '-'}</p>
  </div>
);

const ConsultaDetail: React.FC<ConsultaDetailProps> = ({ moto, onClose }) => {
  const { user, userName } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(moto.crlv_url || null);
  const [atpvUrl, setAtpvUrl] = useState<string | null>((moto as any).atpv_url || null);
  const [procuracaoUrl, setProcuracaoUrl] = useState<string | null>((moto as any).procuracao_url || null);
  const [resultadoPopup, setResultadoPopup] = useState(false);
  const [resultadoTexto, setResultadoTexto] = useState<string>(moto.resultado_consulta || '');
  const [saving, setSaving] = useState(false);
  const [isConsultada, setIsConsultada] = useState(moto.consulta_realizada === true);
  const [resultadoSalvo, setResultadoSalvo] = useState<string | null>(moto.resultado_consulta || null);
  const [loading, setLoading] = useState(true);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [showPhotosDialog, setShowPhotosDialog] = useState(false);
  const [consultaVeicular, setConsultaVeicular] = useState<ConsultaVeiculoResultado | null>(null);
  const [consultandoVeicular, setConsultandoVeicular] = useState(false);
  const [veicularDetalheOpen, setVeicularDetalheOpen] = useState(false);
  const [placa, setPlaca] = useState<string>(moto.placa || '');
  const [chassi, setChassi] = useState<string | null>(moto.chassi || null);
  const [renavam, setRenavam] = useState<string | null>(moto.renavam || null);
  const [consultaInputOpen, setConsultaInputOpen] = useState(false);
  const [inputPlaca, setInputPlaca] = useState('');
  const [inputChassi, setInputChassi] = useState('');
  const [inputRenavam, setInputRenavam] = useState('');

  const atendimento = moto.atendimento || moto.atendimentos;

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes, histRes, fotosRes, consultaRes] = await Promise.all([
        atendimento?.cliente_id
          ? supabase.from('clientes_fornecedores_documentos').select('arquivo_url').eq('cliente_fornecedor_id', atendimento.cliente_id).eq('tipo_documento', 'cnh').maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('status_history').select('*').eq('entity_type', 'consulta').eq('entity_id', moto.id).order('created_at', { ascending: true }),
        supabase.from('moto_fotos').select('*').eq('avaliacao_id', moto.id),
        (supabase as any).from('consultas_veiculares').select('resultado').eq('avaliacao_id', moto.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setCnhUrl(cnhRes.data?.arquivo_url || null);
      setHistory(histRes.data || []);
      if (fotosRes.data) setFotos(fotosRes.data);
      if (consultaRes.data?.resultado) setConsultaVeicular(consultaRes.data.resultado as ConsultaVeiculoResultado);
      setLoading(false);
    };
    loadAll();
  }, [moto.id, atendimento?.id]);

  const extrairDadosCrlv = async (url: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('extrair-dados-crlv', {
        body: { avaliacao_id: moto.id, url },
      });
      if (error || !data?.extraido) {
        console.warn('extrair-dados-crlv não extraiu:', error || data?.motivo || data);
        return;
      }
      if (data.chassi) setChassi(data.chassi);
      if (data.renavam) setRenavam(data.renavam);
      if (data.chassi || data.renavam) toast.success('Chassi/RENAVAM extraídos do CRLV');
    } catch {
      // extracao e best-effort -- falha aqui nunca deve incomodar o usuario
    }
  };

  const openConsultaInput = () => {
    setInputPlaca(placa || '');
    setInputChassi(chassi || '');
    setInputRenavam(renavam || '');
    setConsultaInputOpen(true);
  };

  const handleConsultarVeicular = async () => {
    const placaTrim = inputPlaca.trim().toUpperCase();
    const chassiTrim = inputChassi.trim().toUpperCase();
    const renavamTrim = inputRenavam.trim();
    if (!placaTrim || !chassiTrim || !renavamTrim) {
      toast.error('Placa, chassi e RENAVAM são obrigatórios');
      return;
    }
    setConsultandoVeicular(true);
    try {
      await supabase.from('avaliacoes').update({ placa: placaTrim, chassi: chassiTrim, renavam: renavamTrim } as any).eq('id', moto.id);
      setPlaca(placaTrim);
      setChassi(chassiTrim);
      setRenavam(renavamTrim);

      const { data, error } = await supabase.functions.invoke('consulta-veicular', {
        body: {
          placa: placaTrim,
          uf: (moto as any).uf || null,
          renavam: renavamTrim,
          avaliacao_id: moto.id,
        },
      });
      if (error || !data?.resultado) {
        toast.error('Erro ao consultar o veículo');
        return;
      }
      setConsultaVeicular(data.resultado as ConsultaVeiculoResultado);
      toast.success(data.de_cache ? 'Resultado da última consulta recente' : 'Consulta realizada com sucesso');
      setConsultaInputOpen(false);
    } catch {
      toast.error('Erro ao consultar o veículo');
    } finally {
      setConsultandoVeicular(false);
    }
  };

  const fetchHistory = () => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', 'consulta')
      .eq('entity_id', moto.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setHistory(data || []));
  };

  const handleSaveResultado = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('avaliacoes')
      .update({ resultado_consulta: resultadoTexto, consulta_realizada: true } as any)
      .eq('id', moto.id);

    if (error) {
      toast.error('Erro ao salvar resultado');
      setSaving(false);
      return;
    }

    await supabase.from('status_history').insert({
      entity_type: 'consulta',
      entity_id: moto.id,
      status: 'consulta_realizada',
      changed_by: user?.id,
      changed_by_name: userName || user?.email || null,
      observacoes: resultadoTexto || null,
    } as any);

    setIsConsultada(true);
    setResultadoSalvo(resultadoTexto);
    fetchHistory();
    // Notify users flagged for consultation
    await supabase.rpc('notify_consulta', {
      _title: 'Consulta Concluída',
      _message: `${atendimento?.cliente?.nome_razao_social || ''} - ${moto.marca} ${moto.modelo}${moto.placa ? ` (${moto.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
      _entity_id: moto.id,
      _entity_type: 'consulta',
    });
    // Notify the user who requested the consultation
    const { data: requestHistory } = await supabase
      .from('status_history')
      .select('changed_by')
      .eq('entity_type', 'consulta')
      .eq('entity_id', moto.id)
      .eq('status', 'consulta_solicitada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (requestHistory?.changed_by && requestHistory.changed_by !== user?.id) {
      await supabase.from('notifications').insert({
        user_id: requestHistory.changed_by,
        title: 'Resultado da Consulta',
        message: `${atendimento?.cliente?.nome_razao_social || ''} - ${moto.marca} ${moto.modelo}${moto.placa ? ` (${moto.placa})` : ''}: ${resultadoTexto} | Por: ${userName || user?.email || 'Usuário'}`,
        entity_id: moto.id,
        entity_type: 'consulta',
      } as any);
    }
    toast.success('Resultado salvo com sucesso!');
    setSaving(false);
    setResultadoPopup(false);
  };

  const statusLabel = isConsultada ? 'Consultada' : 'Pendente';
  const statusColor = isConsultada ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning';
  const statusHex = isConsultada ? '#169d53' : '#da6220';

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
                {moto.marca} {moto.modelo}
              </h1>
              <Badge className={`${statusColor} text-[10px] shrink-0`}>{statusLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {placa && <span className="mr-2">{placa.replace(/-/g, '')}</span>}
              {format(new Date(moto.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openConsultaInput}>
            <Satellite className="h-4 w-4" />
            <span className="hidden sm:inline">Consultar</span>
          </Button>
          {!isConsultada ? (
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setResultadoPopup(true)}>
              <FileText className="h-4 w-4" /> Incluir Resultado
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={async () => {
              await supabase.from('avaliacoes').update({ 
                consulta_solicitada: true, 
                consulta_realizada: false, 
                resultado_consulta: null 
              } as any).eq('id', moto.id);
              await supabase.from('status_history').insert({
                entity_type: 'consulta',
                entity_id: moto.id,
                status: 'consulta_solicitada',
                changed_by: user?.id,
                changed_by_name: userName || user?.email || null,
              });
              setIsConsultada(false);
              setResultadoSalvo(null);
              setResultadoTexto('');
              fetchHistory();
              // Notify users flagged for consultation
              await supabase.rpc('notify_consulta', {
                _title: 'Nova Consulta Solicitada',
                _message: `${atendimento?.cliente?.nome_razao_social || ''} - ${moto.marca} ${moto.modelo}${moto.placa ? ` (${moto.placa})` : ''} | Por: ${userName || user?.email || 'Usuário'}`,
                _entity_id: moto.id,
                _entity_type: 'consulta',
              });
              toast.success('Nova consulta solicitada!');
            }}>
              <Search className="h-4 w-4" /> <span className="hidden sm:inline">Nova Consulta</span>
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Resultado da Consulta */}
          <Card className="md:col-span-2 border-l-4" style={{ borderLeftColor: statusHex }}>
            <CardContent className="py-3 px-4">
              <span className="text-xs text-muted-foreground">Resultado da Consulta</span>
              <p className="text-sm font-medium uppercase">{isConsultada ? 'Consulta Realizada' : 'Consulta Pendente'}</p>
            </CardContent>
          </Card>

          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={formatPersonName(atendimento?.cliente?.nome_razao_social || '')} />
                {atendimento?.cliente?.telefone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Telefone</span>
                    <p className="text-sm font-medium">{formatPhone(atendimento.cliente.telefone)}</p>
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
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bike className="h-4 w-4 text-primary" /> Dados da Moto
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Marca" value={<span className="uppercase">{moto.marca}</span>} />
                <InfoItem label="Modelo" value={<span className="uppercase">{moto.modelo}</span>} />
                {moto.ano_fabricacao && <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />}
                {moto.ano_modelo && <InfoItem label="Ano Modelo" value={moto.ano_modelo} />}
                {moto.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{moto.categoria}</span>} />}
                {moto.cor && <InfoItem label="Cor" value={<span className="uppercase">{moto.cor}</span>} />}
                {placa && <InfoItem label="Placa" value={placa.replace(/-/g, '')} />}
                <InfoItem label="KM" value={formatKm(moto.km)} />
                {chassi && <InfoItem label="Chassi" value={chassi} />}
                {renavam && <InfoItem label="RENAVAM" value={renavam} />}
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
              <Separator className="mt-auto" />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className={`flex-1 gap-1.5 ${fotos.length > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setShowPhotosDialog(true)}>
                  <Camera className="h-4 w-4" /> {fotos.length > 0 ? `Fotos (${fotos.length}) ✓` : 'Fotos'}
                </Button>
                <DocumentUpload
                  label="CRLV"
                  className="flex-1"
                  currentUrl={crlvUrl}
                  bucketPath={`docs/${moto.id}/crlv`}
                  onUploaded={async (url) => {
                    await supabase.from('avaliacoes').update({ crlv_url: url }).eq('id', moto.id);
                    setCrlvUrl(url);
                    extrairDadosCrlv(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('avaliacoes').update({ crlv_url: null }).eq('id', moto.id);
                    setCrlvUrl(null);
                  }}
                />
                <DocumentUpload
                  label="ATPV"
                  className="flex-1"
                  currentUrl={atpvUrl}
                  bucketPath={`docs/${moto.id}/atpv`}
                  onUploaded={async (url) => {
                    await supabase.from('avaliacoes').update({ atpv_url: url } as any).eq('id', moto.id);
                    setAtpvUrl(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('avaliacoes').update({ atpv_url: null } as any).eq('id', moto.id);
                    setAtpvUrl(null);
                  }}
                />
                <DocumentUpload
                  label="Procuração"
                  className="flex-1"
                  currentUrl={procuracaoUrl}
                  bucketPath={`docs/${moto.id}/procuracao`}
                  onUploaded={async (url) => {
                    await supabase.from('avaliacoes').update({ procuracao_url: url } as any).eq('id', moto.id);
                    setProcuracaoUrl(url);
                  }}
                  onRemoved={async () => {
                    await supabase.from('avaliacoes').update({ procuracao_url: null } as any).eq('id', moto.id);
                    setProcuracaoUrl(null);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Consulta Veicular (RENAVE/SENATRAN) */}
          {consultaVeicular && (
            <Card
              className="md:col-span-2 border-l-4 cursor-pointer hover:bg-muted/30 transition-colors"
              style={{ borderLeftColor: consultaVeicular.renave.apto_estoque === true ? '#169d53' : '#da6220' }}
              onClick={() => setVeicularDetalheOpen(true)}
            >
              <CardContent className="py-3 px-4">
                <span className="text-xs text-muted-foreground">Consulta Realizada</span>
                <p className="text-sm font-medium uppercase">
                  {consultaVeicular.renave.apto_estoque === true
                    ? 'Apto para entrada em estoque'
                    : consultaVeicular.renave.apto_estoque === false
                      ? 'Não apto para entrada em estoque'
                      : 'Aptidão indeterminada'}
                </p>
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
                          <p className="text-sm mt-1 whitespace-pre-wrap">{h.observacoes}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Popup Resultado */}
      <Dialog open={resultadoPopup} onOpenChange={setResultadoPopup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Resultado da Consulta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Descreva o resultado da consulta..."
              value={resultadoTexto}
              onChange={(e) => setResultadoTexto(e.target.value)}
              rows={6}
            />
            <div className="flex justify-end">
              <Button className="gap-1.5" disabled={saving || !resultadoTexto.trim()} onClick={handleSaveResultado}>
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Confirmação de dados antes de consultar */}
      <Dialog open={consultaInputOpen} onOpenChange={setConsultaInputOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Satellite className="h-5 w-5" /> Confirmar dados para consulta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Placa <span className="text-destructive">*</span></Label>
              <Input value={inputPlaca} onChange={(e) => setInputPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" maxLength={7} />
            </div>
            <div className="space-y-1.5">
              <Label>Chassi <span className="text-destructive">*</span></Label>
              <Input value={inputChassi} onChange={(e) => setInputChassi(e.target.value.toUpperCase())} placeholder="Número do chassi" />
            </div>
            <div className="space-y-1.5">
              <Label>RENAVAM <span className="text-destructive">*</span></Label>
              <Input value={inputRenavam} onChange={(e) => setInputRenavam(e.target.value.replace(/\D/g, ''))} placeholder="Número do RENAVAM" />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                className="gap-1.5"
                disabled={consultandoVeicular || !inputPlaca.trim() || !inputChassi.trim() || !inputRenavam.trim()}
                onClick={handleConsultarVeicular}
              >
                {consultandoVeicular ? <Loader2 className="h-4 w-4 animate-spin" /> : <Satellite className="h-4 w-4" />}
                {consultandoVeicular ? 'Consultando...' : 'Consultar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup Detalhe da Consulta Veicular */}
      <Dialog open={veicularDetalheOpen} onOpenChange={setVeicularDetalheOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Satellite className="h-5 w-5" /> Consulta Veicular
            </DialogTitle>
          </DialogHeader>
          {consultaVeicular && <ConsultaVeicularResultado resultado={consultaVeicular} />}
        </DialogContent>
      </Dialog>

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

    </div>
  );
};

export default ConsultaDetail;
