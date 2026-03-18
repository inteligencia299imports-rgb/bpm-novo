import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Bike, Clock, ArrowRight, DollarSign, Tag, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import DocumentUpload from '@/components/showroom/DocumentUpload';
import StatusTimeline from '@/components/shared/StatusTimeline';

interface Props {
  item: any;
  entityType: string;
  statusColumns: { value: string; label: string; hex: string }[];
  statusField: string;
  title: string;
  onClose: () => void;
}

const formatPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : v; };
const formatKm = (km: string | null | undefined) => { if (!km) return null; const n = parseInt(km.replace(/\D/g,''),10); return isNaN(n) ? km : n.toLocaleString('pt-BR') + ' km'; };
const formatCurrency = (v: number | null | undefined) => v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <p className="text-sm font-medium">{value || '-'}</p>
  </div>
);

const AvaliacaoProcessDetail: React.FC<Props> = ({ item, entityType, statusColumns, statusField, title, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(null);
  const moto = item.moto || item.motos_avaliacao;
  const atendimento = item.atendimento || item.atendimentos;
  const statusValue = item[statusField] || 'em_aberto';
  const statusCol = statusColumns.find(c => c.value === statusValue);
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
  const whatsappUrl = atendimento?.telefone ? `https://wa.me/55${atendimento.telefone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    // Fetch CNH from atendimento
    if (atendimento?.id) {
      supabase.from('atendimentos').select('cnh_url').eq('id', atendimento.id).single()
        .then(({ data }) => setCnhUrl(data?.cnh_url || null));
    }
    // Fetch CRLV from moto
    if (moto?.id) {
      setCrlvUrl(moto.crlv_url || null);
    }
  }, [atendimento?.id, moto?.id]);

  useEffect(() => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', item.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setHistory(data || []));
  }, [item.id, entityType]);

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
                {moto ? `${moto.marca} ${moto.modelo}` : atendimento?.nome_cliente || 'N/A'}
              </h1>
              {statusCol && (
                <Badge className="text-[10px] shrink-0" style={{ backgroundColor: `${statusCol.hex}20`, color: statusCol.hex }}>
                  {statusCol.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {moto?.placa && <span className="mr-2">{moto.placa.replace(/-/g, '')}</span>}
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
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={atendimento?.nome_cliente} />
                {atendimento?.telefone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Telefone</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{formatPhone(atendimento.telefone)}</span>
                      {whatsappUrl && (
                        <button onClick={() => window.open(whatsappUrl, '_blank')} className="text-green-600 hover:text-green-700 transition-colors" title="Abrir WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
          {moto && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Dados da Moto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Marca / Modelo" value={`${moto.marca} ${(moto.modelo || '').toUpperCase()}`} />
                  {moto.placa && <InfoItem label="Placa" value={moto.placa.replace(/-/g, '')} />}
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
          )}

          {/* Valores */}
          {(item.valor_fipe != null || item.avaliacao_compra != null || item.avaliacao_consignacao != null || item.quanto_pede != null) && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Valores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {item.valor_fipe != null && <InfoItem label="FIPE" value={formatCurrency(item.valor_fipe)} />}
                  {item.avaliacao_compra != null && <InfoItem label="Avaliação Compra" value={formatCurrency(item.avaliacao_compra)} />}
                  {item.avaliacao_consignacao != null && <InfoItem label="Avaliação Consignação" value={formatCurrency(item.avaliacao_consignacao)} />}
                  {item.quanto_pede != null && <InfoItem label="Quanto Pede" value={formatCurrency(item.quanto_pede)} />}
                  {item.quanto_vende != null && <InfoItem label="Quanto Vende" value={formatCurrency(item.quanto_vende)} />}
                  {item.valor_fechamento != null && <InfoItem label="Valor Fechamento" value={formatCurrency(item.valor_fechamento)} />}
                  {item.previsao_custos_loja != null && <InfoItem label="Custos Loja" value={formatCurrency(item.previsao_custos_loja)} />}
                  {item.previsao_custos_cliente != null && <InfoItem label="Custos Cliente" value={formatCurrency(item.previsao_custos_cliente)} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações Adicionais */}
          {(item.tipo_aquisicao || item.negociacao || item.observacao_avaliador) && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" /> Informações Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {item.tipo_aquisicao && <InfoItem label="Tipo Aquisição" value={item.tipo_aquisicao === 'propria' ? 'Própria' : 'Consignada'} />}
                  {item.negociacao && <InfoItem label="Negociação" value={item.negociacao === 'compra' ? 'Compra' : 'Consignação'} />}
                </div>
                {item.observacao_avaliador && (
                  <>
                    <Separator className="my-3" />
                    <div>
                      <span className="text-xs text-muted-foreground">Observação do Avaliador</span>
                      <p className="text-sm text-muted-foreground mt-1">{item.observacao_avaliador}</p>
                    </div>
                  </>
                )}
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
                <StatusTimeline history={history} />
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default AvaliacaoProcessDetail;
