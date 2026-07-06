import React, { useState, useEffect } from 'react';
import { getTipoAquisicaoLabel } from '@/lib/tipoAquisicao';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Phone, MapPin, Bike, DollarSign, Store, MessageCircle, Tag, Eye, ClipboardList, Clock, AlertTriangle, ShieldAlert, IdCard, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { POS_VENDA_COLUMNS, INTERESSES } from '@/types/crm';
import DocumentUpload from '@/components/showroom/DocumentUpload';

import DetailSkeleton from '@/components/shared/DetailSkeleton';
import ObservacoesProcesso from '@/components/shared/ObservacoesProcesso';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProcessoDialog from './ProcessoDialog';
import ContratoConsignanteDialog from '@/components/intermediacao/ContratoConsignanteDialog';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { formatPersonName } from '@/lib/utils';

interface Props {
  item: any;
  onClose: () => void;
  statusColumns?: { value: string; label: string; hex: string }[];
  statusField?: string;
  processoProps?: {
    customEtapas?: string[];
    statusField?: string;
    observacoesField?: string;
    statusRules?: {
      concluded?: string;
      special?: { etapa: string; status: string };
      default?: string;
    };
    showContratoConsignante?: boolean;
  };
  onStatusChanged?: (itemId: string, newStatus: string, field: string) => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
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

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  value ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-semibold">{value || '-'}</span>
    </div>
  ) : null
);

const PosVendaDetail: React.FC<Props> = ({ item, onClose, statusColumns, statusField = 'pos_venda_status', processoProps, onStatusChanged }) => {
  const [motosInteresse, setMotosInteresse] = useState<any[]>([]);
  const [motosAvaliacao, setMotosAvaliacao] = useState<any[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<string, any>>({});
  const [estoqueData, setEstoqueData] = useState<Record<string, any>>({});
  const [proprietario, setProprietario] = useState<any>(null);
  const [motoConsignada, setMotoConsignada] = useState<any>(null);
  const [avaliacaoConsignada, setAvaliacaoConsignada] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewAvaliacaoData, setViewAvaliacaoData] = useState<any>(null);
  const [processoOpen, setProcessoOpen] = useState(false);
  const [contratoConsignanteOpen, setContratoConsignanteOpen] = useState(false);
  const [intermHistory, setIntermHistory] = useState<any[]>([]);
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [avaliadorNome, setAvaliadorNome] = useState<string | null>(null);

  const refreshConsignada = async () => {
    const consignadaEstoque = Object.values(estoqueData).find((e: any) => e.tipo === 'consignada');
    if (consignadaEstoque?.avaliacao_id) {
      const { data: avalData } = await supabase
        .from('avaliacoes')
        .select('*, motos_avaliacao(*), atendimentos!inner(id, nome_cliente, telefone, loja, cnh_url, cpf_cnpj, email, cep, endereco)')
        .eq('id', consignadaEstoque.avaliacao_id)
        .single();
      if (avalData) {
        setAvaliacaoConsignada(avalData);
        if (avalData.motos_avaliacao) setMotoConsignada(avalData.motos_avaliacao);
      }
    }
  };

  const moto = item.motos_avaliacao?.[0];
  const [cnhUrl, setCnhUrl] = useState<string | null>(item.cnh_url || null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(moto?.crlv_url || null);
  const cols = statusColumns || POS_VENDA_COLUMNS;
  const statusCol = cols.find(c => c.value === ((item as any)[statusField] || 'em_aberto'));
  const int = INTERESSES.find(i => i.value === item.interesse);
  const isIntermParte1 = !!processoProps?.showContratoConsignante;
  const displayClient = isIntermParte1 && proprietario ? proprietario : item;
  const displayName = formatPersonName(displayClient.nome_cliente);
  const displayPhone = displayClient.telefone;
  const whatsappUrl = displayPhone ? `https://wa.me/55${displayPhone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);

      // Step 1: All initial queries in parallel
      const [resInt, resAv, resAval] = await Promise.all([
        supabase.from('motos_interesse').select('*').eq('atendimento_id', item.id),
        supabase.from('motos_avaliacao').select('*').eq('atendimento_id', item.id),
        supabase.from('avaliacoes').select('*').eq('atendimento_id', item.id),
      ]);

      const motosInt = resInt.data || [];
      setMotosInteresse(motosInt);
      const motosAv = resAv.data || [];
      setMotosAvaliacao(motosAv);

      // Prepare IDs for parallel step 2
      const estoqueIds = motosInt.filter((m: any) => m.origem === 'estoque' && m.estoque_moto_id).map((m: any) => m.estoque_moto_id!);
      const avaliadorIds = [...new Set((resAval.data || []).map((av: any) => av.avaliador_id).filter(Boolean))];

      // Step 2: Estoque + Avaliador names in parallel
      const vendedorPromise = item.vendedor_id
        ? (supabase as any).from('user_roles_motos').select('nome').eq('user_id', item.vendedor_id).single()
        : Promise.resolve({ data: null as any });
      const [estoqueResult, rolesResult, vendedorResult] = await Promise.all([
        estoqueIds.length > 0 ? supabase.from('estoque').select('*, motos_avaliacao(crlv_url)').in('id', estoqueIds) : Promise.resolve({ data: [] as any[] }),
        avaliadorIds.length > 0 ? (supabase as any).from('user_roles_motos').select('user_id, nome').in('user_id', avaliadorIds) : Promise.resolve({ data: [] as any[] }),
        vendedorPromise,
      ]);

      if (vendedorResult.data?.nome) setVendedorNome(vendedorResult.data.nome);

      // Process estoque
      const estoqueMap: Record<string, any> = {};
      (estoqueResult.data || []).forEach((est: any) => { estoqueMap[est.id] = est; });
      setEstoqueData(estoqueMap);

      // Process avaliacoes with avaliador names
      const avaliadorNames: Record<string, string> = {};
      (rolesResult.data || []).forEach((r: any) => { avaliadorNames[r.user_id] = r.nome; });
      const avalMap: Record<string, any> = {};
      (resAval.data || []).forEach((av: any) => {
        avalMap[av.moto_avaliacao_id] = { ...av, avaliador_nome: avaliadorNames[av.avaliador_id] || null };
      });
      setAvaliacoes(avalMap);

      // Set avaliador name from first avaliação (for non-parte1 intermediação)
      if (!processoProps?.showContratoConsignante) {
        const firstAval = Object.values(avalMap)[0] as any;
        if (firstAval?.avaliador_nome) setAvaliadorNome(firstAval.avaliador_nome);
      }

      // Step 3: Consignada owner (Intermediação Parte 1) - single query with joins
      if (processoProps?.showContratoConsignante) {
        const consignadaEstoque = Object.values(estoqueMap).find((e: any) => e.tipo === 'consignada');
        if (consignadaEstoque?.avaliacao_id) {
          const { data: avalData } = await supabase
            .from('avaliacoes')
            .select('*, motos_avaliacao(*), atendimentos!inner(id, nome_cliente, telefone, loja, cnh_url, cpf_cnpj, email, cep, endereco)')
            .eq('id', consignadaEstoque.avaliacao_id)
            .single();
          if (avalData) {
            setAvaliacaoConsignada(avalData);
            if (avalData.motos_avaliacao) setMotoConsignada(avalData.motos_avaliacao);
            const owner = (avalData as any).atendimentos;
            if (owner) {
              setProprietario({ ...owner, id: owner.id || avalData.atendimento_id });
              setCnhUrl(owner.cnh_url || null);
            }
            // Fetch avaliador name
            if (avalData.avaliador_id) {
              const { data: avaliadorRole } = await (supabase as any).from('user_roles_motos').select('nome').eq('user_id', avalData.avaliador_id).single();
              if (avaliadorRole?.nome) setAvaliadorNome(avaliadorRole.nome);
            }
          }
        }
      }

      // Fetch intermediação history (sale date + contract generation)
      if (processoProps?.showContratoConsignante) {
        const { data: histData } = await supabase
          .from('status_history')
          .select('*')
          .eq('entity_id', item.id)
          .in('entity_type', ['showroom', 'contrato_consignante'])
          .order('created_at', { ascending: false });
        // Filter to only show vendido + contrato gerado events
        const filtered = (histData || []).filter((h: any) =>
          h.status === 'vendido' || h.status?.startsWith('CONTRATO GERADO')
        );
        setIntermHistory(filtered);
      }

      setLoading(false);
    };
    fetchRelated();
  }, [item.id]);

  if (loading) {
    return <DetailSkeleton onClose={onClose} />;
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
              <h1 className="text-lg sm:text-xl font-bold truncate">{displayName}</h1>
              {statusCol && <Badge className="text-[10px] shrink-0" style={{ backgroundColor: `${statusCol.hex}20`, color: statusCol.hex }}>{statusCol.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(item.data_venda || item.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isIntermParte1 && (
              <Button size="sm" variant="outline" onClick={() => setContratoConsignanteOpen(true)} className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                <DollarSign className="h-4 w-4" /> Pagamento
              </Button>
            )}
            <Button size="sm" onClick={() => setProcessoOpen(true)} className="gap-1.5">
              <ClipboardList className="h-4 w-4" /> Processo
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> {isIntermParte1 ? 'Dados do Proprietário' : 'Dados do Cliente'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={displayName} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{formatPhone(displayPhone)}</span>
                    {whatsappUrl && (
                      <button onClick={() => window.open(whatsappUrl, '_blank')} className="text-green-600 hover:text-green-700 transition-colors" title="Abrir WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {!isIntermParte1 && <InfoItem label="Sexo" value={item.sexo} />}
                {!isIntermParte1 && <InfoItem label="UF" value={item.uf} />}
                {isIntermParte1 && proprietario?.loja && <InfoItem label="Loja" value={proprietario.loja} />}
                {(displayClient as any)?.cpf_cnpj && <InfoItem label="CPF/CNPJ" value={formatCpfCnpj((displayClient as any).cpf_cnpj)} />}
                {(displayClient as any)?.email && <InfoItem label="E-mail" value={(displayClient as any).email} />}
                {(displayClient as any)?.cep && <InfoItem label="CEP" value={formatCep((displayClient as any).cep)} />}
                {(displayClient as any)?.endereco && <InfoItem label="Endereço" value={(displayClient as any).endereco} />}
              </div>
              <Separator className="my-2" />
              <DocumentUpload
                label="CNH"
                currentUrl={cnhUrl}
                bucketPath={`docs/${isIntermParte1 && proprietario?.id ? proprietario.id : item.id}/cnh`}
                onUploaded={async (url) => {
                  const targetId = isIntermParte1 && proprietario?.id ? proprietario.id : item.id;
                  await supabase.from('atendimentos').update({ cnh_url: url } as any).eq('id', targetId);
                  setCnhUrl(url);
                }}
                onRemoved={async () => {
                  const targetId = isIntermParte1 && proprietario?.id ? proprietario.id : item.id;
                  await supabase.from('atendimentos').update({ cnh_url: null } as any).eq('id', targetId);
                  setCnhUrl(null);
                }}
              />
            </CardContent>
          </Card>

          {/* Dados do Atendimento - hidden for Intermediação Parte 1 */}
          {!isIntermParte1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" /> Dados do Atendimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vendedorNome && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                    <IdCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{vendedorNome}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Loja" value={item.loja} />
                  <InfoItem label="Tipo de Atendimento" value={item.tipo_atendimento} />
                  <InfoItem label="Interesse" value={int?.label} />
                  <InfoItem label="Origem" value={item.origem} />
                  <InfoItem label="Temperatura" value={item.temperatura} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dados da Moto - for Intermediação Parte 1 (same layout as consignação) */}
          {isIntermParte1 && motoConsignada && (
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
                  <InfoItem label="Marca / Modelo" value={`${motoConsignada.marca} ${(motoConsignada.modelo || '').toUpperCase()}`} />
                  {motoConsignada.placa && <InfoItem label="Placa" value={motoConsignada.placa.replace(/-/g, '')} />}
                  {motoConsignada.km && <InfoItem label="KM" value={formatKm(motoConsignada.km)} />}
                  {(motoConsignada.ano_fabricacao || motoConsignada.ano_modelo) && (
                    <InfoItem label="Ano" value={[motoConsignada.ano_fabricacao, motoConsignada.ano_modelo].filter(Boolean).join('/')} />
                  )}
                  {motoConsignada.cor && <InfoItem label="Cor" value={<span className="uppercase">{motoConsignada.cor}</span>} />}
                  {motoConsignada.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{motoConsignada.categoria}</span>} />}
                </div>
                {motoConsignada.crlv_url && (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => window.open(motoConsignada.crlv_url, '_blank')} className="gap-2">
                      <FileText className="h-4 w-4" /> Ver CRLV
                    </Button>
                  </div>
                )}
                {motoConsignada.observacoes && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs text-muted-foreground italic">{motoConsignada.observacoes}</p>
                  </>
                )}
                {(avaliacaoConsignada?.quanto_pede != null || avaliacaoConsignada?.valor_fechamento != null) && (
                  <>
                    <Separator className="my-3" />
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="grid grid-cols-2 gap-4">
                        {avaliacaoConsignada.quanto_pede != null && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Quanto Pede</span>
                            <p className="text-base font-semibold text-primary">{formatCurrency(avaliacaoConsignada.quanto_pede)}</p>
                          </div>
                        )}
                        {avaliacaoConsignada.valor_fechamento != null && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Valor Fechamento</span>
                            <p className="text-base font-semibold text-primary">{formatCurrency(avaliacaoConsignada.valor_fechamento)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Moto de Interesse (a moto vendida do estoque) - hidden for Intermediação Parte 1 */}
          {!isIntermParte1 && motosInteresse.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Moto de Interesse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {avaliadorNome && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                    <IdCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{avaliadorNome}</span>
                  </div>
                )}
                {motosInteresse.map((mi: any, idx: number) => {
                  const isEstoque = mi.origem === 'estoque' && mi.estoque_moto_id;
                  const estItem = isEstoque ? estoqueData[mi.estoque_moto_id!] : null;
                  return (
                    <div key={mi.id} className="space-y-3">
                      {idx > 0 && <Separator className="my-3" />}
                      {estItem ? (
                        <>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-foreground">{estItem.marca} {estItem.modelo}</p>
                              <p className="text-xs text-muted-foreground">
                                {[estItem.ano_fabricacao, estItem.ano_modelo].filter(Boolean).join('/')}
                                {estItem.cilindrada ? ` · ${estItem.cilindrada}cc` : ''}
                              </p>
                            </div>
                            {!item.loja?.toLowerCase().startsWith('ducati') && (
                              <Badge variant="outline" className={`text-xs gap-1 ${
                                estItem.status === 'servico' ? 'border-orange-500 text-orange-600' :
                                estItem.status === 'indisponivel_manual' ? 'border-destructive text-destructive' :
                                estItem.status === 'bloqueio_juridico' ? 'border-muted-foreground text-muted-foreground' :
                                estItem.status === 'vendido' ? 'border-[#169d53] text-[#169d53]' :
                                estItem.status === 'sinal' ? 'border-[#b376c4] text-[#b376c4]' :
                                ''
                              }`}>
                                {estItem.status === 'indisponivel_manual' && <AlertTriangle className="h-3 w-3" />}
                                {estItem.status === 'bloqueio_juridico' && <ShieldAlert className="h-3 w-3" />}
                                {estItem.status === 'servico' ? 'Serviço' : estItem.status === 'indisponivel_manual' ? 'Indisponível' : estItem.status === 'bloqueio_juridico' ? 'Bloqueio Jurídico' : estItem.status === 'vendido' ? 'Vendido' : estItem.status === 'sinal' ? 'Sinal' : 'Estoque'}
                              </Badge>
                            )}
                          </div>
                          {item.loja?.toLowerCase().startsWith('ducati') ? (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {mi.chassi && (
                                <>
                                  <span className="text-muted-foreground">Chassi</span>
                                  <span className="font-medium text-foreground">{mi.chassi}</span>
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
                            <span className="text-foreground capitalize">{getTipoAquisicaoLabel(estItem.tipo) || estItem.tipo}</span>
                            {estItem.empresa && (
                              <>
                                <span className="text-muted-foreground">Empresa</span>
                                <span className="text-foreground">{estItem.empresa}</span>
                              </>
                            )}
                          </div>
                          )}
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
                            {item.valor_sinal != null && (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor do Sinal</p>
                                  <p className="font-semibold text-amber-600">{formatCurrency(item.valor_sinal)}</p>
                                </div>
                              </div>
                            )}
                            {item.valor_venda != null && (
                              <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Valor de Venda</p>
                                    <p className="font-semibold text-primary">{formatCurrency(item.valor_venda)}</p>
                                  </div>
                                  {estItem.preco_acao != null && (
                                    <div className="text-right">
                                      <p className="text-xs text-muted-foreground">Diferença (Venda - Ação)</p>
                                      {(() => {
                                        const diff = (item.valor_venda || 0) - (estItem.preco_acao || 0);
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
                          </div>
                          {estItem.observacoes && (
                            <p className="text-xs text-muted-foreground italic">{estItem.observacoes}</p>
                          )}
                        </>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {!item.loja?.toLowerCase().startsWith('ducati') && <InfoItem label="Origem" value="Externo" />}
                          <InfoItem label="Marca" value={mi.marca} />
                          <InfoItem label="Modelo" value={mi.modelo} />
                          <InfoItem label="Ano" value={mi.ano} />
                          {item.loja?.toLowerCase().startsWith('ducati') && mi.chassi && <InfoItem label="Chassi" value={mi.chassi} />}
                        </div>
                      )}
                    </div>
                  );
                })}
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

          {/* Observações do Processo */}
          <ObservacoesProcesso
            entityId={item.id}
            entityType={
              isIntermParte1 ? 'intermediacao_parte1' :
              statusField === 'intermediacao_parte2_status' ? 'intermediacao_parte2' :
              'pos_venda'
            }
          />

          {/* Histórico de Movimentações - Intermediação */}
          {isIntermParte1 && intermHistory.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Histórico de Movimentações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusTimeline
                  history={intermHistory}
                  formatLabel={(raw) => {
                    if (raw === 'vendido') return 'VENDA REALIZADA';
                    return raw.replace(/_/g, ' ');
                  }}
                />
              </CardContent>
            </Card>
          )}

        </div>
      </ScrollArea>

      {/* Avaliação Popup */}
      <Dialog open={!!viewAvaliacaoData} onOpenChange={() => setViewAvaliacaoData(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Resultado da Avaliação
            </DialogTitle>
          </DialogHeader>
          {viewAvaliacaoData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoItem label="Valor FIPE" value={formatCurrency(viewAvaliacaoData.valor_fipe)} />
                <InfoItem label="Menor Valor" value={formatCurrency(viewAvaliacaoData.menor_valor)} />
                <InfoItem label="Maior Valor" value={formatCurrency(viewAvaliacaoData.maior_valor)} />
                <InfoItem label="Quanto Pede" value={formatCurrency(viewAvaliacaoData.quanto_pede)} />
                <InfoItem label="Quanto Vende" value={formatCurrency(viewAvaliacaoData.quanto_vende)} />
                <InfoItem label="Avaliação Compra" value={formatCurrency(viewAvaliacaoData.avaliacao_compra)} />
                <InfoItem label="Custos Cliente" value={formatCurrency(viewAvaliacaoData.previsao_custos_cliente)} />
                <InfoItem label="Custos Loja" value={formatCurrency(viewAvaliacaoData.previsao_custos_loja)} />
                {viewAvaliacaoData.avaliacao_compra != null && viewAvaliacaoData.previsao_custos_loja != null && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Repasse Cliente</span>
                    <span className="text-sm font-bold text-primary">
                      {formatCurrency((viewAvaliacaoData.avaliacao_compra ?? 0) - (viewAvaliacaoData.previsao_custos_loja ?? 0))}
                    </span>
                  </div>
                )}
              </div>
              {viewAvaliacaoData.observacao_avaliador && (
                <>
                  <Separator />
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações do Avaliador</span>
                    <p className="text-sm mt-1">{viewAvaliacaoData.observacao_avaliador}</p>
                  </div>
                </>
              )}
              {viewAvaliacaoData.avaliador_nome && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Avaliador</span>
                  <p className="text-sm font-medium">{viewAvaliacaoData.avaliador_nome}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProcessoDialog
        open={processoOpen}
        onOpenChange={setProcessoOpen}
        atendimentoId={item.id}
        {...(processoProps || {})}
        onStatusChanged={(newStatus) => {
          onStatusChanged?.(item.id, newStatus, processoProps?.statusField || statusField);
        }}
        onContratoSaved={refreshConsignada}
      />

      {isIntermParte1 && (
        <ContratoConsignanteDialog
          open={contratoConsignanteOpen}
          onOpenChange={setContratoConsignanteOpen}
          atendimentoId={item.id}
          onSaved={refreshConsignada}
        />
      )}
    </div>
  );
};

export default PosVendaDetail;
