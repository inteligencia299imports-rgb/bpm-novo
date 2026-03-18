import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Phone, MapPin, Bike, Clock, ArrowRight, DollarSign, Store, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { POS_VENDA_COLUMNS } from '@/types/crm';
import DocumentUpload from '@/components/showroom/DocumentUpload';

interface Props {
  item: any;
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

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <p className="text-sm font-medium">{value || '-'}</p>
  </div>
);

const PosVendaDetail: React.FC<Props> = ({ item, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const moto = item.motos_avaliacao?.[0];
  const [cnhUrl, setCnhUrl] = useState<string | null>(item.cnh_url || null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(moto?.crlv_url || null);
  const statusCol = POS_VENDA_COLUMNS.find(c => c.value === (item.pos_venda_status || 'em_aberto'));
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
  const whatsappUrl = item.telefone ? `https://wa.me/55${item.telefone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', 'pos_venda')
      .eq('entity_id', item.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistory(data || []));
  }, [item.id]);

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
              <h1 className="text-lg sm:text-xl font-bold truncate">{item.nome_cliente}</h1>
              {statusCol && <Badge className={`text-[10px] shrink-0`} style={{ backgroundColor: `${statusCol.hex}20`, color: statusCol.hex }}>{statusCol.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(item.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-14rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={item.nome_cliente} />
                <div>
                  <span className="text-xs text-muted-foreground">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{formatPhone(item.telefone)}</span>
                    {whatsappUrl && (
                      <button onClick={() => window.open(whatsappUrl, '_blank')} className="text-green-600 hover:text-green-700 transition-colors" title="Abrir WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <InfoItem label="Loja" value={item.loja} />
                <InfoItem label="UF" value={item.uf} />
              </div>
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          {moto && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Dados da Moto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Marca / Modelo" value={`${moto.marca} ${moto.modelo}`} />
                  {moto.placa && <InfoItem label="Placa" value={moto.placa} />}
                  {moto.km && <InfoItem label="KM" value={formatKm(moto.km)} />}
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
          )}

          {/* Valores */}
          {(item.valor_venda != null || item.valor_sinal != null) && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Valores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {item.valor_venda != null && <InfoItem label="Valor Venda" value={formatCurrency(item.valor_venda)} />}
                  {item.valor_sinal != null && <InfoItem label="Valor Sinal" value={formatCurrency(item.valor_sinal)} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {item.observacoes && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.observacoes}</p>
              </CardContent>
            </Card>
          )}

          {/* Histórico */}
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
                            <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                            {h.changed_by_name && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{h.changed_by_name}</span>}
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

export default PosVendaDetail;
