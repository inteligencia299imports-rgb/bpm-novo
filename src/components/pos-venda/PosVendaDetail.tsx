import React, { useState, useEffect } from 'react';
import { getTipoAquisicaoLabel } from '@/lib/tipoAquisicao';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, User, Phone, MapPin, Bike, DollarSign, Store, MessageCircle, Tag, Eye, ClipboardList, Clock, AlertTriangle, ShieldAlert, IdCard, FileText, Camera } from 'lucide-react';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import type { MotoFoto } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { POS_VENDA_COLUMNS, INTERESSES } from '@/types/crm';
import DocumentUpload from '@/components/showroom/DocumentUpload';

import DetailSkeleton from '@/components/shared/DetailSkeleton';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProcessoDialog from './ProcessoDialog';
import ContratoDialog from '@/components/showroom/ContratoDialog';
import ContratoConsignanteDialog from '@/components/intermediacao/ContratoConsignanteDialog';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { formatPersonName } from '@/lib/utils';
import { ESTOQUE_MOTO_SELECT, mapEstoqueMoto, fetchLojaMap } from '@/lib/estoqueMoto';

interface Props {
  item: any;
  onClose: () => void;
  statusColumns?: { value: string; label: string; hex: string }[];
  statusField?: string;
  processoProps?: {
    customEtapas?: string[];
    statusField?: string;
    statusRules?: {
      concluded?: string;
      special?: { etapa: string; status: string };
      default?: string;
    };
    showContratoConsignante?: boolean;
  };
  onStatusChanged?: (itemId: string, newStatus: string, field: string) => void;
  onNavigateToPosCompra?: (avaliacaoId: string) => void;
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

const PosVendaDetail: React.FC<Props> = ({ item, onClose, statusColumns, statusField = 'pos_venda_status', processoProps, onStatusChanged, onNavigateToPosCompra }) => {
  const [motosInteresse, setMotosInteresse] = useState<any[]>([]);
  const [motosAvaliacao, setMotosAvaliacao] = useState<any[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<string, any>>({});
  const [estoqueData, setEstoqueData] = useState<Record<string, any>>({});
  const [proprietario, setProprietario] = useState<any>(null);
  const [motoConsignada, setMotoConsignada] = useState<any>(null);
  const [avaliacaoConsignada, setAvaliacaoConsignada] = useState<any>(null);
  const [fotosConsignada, setFotosConsignada] = useState<MotoFoto[]>([]);
  const [showPhotosDialogConsignada, setShowPhotosDialogConsignada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewAvaliacaoData, setViewAvaliacaoData] = useState<any>(null);
  const [processoOpen, setProcessoOpen] = useState(false);
  const [nfeVendaOpen, setNfeVendaOpen] = useState(false);
  const [contratoConsignanteOpen, setContratoConsignanteOpen] = useState(false);
  const [intermHistory, setIntermHistory] = useState<any[]>([]);
  const [vendedorNome, setVendedorNome] = useState<string | null>(null);
  const [avaliadorNome, setAvaliadorNome] = useState<string | null>(null);

  const refreshConsignada = async () => {
    const consignadaEstoque = Object.values(estoqueData).find((e: any) => e.tipo === 'consignada');
    if (consignadaEstoque?.avaliacao_id) {
      const { data: avalData } = await supabase
        .from('avaliacoes')
        .select('*, atendimentos_motos!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, sexo, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro, uf)))')
        .eq('id', consignadaEstoque.avaliacao_id)
        .single();
      if (avalData) {
        setAvaliacaoConsignada(avalData);
        setMotoConsignada(avalData);
        const { data: fotosData } = await supabase.from('moto_fotos').select('*').eq('avaliacao_id', avalData.id);
        if (fotosData) setFotosConsignada(fotosData);
      }
    }
  };

  const moto = item.avaliacoes?.[0];
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [crlvUrl, setCrlvUrl] = useState<string | null>(moto?.crlv_url || null);
  const [estoqueCrlvUrls, setEstoqueCrlvUrls] = useState<Record<string, string | null>>({});
  const cols = statusColumns || POS_VENDA_COLUMNS;
  const statusCol = cols.find(c => c.value === ((item as any)[statusField] || 'em_aberto'));
  const int = INTERESSES.find(i => i.value === item.interesse);
  const isIntermParte1 = !!processoProps?.showContratoConsignante;
  const displayClient = isIntermParte1 && proprietario ? proprietario : item;
  const displayName = formatPersonName(displayClient.cliente?.nome_razao_social || '');
  const displayPhone = displayClient.cliente?.telefone || '';
  const whatsappUrl = displayPhone ? `https://wa.me/55${displayPhone.replace(/\D/g, '')}` : '';

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);

      if (!processoProps?.showContratoConsignante && (item as any).cliente_id) {
        supabase.from('clientes_fornecedores_documentos').select('arquivo_url').eq('cliente_fornecedor_id', (item as any).cliente_id).eq('tipo_documento', 'cnh').maybeSingle()
          .then(({ data }) => setCnhUrl(data?.arquivo_url || null));
      }

      // Step 1: All initial queries in parallel
      const [resInt, resAval] = await Promise.all([
        supabase.from('motos_interesse').select('*').eq('atendimento_id', item.id),
        supabase.from('avaliacoes').select('*').eq('atendimento_id', item.id),
      ]);

      const motosInt = resInt.data || [];
      setMotosInteresse(motosInt);
      const motosAv = resAval.data || [];
      setMotosAvaliacao(motosAv);

      // Prepare IDs for parallel step 2
      const estoqueIds = motosInt.filter((m: any) => m.origem === 'estoque' && m.estoque_moto_id).map((m: any) => m.estoque_moto_id!);
      const avaliadorIds = [...new Set((resAval.data || []).map((av: any) => av.avaliador_id).filter(Boolean))];

      // Step 2: Estoque + Avaliador names in parallel
      const vendedorPromise = item.vendedor_id
        ? (supabase as any).from('user_roles').select('nome').eq('user_id', item.vendedor_id).single()
        : Promise.resolve({ data: null as any });
      const [estoqueResult, rolesResult, vendedorResult, lojaMap] = await Promise.all([
        estoqueIds.length > 0 ? supabase.from('estoque_motos').select(ESTOQUE_MOTO_SELECT).in('id', estoqueIds) : Promise.resolve({ data: [] as any[] }),
        avaliadorIds.length > 0 ? (supabase as any).from('user_roles').select('user_id, nome').in('user_id', avaliadorIds) : Promise.resolve({ data: [] as any[] }),
        vendedorPromise,
        fetchLojaMap(),
      ]);

      if (vendedorResult.data?.nome) setVendedorNome(vendedorResult.data.nome);

      // Process estoque
      const estoqueMap: Record<string, any> = {};
      const crlvMap: Record<string, string | null> = {};
      (estoqueResult.data || []).forEach((raw: any) => {
        const est = mapEstoqueMoto(raw, lojaMap);
        estoqueMap[est.id] = est;
        if (raw.avaliacao?.id) crlvMap[raw.avaliacao.id] = raw.avaliacao.crlv_url || null;
      });
      setEstoqueData(estoqueMap);
      setEstoqueCrlvUrls(crlvMap);

      // Process avaliacoes with avaliador names
      const avaliadorNames: Record<string, string> = {};
      (rolesResult.data || []).forEach((r: any) => { avaliadorNames[r.user_id] = r.nome; });
      const avalMap: Record<string, any> = {};
      (resAval.data || []).forEach((av: any) => {
        avalMap[av.id] = { ...av, avaliador_nome: avaliadorNames[av.avaliador_id] || null };
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
            .select('*, atendimentos_motos!inner(id, loja_id, loja_empresas:loja_id(loja), cliente_id, cliente:clientes_fornecedores(nome_razao_social, telefone, sexo, cpf_cnpj, email, clientes_fornecedores_enderecos(cep, logradouro, uf)))')
            .eq('id', consignadaEstoque.avaliacao_id)
            .single();
          if (avalData) {
            setAvaliacaoConsignada(avalData);
            setMotoConsignada(avalData);
            const { data: fotosData } = await supabase.from('moto_fotos').select('*').eq('avaliacao_id', avalData.id);
            if (fotosData) setFotosConsignada(fotosData);
            const owner = (avalData as any).atendimentos_motos;
            if (owner) {
              setProprietario({ ...owner, loja: owner.loja_empresas?.loja, id: owner.id || avalData.atendimento_id });
              if (owner.cliente_id) {
                const { data: cnhDoc } = await supabase.from('clientes_fornecedores_documentos').select('arquivo_url').eq('cliente_fornecedor_id', owner.cliente_id).eq('tipo_documento', 'cnh').maybeSingle();
                setCnhUrl(cnhDoc?.arquivo_url || null);
              }
            }
            // Fetch avaliador name
            if (avalData.avaliador_id) {
              const { data: avaliadorRole } = await (supabase as any).from('user_roles').select('nome').eq('user_id', avalData.avaliador_id).single();
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

  // Contratos abrem como página (não como pop-up).
  if (!isIntermParte1 && nfeVendaOpen) {
    return (
      <ContratoDialog
        open
        onOpenChange={setNfeVendaOpen}
        modo="nfe"
        atendimento={item}
        motosInteresse={motosInteresse}
        motosAvaliacao={motosAvaliacao}
        estoqueData={estoqueData}
        avaliacoes={avaliacoes}
      />
    );
  }
  if (isIntermParte1 && contratoConsignanteOpen) {
    return (
      <ContratoConsignanteDialog
        open
        onOpenChange={setContratoConsignanteOpen}
        atendimentoId={item.id}
        onSaved={refreshConsignada}
      />
    );
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
              {format(new Date(Object.values(estoqueData).find((e: any) => e.data_venda)?.data_venda || item.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
                {!isIntermParte1 && <InfoItem label="Sexo" value={displayClient.cliente?.sexo} />}
                {!isIntermParte1 && <InfoItem label="UF" value={displayClient.cliente?.clientes_fornecedores_enderecos?.[0]?.uf} />}
                {isIntermParte1 && proprietario?.loja && <InfoItem label="Loja" value={proprietario.loja} />}
                {displayClient.cliente?.cpf_cnpj && <InfoItem label="CPF/CNPJ" value={formatCpfCnpj(displayClient.cliente.cpf_cnpj)} />}
                {displayClient.cliente?.email && <InfoItem label="E-mail" value={displayClient.cliente.email} />}
                {displayClient.cliente?.clientes_fornecedores_enderecos?.[0]?.cep && <InfoItem label="CEP" value={formatCep(displayClient.cliente.clientes_fornecedores_enderecos[0].cep)} />}
                {displayClient.cliente?.clientes_fornecedores_enderecos?.[0]?.logradouro && <InfoItem label="Endereço" value={displayClient.cliente.clientes_fornecedores_enderecos[0].logradouro} />}
              </div>
              {cnhUrl && (
                <>
                  <Separator className="my-2" />
                  <span className="text-xs text-green-600 font-medium">CNH anexada</span>
                </>
              )}
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
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Dados da Moto
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
                  <InfoItem label="Marca" value={motoConsignada.marca} />
                  <InfoItem label="Modelo" value={(motoConsignada.modelo || '').toUpperCase()} />
                  {motoConsignada.ano_fabricacao && <InfoItem label="Ano Fabricação" value={motoConsignada.ano_fabricacao} />}
                  {motoConsignada.ano_modelo && <InfoItem label="Ano Modelo" value={motoConsignada.ano_modelo} />}
                  {motoConsignada.categoria && <InfoItem label="Categoria" value={<span className="uppercase">{motoConsignada.categoria}</span>} />}
                  {motoConsignada.cor && <InfoItem label="Cor" value={<span className="uppercase">{motoConsignada.cor}</span>} />}
                  {motoConsignada.placa && <InfoItem label="Placa" value={motoConsignada.placa.replace(/-/g, '')} />}
                  {motoConsignada.km && <InfoItem label="KM" value={formatKm(motoConsignada.km)} />}
                  {motoConsignada.observacoes && (
                    <div className="col-span-2">
                      <InfoItem label="Observações" value={motoConsignada.observacoes} />
                    </div>
                  )}
                </div>
                <MaintenanceBadges
                  temManual={motoConsignada.tem_manual}
                  temChaveReserva={motoConsignada.tem_chave_reserva}
                  manutencaoVencida={motoConsignada.manutencao_vencida}
                />
                {motoConsignada.id && (
                  <>
                    <Separator className="mt-auto" />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className={`flex-1 gap-1.5 ${fotosConsignada.length > 0 ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`} onClick={() => setShowPhotosDialogConsignada(true)}>
                        <Camera className="h-4 w-4" /> {fotosConsignada.length > 0 ? `Fotos (${fotosConsignada.length}) ✓` : 'Fotos'}
                      </Button>
                      <DocumentUpload
                        label="CRLV"
                        className="flex-1"
                        currentUrl={motoConsignada.crlv_url || null}
                        bucketPath={`docs/${motoConsignada.id}/crlv`}
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ crlv_url: url } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, crlv_url: url });
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ crlv_url: null } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, crlv_url: null });
                        }}
                      />
                      <DocumentUpload
                        label="ATPV"
                        className="flex-1"
                        currentUrl={motoConsignada.atpv_url || null}
                        bucketPath={`docs/${motoConsignada.id}/atpv`}
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ atpv_url: url } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, atpv_url: url });
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ atpv_url: null } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, atpv_url: null });
                        }}
                      />
                      <DocumentUpload
                        label="Procuração"
                        className="flex-1"
                        currentUrl={motoConsignada.procuracao_url || null}
                        bucketPath={`docs/${motoConsignada.id}/procuracao`}
                        onUploaded={async (url) => {
                          await supabase.from('avaliacoes').update({ procuracao_url: url } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, procuracao_url: url });
                        }}
                        onRemoved={async () => {
                          await supabase.from('avaliacoes').update({ procuracao_url: null } as any).eq('id', motoConsignada.id);
                          setMotoConsignada({ ...motoConsignada, procuracao_url: null });
                        }}
                      />
                    </div>
                  </>
                )}
                {(avaliacaoConsignada?.quanto_pede != null || avaliacaoConsignada?.valor_fechamento != null) && (
                  <>
                    <Separator />
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
                            {estItem.valor_sinal != null && (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor do Sinal</p>
                                  <p className="font-semibold text-amber-600">{formatCurrency(estItem.valor_sinal)}</p>
                                </div>
                              </div>
                            )}
                            {estItem.valor_venda != null && (
                              <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Valor de Venda</p>
                                    <p className="font-semibold text-primary">{formatCurrency(estItem.valor_venda)}</p>
                                  </div>
                                  {estItem.preco_acao != null && (
                                    <div className="text-right">
                                      <p className="text-xs text-muted-foreground">Diferença (Venda - Ação)</p>
                                      {(() => {
                                        const diff = (estItem.valor_venda || 0) - (estItem.preco_acao || 0);
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
                          {estItem.avaliacoes?.id && (
                            <div>
                              <DocumentUpload
                                label="CRLV"
                                currentUrl={estoqueCrlvUrls[estItem.avaliacoes.id] ?? estItem.avaliacoes.crlv_url ?? null}
                                bucketPath={`docs/${estItem.avaliacoes.id}/crlv`}
                                onUploaded={async (url) => {
                                  const maId = estItem.avaliacoes.id;
                                  await supabase.from('avaliacoes').update({ crlv_url: url } as any).eq('id', maId);
                                  setEstoqueCrlvUrls((prev) => ({ ...prev, [maId]: url }));
                                }}
                                onRemoved={async () => {
                                  const maId = estItem.avaliacoes.id;
                                  await supabase.from('avaliacoes').update({ crlv_url: null } as any).eq('id', maId);
                                  setEstoqueCrlvUrls((prev) => ({ ...prev, [maId]: null }));
                                }}
                              />
                            </div>
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
          <AtendimentoObservacoes idOperacao={item.id} />

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

      {/* Dialog Fotos */}
      <Dialog open={showPhotosDialogConsignada} onOpenChange={setShowPhotosDialogConsignada}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Fotos da Moto
            </DialogTitle>
          </DialogHeader>
          {fotosConsignada.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {fotosConsignada.map(f => (
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
            <Button size="sm" variant="outline" onClick={() => setShowPhotosDialogConsignada(false)}>Fechar</Button>
          </div>
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
        onEmitirNfe={() => { setProcessoOpen(false); setNfeVendaOpen(true); }}
        onNavigateToPosCompra={onNavigateToPosCompra}
      />

    </div>
  );
};

export default PosVendaDetail;
