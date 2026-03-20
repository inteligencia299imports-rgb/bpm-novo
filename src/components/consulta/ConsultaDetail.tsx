import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, User, Phone, MapPin, Bike, Clock, ArrowRight, RotateCw, Calendar, Palette, Tag, FileText, Save, Search } from 'lucide-react';
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

interface ConsultaDetailProps {
  moto: any;
  onClose: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
};

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
  const [resultadoPopup, setResultadoPopup] = useState(false);
  const [resultadoTexto, setResultadoTexto] = useState<string>(moto.resultado_consulta || '');
  const [saving, setSaving] = useState(false);
  const [isConsultada, setIsConsultada] = useState(moto.consulta_realizada === true);
  const [resultadoSalvo, setResultadoSalvo] = useState<string | null>(moto.resultado_consulta || null);
  const [loading, setLoading] = useState(true);
  
  const atendimento = moto.atendimento || moto.atendimentos;

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes, histRes] = await Promise.all([
        atendimento?.id
          ? supabase.from('atendimentos').select('cnh_url').eq('id', atendimento.id).single()
          : Promise.resolve({ data: null }),
        supabase.from('status_history').select('*').eq('entity_type', 'consulta').eq('entity_id', moto.id).order('created_at', { ascending: true }),
      ]);
      setCnhUrl(cnhRes.data?.cnh_url || null);
      setHistory(histRes.data || []);
      setLoading(false);
    };
    loadAll();
  }, [moto.id, atendimento?.id]);

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
      .from('motos_avaliacao')
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
      status_from: 'consulta_solicitada',
      status_to: 'consulta_realizada',
      changed_by: user?.id,
      changed_by_name: userName || user?.email || null,
      observacoes: resultadoTexto || null,
    } as any);

    setIsConsultada(true);
    setResultadoSalvo(resultadoTexto);
    fetchHistory();
    toast.success('Resultado salvo com sucesso!');
    setSaving(false);
    setResultadoPopup(false);
  };

  const statusLabel = isConsultada ? 'Consultada' : 'Pendente';
  const statusColor = isConsultada ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning';
  const statusHex = isConsultada ? '#27AE60' : '#F2C94C';
  const ano = [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/');

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
              {moto.placa && <span className="mr-2">{moto.placa.replace(/-/g, '')}</span>}
              {format(new Date(moto.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          {!isConsultada ? (
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setResultadoPopup(true)}>
              <FileText className="h-4 w-4" /> Incluir Resultado
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={async () => {
              await supabase.from('motos_avaliacao').update({ 
                consulta_solicitada: true, 
                consulta_realizada: false, 
                resultado_consulta: null 
              } as any).eq('id', moto.id);
              await supabase.from('status_history').insert({
                entity_type: 'consulta',
                entity_id: moto.id,
                status_from: 'consulta_realizada',
                status_to: 'consulta_solicitada',
                changed_by: user?.id,
                changed_by_name: userName || user?.email || null,
              });
              setIsConsultada(false);
              setResultadoSalvo(null);
              setResultadoTexto('');
              fetchHistory();
              toast.success('Nova consulta solicitada!');
            }}>
              <Search className="h-4 w-4" /> Nova Consulta
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-14rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
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
                <InfoItem label="Nome" value={atendimento?.nome_cliente} />
                {atendimento?.telefone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Telefone</span>
                    <p className="text-sm font-medium">{formatPhone(atendimento.telefone)}</p>
                  </div>
                )}
                <InfoItem label="Loja" value={atendimento?.loja} />
              </div>
              {atendimento?.id && (
                <>
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
                </>
              )}
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bike className="h-4 w-4 text-primary" /> Dados da Moto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Marca" value={<span className="uppercase">{moto.marca}</span>} />
                <InfoItem label="Modelo" value={<span className="uppercase">{moto.modelo}</span>} />
                {moto.placa && <InfoItem label="Placa" value={moto.placa.replace(/-/g, '')} />}
                <InfoItem label="KM" value={formatKm(moto.km)} />
                {ano && <InfoItem label="Ano" value={ano} />}
                {moto.cor && <InfoItem label="Cor" value={<span className="uppercase">{moto.cor}</span>} />}
                {moto.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{moto.categoria}</span>} />}
              </div>
              {moto.observacoes && (
                <>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground italic">{moto.observacoes}</p>
                </>
              )}
              <Separator className="my-2" />
              <DocumentUpload
                label="CRLV"
                currentUrl={crlvUrl}
                bucketPath={`docs/${moto.id}/crlv`}
                onUploaded={async (url) => {
                  await supabase.from('motos_avaliacao').update({ crlv_url: url }).eq('id', moto.id);
                  setCrlvUrl(url);
                }}
                onRemoved={async () => {
                  await supabase.from('motos_avaliacao').update({ crlv_url: null }).eq('id', moto.id);
                  setCrlvUrl(null);
                }}
              />
            </CardContent>
          </Card>

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

    </div>
  );
};

export default ConsultaDetail;
