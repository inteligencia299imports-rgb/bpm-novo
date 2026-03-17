import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Edit, Trash2, Phone, MapPin, Tag, User, Thermometer, Store, Calendar, Bike, FileText, MessageCircle, Camera, Send, Sparkles, DollarSign, XCircle, Clock, Eye, Search, CheckCircle2 } from 'lucide-react';
import type { Atendimento, MotoInteresse, MotoAvaliacao, SituacaoShowroom } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import PhotoUpload from './PhotoUpload';
import DocumentUpload from './DocumentUpload';

interface Props {
  atendimento: Atendimento;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const formatKm = (km: string | null) => {
  if (!km) return null;
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR') + ' km';
};

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string): number => {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
};

const AtendimentoDetail: React.FC<Props> = ({ atendimento, onClose, onEdit, onDeleted }) => {
  const [motosInteresse, setMotosInteresse] = useState<MotoInteresse[]>([]);
  const [motosAvaliacao, setMotosAvaliacao] = useState<MotoAvaliacao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [photoMotoId, setPhotoMotoId] = useState<string | null>(null);
  const [viewAvaliacaoData, setViewAvaliacaoData] = useState<any>(null);
  const [cnhUrl, setCnhUrl] = useState<string | null>(atendimento.cnh_url || null);
  const [crlvUrls, setCrlvUrls] = useState<Record<string, string | null>>({});
  const [valorPopup, setValorPopup] = useState<{ valorSinal: string; valorVenda: string; valorFechamento: string } | null>(null);
  const [savingValor, setSavingValor] = useState(false);

  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);
      const [resInt, resAv, resAval] = await Promise.all([
        supabase.from('motos_interesse').select('*').eq('atendimento_id', atendimento.id),
        supabase.from('motos_avaliacao').select('*').eq('atendimento_id', atendimento.id),
        supabase.from('avaliacoes').select('*').eq('atendimento_id', atendimento.id),
      ]);
      setMotosInteresse((resInt.data as unknown as MotoInteresse[]) || []);
      const motosAv = (resAv.data as unknown as MotoAvaliacao[]) || [];
      setMotosAvaliacao(motosAv);
      
      // Init CRLV URLs from fetched data
      const crlvMap: Record<string, string | null> = {};
      for (const m of motosAv) {
        crlvMap[m.id] = (m as any).crlv_url || null;
      }
      setCrlvUrls(crlvMap);
      
      // Map avaliacoes by moto_avaliacao_id and fetch avaliador names
      const avalMap: Record<string, any> = {};
      if (resAval.data) {
        const avaliadorIds = [...new Set(resAval.data.map((av: any) => av.avaliador_id).filter(Boolean))];
        let avaliadorNames: Record<string, string> = {};
        if (avaliadorIds.length > 0) {
          const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', avaliadorIds);
          if (roles) {
            for (const r of roles) {
              avaliadorNames[r.user_id] = r.nome;
            }
          }
        }
        for (const av of resAval.data) {
          avalMap[(av as any).moto_avaliacao_id] = { ...av, avaliador_nome: avaliadorNames[(av as any).avaliador_id] || null };
        }
      }
      setAvaliacoes(avalMap);
      setLoading(false);
    };
    fetchRelated();
  }, [atendimento.id]);

  const handleDelete = async () => {
    await supabase.from('avaliacoes').delete().eq('atendimento_id', atendimento.id);
    await supabase.from('motos_interesse').delete().eq('atendimento_id', atendimento.id);
    const { data: motos } = await supabase.from('motos_avaliacao').select('id').eq('atendimento_id', atendimento.id);
    if (motos) {
      for (const m of motos) {
        await supabase.from('moto_fotos').delete().eq('moto_avaliacao_id', m.id);
      }
    }
    await supabase.from('motos_avaliacao').delete().eq('atendimento_id', atendimento.id);
    const { error } = await supabase.from('atendimentos').delete().eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao excluir atendimento');
    } else {
      toast.success('Atendimento excluído');
      onDeleted();
    }
  };

  const InfoItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    ) : null
  );

  const whatsappUrl = (() => {
    const digits = atendimento.telefone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  const handleStatusChange = async (value: SituacaoShowroom, label: string, extraData?: Record<string, any>) => {
    const updateData: any = { situacao: value, ...extraData };
    const { error } = await supabase.from('atendimentos').update(updateData).eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      toast.success(`Status alterado para ${label}`);

      // Sync: perdido no showroom → perdido nas avaliações
      if (value === 'perdido') {
        await supabase.from('avaliacoes').update({ situacao: 'perdido' }).eq('atendimento_id', atendimento.id);
      }
      // Sync: dispensada no showroom → dispensada nas avaliações
      if (value === 'dispensada') {
        await supabase.from('avaliacoes').update({ situacao: 'dispensada' }).eq('atendimento_id', atendimento.id);
      }

      onDeleted();
    }
  };

  const handleSaveValor = async () => {
    if (!valorPopup) return;
    const sinal = parseCurrencyInput(valorPopup.valorSinal);
    const venda = parseCurrencyInput(valorPopup.valorVenda);
    if (sinal <= 0 && venda <= 0) {
      toast.error('Informe ao menos um valor válido');
      return;
    }
    setSavingValor(true);
    const updateData: any = {};
    if (sinal > 0) updateData.valor_sinal = sinal;
    if (venda > 0) updateData.valor_venda = venda;
    // Determine status: if venda has value -> vendido, else sinal
    const newStatus = venda > 0 ? 'vendido' : 'sinal';
    const label = venda > 0 ? 'Vendido' : 'Sinal';
    await handleStatusChange(newStatus as SituacaoShowroom, label, updateData);

    // Se for troca e vendido, marcar todas as avaliações como adquirida/própria com valor de fechamento
    if (newStatus === 'vendido' && atendimento.interesse === 'trocar') {
      const fechamento = parseCurrencyInput(valorPopup.valorFechamento);
      for (const moto of motosAvaliacao) {
        const av = avaliacoes[moto.id];
        if (av) {
          const avUpdate: any = {
            situacao: 'adquirida',
            tipo_aquisicao: 'propria',
          };
          if (fechamento > 0) avUpdate.valor_fechamento = fechamento;
          await supabase.from('avaliacoes').update(avUpdate).eq('id', av.id);
        }
      }
    }

    setSavingValor(false);
    setValorPopup(null);
  };

  const isAvaliada = (motoId: string) => {
    const av = avaliacoes[motoId];
    return av && av.situacao !== 'sem_avaliar';
  };

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
              <h1 className="text-lg sm:text-xl font-bold truncate">{atendimento.nome_cliente}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => onEdit(atendimento.id)}>
            <Edit className="h-4 w-4" />
          </Button>
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
                <InfoItem label="Nome" value={atendimento.nome_cliente} />
                <div>
                  <span className="text-xs text-muted-foreground">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{formatPhone(atendimento.telefone)}</span>
                    <button
                      onClick={() => window.open(whatsappUrl, '_blank')}
                      className="text-green-600 hover:text-green-700 transition-colors"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <InfoItem label="Sexo" value={atendimento.sexo} />
                <InfoItem label="UF" value={atendimento.uf} />
              </div>
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
            </CardContent>
          </Card>

          {/* Dados do Atendimento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Dados do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Loja" value={atendimento.loja} />
                <InfoItem label="Tipo de Atendimento" value={atendimento.tipo_atendimento} />
                <InfoItem label="Interesse" value={int?.label} />
                <InfoItem label="Origem" value={atendimento.origem} />
                <InfoItem label="Temperatura" value={atendimento.temperatura} />
                <InfoItem label="Situação" value={sit?.label} />
              </div>
            </CardContent>
          </Card>

          {/* Motos de Interesse (Compra) */}
          {motosInteresse.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Moto de Interesse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {motosInteresse.map((moto, idx) => (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Origem" value={moto.origem === 'estoque' ? 'Estoque' : 'Externo'} />
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano" value={moto.ano} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Motos de Avaliação (Venda/Troca) */}
          {motosAvaliacao.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
                </CardTitle>
                {motosAvaliacao.some(m => m.enviada_avaliacao && !isAvaliada(m.id)) && (
                  <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 w-fit mt-1 gap-1">
                    <Clock className="h-3 w-3" /> Aguardando avaliação
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {motosAvaliacao.map((moto, idx) => (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />
                      <InfoItem label="Ano Modelo" value={moto.ano_modelo} />
                      <InfoItem label="Categoria" value={moto.categoria} />
                      <InfoItem label="Cor" value={moto.cor} />
                      <InfoItem label="Placa" value={moto.placa} />
                      <InfoItem label="KM" value={formatKm(moto.km)} />
                    </div>
                    {moto.observacoes && (
                      <div className="mt-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações da Moto</span>
                        <p className="text-sm mt-1">{moto.observacoes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPhotoMotoId(moto.id)}>
                        <Camera className="h-4 w-4" /> Incluir Fotos
                      </Button>
                      <DocumentUpload
                        label="CRLV"
                        currentUrl={crlvUrls[moto.id] || null}
                        bucketPath={`docs/${moto.id}/crlv`}
                        onUploaded={async (url) => {
                          await supabase.from('motos_avaliacao').update({ crlv_url: url } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: url }));
                        }}
                        onRemoved={async () => {
                          await supabase.from('motos_avaliacao').update({ crlv_url: null } as any).eq('id', moto.id);
                          setCrlvUrls(prev => ({ ...prev, [moto.id]: null }));
                        }}
                      />
                      {cnhUrl && crlvUrls[moto.id] && !(moto as any).consulta_realizada && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={async () => {
                            await supabase.from('motos_avaliacao').update({ consulta_realizada: true } as any).eq('id', moto.id);
                            setMotosAvaliacao(prev => prev.map(m => m.id === moto.id ? { ...m, consulta_realizada: true } as any : m));
                            toast.success('Consulta documentacional realizada com sucesso!');
                          }}
                        >
                          <Search className="h-4 w-4" /> Solicitar Consulta
                        </Button>
                      )}
                      {(moto as any).consulta_realizada && (
                        <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-600 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Consulta Realizada
                        </Badge>
                      )}
                      {!moto.enviada_avaliacao ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={async () => {
                            const { error: avError } = await supabase.from('avaliacoes').insert({
                              atendimento_id: atendimento.id,
                              moto_avaliacao_id: moto.id,
                            });
                            if (avError) {
                              toast.error('Erro ao enviar para avaliação');
                              console.error(avError);
                              return;
                            }
                            const { error: mError } = await supabase
                              .from('motos_avaliacao')
                              .update({ enviada_avaliacao: true })
                              .eq('id', moto.id);
                            if (mError) {
                              toast.error('Erro ao atualizar moto');
                              console.error(mError);
                              return;
                            }
                            toast.success('Enviado para avaliação!');
                            setMotosAvaliacao(prev => prev.map(m => m.id === moto.id ? { ...m, enviada_avaliacao: true } : m));
                          }}
                        >
                          <Send className="h-4 w-4" /> Enviar para Avaliação
                        </Button>
                      ) : isAvaliada(moto.id) ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-green-500 text-green-600 hover:bg-green-50"
                            onClick={() => setViewAvaliacaoData(avaliacoes[moto.id])}
                          >
                            <Eye className="h-4 w-4" /> Avaliada - Ver Valores
                          </Button>
                          {avaliacoes[moto.id]?.situacao === 'adquirida' && avaliacoes[moto.id]?.tipo_aquisicao && (
                            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-600">
                              {avaliacoes[moto.id].tipo_aquisicao === 'propria' ? 'Própria' : 'Consignada'}
                            </Badge>
                          )}
                        </>
                      ) : (
                        null
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {atendimento.observacoes && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{atendimento.observacoes}</p>
              </CardContent>
            </Card>
          )}

          {/* Status Actions + Delete */}
           <div className="md:col-span-2 flex justify-center">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { value: 'pendente' as SituacaoShowroom, label: 'Pendente', icon: <Clock className="h-4 w-4" />, color: '#F2C94C' },
                { value: 'sinal' as SituacaoShowroom, label: 'Sinal', icon: <Sparkles className="h-4 w-4" />, color: '#9B51E0' },
                { value: 'vendido' as SituacaoShowroom, label: 'Vendido', icon: <DollarSign className="h-4 w-4" />, color: '#27AE60' },
                { value: 'perdido' as SituacaoShowroom, label: 'Perdido', icon: <XCircle className="h-4 w-4" />, color: '#FF3B30' },
                { value: 'dispensada' as SituacaoShowroom, label: 'Dispensada', icon: <XCircle className="h-4 w-4" />, color: '#FF8C00' },
              ]
                .filter(b => b.value !== atendimento.situacao)
                .filter(b => {
                  if (b.value === 'dispensada') return false;
                  if (atendimento.interesse === 'vender' && (b.value === 'sinal' || b.value === 'vendido')) {
                    return false;
                  }
                  if ((b.value === 'sinal' || b.value === 'vendido') && !motosInteresse.some(m => m.origem === 'estoque')) {
                    return false;
                  }
                  return true;
                })
                .map(btn => (
                  <Button
                    key={btn.value}
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full"
                    style={{ borderColor: btn.color, color: btn.color }}
                    onClick={() => {
                      if (btn.value === 'sinal' || btn.value === 'vendido') {
                        if (btn.value === 'vendido' && atendimento.interesse === 'trocar') {
                          const faltando: string[] = [];
                         if (!cnhUrl) faltando.push('CNH do cliente');
                          
                          const allCrlvs = motosAvaliacao.length > 0 && motosAvaliacao.every(m => crlvUrls[m.id]);
                          if (!allCrlvs) faltando.push('CRLV da moto');
                          
                          const allMotosAvaliadas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => isAvaliada(m.id));
                          if (!allMotosAvaliadas) faltando.push('Avaliação da moto ter sido feita');
                          
                          const allConsultas = motosAvaliacao.length > 0 && motosAvaliacao.every(m => (m as any).consulta_realizada);
                          if (!allConsultas) faltando.push('Consulta documentacional realizada');
                          
                          if (faltando.length > 0) {
                            toast.error(`Para marcar como Vendido, é necessário: ${faltando.join(', ')}`);
                            return;
                          }
                        }
                        setValorPopup({ valorSinal: '', valorVenda: '', valorFechamento: '' });
                      } else {
                        handleStatusChange(btn.value, btn.label);
                      }
                    }}
                  >
                    {btn.icon}
                    {btn.label}
                  </Button>
                ))}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2 w-full">
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O atendimento de <strong>{atendimento.nome_cliente}</strong> e todos os dados relacionados serão permanentemente excluídos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
           </div>
        </div>
      </ScrollArea>

      {/* Dialog de Fotos */}
      <Dialog open={!!photoMotoId} onOpenChange={(o) => !o && setPhotoMotoId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Fotos da Moto
            </DialogTitle>
          </DialogHeader>
          {photoMotoId && <PhotoUpload motoAvaliacaoId={photoMotoId} />}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setPhotoMotoId(null)}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Valores da Avaliação */}
      <Dialog open={!!viewAvaliacaoData} onOpenChange={(o) => !o && setViewAvaliacaoData(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="pb-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" /> Avaliação Comercial
            </DialogTitle>
            {viewAvaliacaoData?.avaliador_nome && (
              <p className="text-sm text-muted-foreground">
                Avaliado por <span className="font-medium text-foreground">{viewAvaliacaoData.avaliador_nome}</span>
              </p>
            )}
          </DialogHeader>
          {viewAvaliacaoData && (
            <div className="space-y-5 pt-2">
              {/* Consignação */}
              <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consignação</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-start">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Avaliação</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.avaliacao_consignacao)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Cliente</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_cliente)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Loja</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_loja)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-primary block mb-0.5 font-semibold">Repasse Cliente</span>
                    <p className="text-base font-bold text-primary">
                      {formatCurrency(
                        (viewAvaliacaoData.avaliacao_consignacao ?? 0) - (viewAvaliacaoData.previsao_custos_loja ?? 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Compra */}
              <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compra</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-start">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Avaliação</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.avaliacao_compra)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Cliente</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_cliente)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5">Custos Loja</span>
                    <p className="text-base font-semibold">{formatCurrency(viewAvaliacaoData.previsao_custos_loja)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-primary block mb-0.5 font-semibold">Repasse Cliente</span>
                    <p className="text-base font-bold text-primary">
                      {formatCurrency(
                        (viewAvaliacaoData.avaliacao_compra ?? 0) - (viewAvaliacaoData.previsao_custos_loja ?? 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] font-medium text-muted-foreground text-center">REPASSE CLIENTE = AVALIAÇÃO − CUSTOS LOJA</p>

              {/* Observação */}
              {viewAvaliacaoData.observacao_avaliador && (
                <>
                  <Separator />
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Observação do Avaliador</h4>
                    <p className="text-sm leading-relaxed">{viewAvaliacaoData.observacao_avaliador}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Dialog de Valor (Sinal/Venda) */}
      <Dialog open={!!valorPopup} onOpenChange={(o) => !o && setValorPopup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="h-5 w-5" /> Negociação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Valor do Sinal (R$)</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  className="pl-10"
                  placeholder="0,00"
                  value={valorPopup?.valorSinal || ''}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    setValorPopup(prev => prev ? { ...prev, valorSinal: formatted } : null);
                  }}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Valor da Venda (R$)</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  className="pl-10"
                  placeholder="0,00"
                  value={valorPopup?.valorVenda || ''}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    setValorPopup(prev => prev ? { ...prev, valorVenda: formatted } : null);
                  }}
                  inputMode="numeric"
                />
              </div>
            </div>
            {atendimento.interesse === 'trocar' && (
              <div>
                <label className="text-sm font-medium text-foreground">Valor de Fechamento da Moto do Cliente (R$)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    className="pl-10"
                    placeholder="0,00"
                    value={valorPopup?.valorFechamento || ''}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setValorPopup(prev => prev ? { ...prev, valorFechamento: formatted } : null);
                    }}
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}
            <Button
              className="w-full"
              onClick={handleSaveValor}
              disabled={savingValor}
            >
              {savingValor ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtendimentoDetail;