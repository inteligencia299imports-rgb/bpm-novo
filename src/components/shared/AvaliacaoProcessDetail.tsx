import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Bike, MessageCircle, FileText, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';


import DetailSkeleton from '@/components/shared/DetailSkeleton';
import ContratoConsignacaoDialog from '@/components/consignacao/ContratoConsignacaoDialog';
import PreparacaoProcessoDialog from '@/components/preparacao/PreparacaoProcessoDialog';

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
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(null);
  const [contratoConsignacaoOpen, setContratoConsignacaoOpen] = useState(false);
  const [processoPreparacaoOpen, setProcessoPreparacaoOpen] = useState(false);
  const [currentPreparacaoStatus, setCurrentPreparacaoStatus] = useState(item.preparacao_status || 'em_aberto');
  const [loading, setLoading] = useState(true);
  const moto = item.moto || item.motos_avaliacao;
  const atendimento = item.atendimento || item.atendimentos;
  const statusValue = item[statusField] || 'em_aberto';
  const statusCol = statusColumns.find(c => c.value === statusValue);
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
  const whatsappUrl = atendimento?.telefone ? `https://wa.me/55${atendimento.telefone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes] = await Promise.all([
        atendimento?.id
          ? supabase.from('atendimentos').select('cnh_url').eq('id', atendimento.id).single()
          : Promise.resolve({ data: null }),
      ]);
      setCnhUrl(cnhRes.data?.cnh_url || null);
      if (moto?.id) setCrlvUrl(moto.crlv_url || null);
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
          {entityType === 'consignacao' && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setContratoConsignacaoOpen(true)} className="gap-1.5">
                <FileText className="h-4 w-4" /> Contrato
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
        </div>
        {entityType === 'consignacao' && (
          <div className="flex sm:hidden gap-2 justify-center">
            <Button size="sm" onClick={() => setContratoConsignacaoOpen(true)} className="flex-1">
              <FileText className="h-4 w-4" />
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
              </CardContent>
            </Card>
          )}


        </div>
      </ScrollArea>

      {entityType === 'consignacao' && (
        <ContratoConsignacaoDialog
          open={contratoConsignacaoOpen}
          onOpenChange={setContratoConsignacaoOpen}
          avaliacao={item}
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
    </div>
  );
};

export default AvaliacaoProcessDetail;
