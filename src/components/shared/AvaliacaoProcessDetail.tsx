import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Bike, MessageCircle, FileText, ClipboardList, DollarSign, AlertTriangle, ShieldAlert, IdCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import DocumentUpload from '@/components/showroom/DocumentUpload';


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
  const [avaliadorNome, setAvaliadorNome] = useState<string | null>(null);
  const moto = item.moto || item.motos_avaliacao;
  const atendimento = item.atendimento || item.atendimentos;
  const statusValue = item[statusField] || 'em_aberto';
  const statusCol = statusColumns.find(c => c.value === statusValue);
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';
  const whatsappUrl = atendimento?.telefone ? `https://wa.me/55${atendimento.telefone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [cnhRes, crlvRes, avRes, estRes] = await Promise.all([
        atendimento?.id
          ? supabase.from('atendimentos').select('cnh_url').eq('id', atendimento.id).single()
          : Promise.resolve({ data: null }),
        moto?.id
          ? supabase.from('motos_avaliacao').select('crlv_url').eq('id', moto.id).single()
          : Promise.resolve({ data: null }),
        supabase.from('avaliacoes').select('quanto_pede, valor_fechamento, avaliador_id').eq('id', item.id).maybeSingle(),
        supabase.from('estoque').select('status, observacoes').eq('avaliacao_id', item.id).maybeSingle(),
      ]);
      setCnhUrl(cnhRes.data?.cnh_url || null);
      setCrlvUrl(crlvRes.data?.crlv_url || null);
      setQuantoPede(avRes.data?.quanto_pede ?? null);
      setValorFechamento(avRes.data?.valor_fechamento ?? null);
      setEstoqueStatus(estRes.data ? { status: estRes.data.status, observacoes: estRes.data.observacoes } : null);

      // Fetch avaliador name
      if (avRes.data?.avaliador_id) {
        const { data: roleData } = await supabase.from('user_roles').select('nome').eq('user_id', avRes.data.avaliador_id).single();
        if (roleData?.nome) setAvaliadorNome(roleData.nome);
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

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
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
                {(atendimento as any)?.cpf_cnpj && <InfoItem label="CPF/CNPJ" value={(atendimento as any).cpf_cnpj} />}
                {(atendimento as any)?.email && <InfoItem label="E-mail" value={(atendimento as any).email} />}
                {(atendimento as any)?.cep && <InfoItem label="CEP" value={(atendimento as any).cep} />}
                {(atendimento as any)?.endereco && <InfoItem label="Endereço" value={(atendimento as any).endereco} />}
              </div>
              <Separator className="my-2" />
              <DocumentUpload
                label="CNH"
                currentUrl={cnhUrl}
                bucketPath={atendimento?.id ? `cnh/${atendimento.id}` : ''}
                onUploaded={(url) => {
                  setCnhUrl(url);
                  if (atendimento?.id) {
                    supabase.from('atendimentos').update({ cnh_url: url }).eq('id', atendimento.id);
                  }
                }}
                onRemoved={() => {
                  setCnhUrl(null);
                  if (atendimento?.id) {
                    supabase.from('atendimentos').update({ cnh_url: null }).eq('id', atendimento.id);
                  }
                }}
              />
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
                {estoqueStatus && ['indisponivel', 'indisponivel_manual', 'bloqueio_juridico'].includes(estoqueStatus.status) && (
                  <>
                    <Separator className="my-2" />
                    <div className="space-y-1.5">
                      <Badge variant="outline" className={`text-xs gap-1 ${
                        estoqueStatus.status === 'indisponivel' ? 'border-orange-500 text-orange-600' :
                        estoqueStatus.status === 'indisponivel_manual' ? 'border-destructive text-destructive' :
                        'border-muted-foreground text-muted-foreground'
                      }`}>
                        {estoqueStatus.status === 'indisponivel' && 'Serviço'}
                        {estoqueStatus.status === 'indisponivel_manual' && <><AlertTriangle className="h-3 w-3" /> Indisponível</>}
                        {estoqueStatus.status === 'bloqueio_juridico' && <><ShieldAlert className="h-3 w-3" /> Bloqueio Jurídico</>}
                      </Badge>
                      {estoqueStatus.observacoes && (
                        <p className={`text-xs italic rounded p-2 ${
                          estoqueStatus.status === 'indisponivel' ? 'text-orange-600 bg-orange-500/10' :
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
                      supabase.from('motos_avaliacao').update({ crlv_url: url }).eq('id', moto.id);
                    }
                  }}
                  onRemoved={() => {
                    setCrlvUrl(null);
                    if (moto.id) {
                      supabase.from('motos_avaliacao').update({ crlv_url: null }).eq('id', moto.id);
                    }
                  }}
                />
                <Separator className="my-3" />
                {(moto.tem_manual != null || moto.tem_chave_reserva != null || moto.manutencao_vencida != null) && (
                <div className="flex items-center gap-3 text-xs">
                  {moto.tem_manual != null && (
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${moto.tem_manual ? 'bg-green-500' : 'bg-red-500'}`} />
                    Manual
                  </span>
                  )}
                  {moto.tem_chave_reserva != null && (
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${moto.tem_chave_reserva ? 'bg-green-500' : 'bg-red-500'}`} />
                    Chave Reserva
                  </span>
                  )}
                  {moto.manutencao_vencida != null && (
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${moto.manutencao_vencida ? 'bg-red-500' : 'bg-green-500'}`} />
                    Revisão
                  </span>
                  )}
                </div>
                )}
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
          motoAvaliacaoId={item.moto_avaliacao_id}
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
    </div>
  );
};

export default AvaliacaoProcessDetail;
