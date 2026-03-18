import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Phone, MapPin, Bike, Clock, ArrowRight, RotateCw, Calendar, Palette, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import DocumentUpload from '@/components/showroom/DocumentUpload';

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
  const [history, setHistory] = useState<any[]>([]);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(moto.crlv_url || null);
  const atendimento = moto.atendimento || moto.atendimentos;

  useEffect(() => {
    // Fetch CNH from atendimento
    if (atendimento?.id) {
      supabase.from('atendimentos').select('cnh_url').eq('id', atendimento.id).single()
        .then(({ data }) => setCnhUrl(data?.cnh_url || null));
    }
  }, [atendimento?.id]);

  useEffect(() => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', 'consulta')
      .eq('entity_id', moto.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistory(data || []));
  }, [moto.id]);

  const isConsultada = moto.consulta_realizada === true;
  const statusLabel = isConsultada ? 'Consultada' : 'Pendente';
  const statusColor = isConsultada ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning';
  const statusHex = isConsultada ? '#27AE60' : '#F2C94C';
  const atendimento = moto.atendimento || moto.atendimentos;
  const ano = [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/');

  return (
    <div className="space-y-4">
      {/* Header — same pattern as Showroom */}
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
              {moto.placa && <span className="mr-2">{moto.placa}</span>}
              {format(new Date(moto.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
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
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bike className="h-4 w-4 text-primary" /> Dados da Moto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Marca" value={<span className="uppercase">{moto.marca}</span>} />
                <InfoItem label="Modelo" value={<span className="uppercase">{moto.modelo}</span>} />
                {moto.placa && <InfoItem label="Placa" value={moto.placa} />}
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
                <div className="space-y-0">
                  {history.map((h, i) => (
                    <div key={h.id}>
                      <div className="flex items-start gap-3 py-3">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-muted-foreground uppercase">{h.status_from}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-primary" />
                            <span className="font-bold uppercase">{h.status_to}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                            {h.changed_by_name && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {h.changed_by_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {i < history.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ConsultaDetail;
