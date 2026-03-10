import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Save, Loader2, User, Store, Tag, DollarSign, Camera, Edit, MessageCircle, Phone } from 'lucide-react';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { SituacaoAvaliacao, Negociacao, MotoFoto } from '@/types/crm';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  avaliacaoId: string;
  onClose: () => void;
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

const AvaliacaoForm: React.FC<Props> = ({ avaliacaoId, onClose }) => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [showEvalDialog, setShowEvalDialog] = useState(false);
  const [showPhotosDialog, setShowPhotosDialog] = useState(false);
  const canEdit = role === 'avaliador' || role === 'gestor';

  // form fields
  const [valorFipe, setValorFipe] = useState('');
  const [menorValor, setMenorValor] = useState('');
  const [maiorValor, setMaiorValor] = useState('');
  const [quantoPede, setQuantoPede] = useState('');
  const [quantoVende, setQuantoVende] = useState('');
  const [quantoVendeErrado, setQuantoVendeErrado] = useState('');
  const [avalConsig, setAvalConsig] = useState('');
  const [avalCompra, setAvalCompra] = useState('');
  const [prevCustosLoja, setPrevCustosLoja] = useState('');
  const [prevCustosCliente, setPrevCustosCliente] = useState('');
  const [negociacao, setNegociacao] = useState<Negociacao | ''>('');
  const [obsAvaliador, setObsAvaliador] = useState('');
  const [situacao, setSituacao] = useState<SituacaoAvaliacao>('sem_avaliar');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('avaliacoes')
        .select(`
          *,
          atendimentos (id, nome_cliente, telefone, loja, vendedor_id, interesse, sexo, uf, tipo_atendimento, origem, temperatura, created_at),
          motos_avaliacao (id, marca, modelo, ano_fabricacao, ano_modelo, placa, km, cor, categoria, observacoes)
        `)
        .eq('id', avaliacaoId)
        .single();

      if (data) {
        setAvaliacao({ ...data, atendimento: data.atendimentos, moto_avaliacao: data.motos_avaliacao });
        setValorFipe(data.valor_fipe?.toString() || '');
        setMenorValor(data.menor_valor?.toString() || '');
        setMaiorValor(data.maior_valor?.toString() || '');
        setQuantoPede(data.quanto_pede?.toString() || '');
        setQuantoVende(data.quanto_vende?.toString() || '');
        setQuantoVendeErrado(data.quanto_vende_errado?.toString() || '');
        setAvalConsig(data.avaliacao_consignacao?.toString() || '');
        setAvalCompra(data.avaliacao_compra?.toString() || '');
        setPrevCustosLoja(data.previsao_custos_loja?.toString() || '');
        setPrevCustosCliente(data.previsao_custos_cliente?.toString() || '');
        setNegociacao((data.negociacao as Negociacao) || '');
        setObsAvaliador(data.observacao_avaliador || '');
        setSituacao(data.situacao as SituacaoAvaliacao);

        if (data.moto_avaliacao_id) {
          const { data: fotosData } = await supabase.from('moto_fotos').select('*').eq('moto_avaliacao_id', data.moto_avaliacao_id);
          if (fotosData) setFotos(fotosData);
        }
      }
      setLoading(false);
    };
    load();
  }, [avaliacaoId]);

  const handleSave = async () => {
    setSaving(true);
    const toNum = (v: string) => v ? parseFloat(v) : null;
    const { error } = await supabase.from('avaliacoes').update({
      valor_fipe: toNum(valorFipe),
      menor_valor: toNum(menorValor),
      maior_valor: toNum(maiorValor),
      quanto_pede: toNum(quantoPede),
      quanto_vende: toNum(quantoVende),
      quanto_vende_errado: toNum(quantoVendeErrado),
      avaliacao_consignacao: toNum(avalConsig),
      avaliacao_compra: toNum(avalCompra),
      previsao_custos_loja: toNum(prevCustosLoja),
      previsao_custos_cliente: toNum(prevCustosCliente),
      negociacao: negociacao || null,
      observacao_avaliador: obsAvaliador || null,
      situacao,
      avaliador_id: user!.id,
    }).eq('id', avaliacaoId);

    if (error) {
      toast.error('Erro ao salvar avaliação');
    } else {
      toast.success('Avaliação salva!');
      setShowEvalDialog(false);
      // Reload data
      setAvaliacao((prev: any) => ({
        ...prev,
        valor_fipe: toNum(valorFipe),
        menor_valor: toNum(menorValor),
        maior_valor: toNum(maiorValor),
        quanto_pede: toNum(quantoPede),
        quanto_vende: toNum(quantoVende),
        quanto_vende_errado: toNum(quantoVendeErrado),
        avaliacao_consignacao: toNum(avalConsig),
        avaliacao_compra: toNum(avalCompra),
        previsao_custos_loja: toNum(prevCustosLoja),
        previsao_custos_cliente: toNum(prevCustosCliente),
        negociacao: negociacao || null,
        observacao_avaliador: obsAvaliador || null,
        situacao,
      }));
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const moto = avaliacao?.moto_avaliacao;
  const at = avaliacao?.atendimento;
  const sit = SITUACOES_AVALIACAO.find(s => s.value === avaliacao?.situacao);

  const hasEvaluation = !!(avaliacao?.valor_fipe || avaliacao?.avaliacao_compra || avaliacao?.avaliacao_consignacao || avaliacao?.quanto_pede);

  const whatsappUrl = (() => {
    if (!at?.telefone) return '';
    const digits = at.telefone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  const InfoItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    ) : null
  );

  const getInteresseLabel = (interesse: string) => {
    switch (interesse) {
      case 'comprar': return 'Comprar';
      case 'vender': return 'Vender';
      case 'trocar': return 'Trocar';
      default: return interesse;
    }
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
              <h1 className="text-lg sm:text-xl font-bold truncate">{at?.nome_cliente}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {avaliacao?.created_at && format(new Date(avaliacao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
                <InfoItem label="Nome" value={at?.nome_cliente} />
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Telefone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{at?.telefone ? formatPhone(at.telefone) : '-'}</span>
                    {at?.telefone && (
                      <button
                        onClick={() => window.open(whatsappUrl, '_blank')}
                        className="text-green-600 hover:text-green-700 transition-colors"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <InfoItem label="Sexo" value={at?.sexo} />
                <InfoItem label="UF" value={at?.uf} />
              </div>
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
                <InfoItem label="Loja" value={at?.loja} />
                <InfoItem label="Tipo" value={at?.tipo_atendimento} />
                <InfoItem label="Interesse" value={at?.interesse ? getInteresseLabel(at.interesse) : null} />
                <InfoItem label="Origem" value={at?.origem} />
                <InfoItem label="Temperatura" value={at?.temperatura} />
              </div>
            </CardContent>
          </Card>

          {/* Dados da Moto */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Marca" value={moto?.marca} />
                <InfoItem label="Modelo" value={moto?.modelo} />
                <InfoItem label="Ano Fabricação" value={moto?.ano_fabricacao} />
                <InfoItem label="Ano Modelo" value={moto?.ano_modelo} />
                <InfoItem label="Categoria" value={moto?.categoria} />
                <InfoItem label="Cor" value={moto?.cor} />
                <InfoItem label="Placa" value={moto?.placa} />
                <InfoItem label="KM" value={formatKm(moto?.km)} />
              </div>
              {moto?.observacoes && (
                <div className="mt-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações</span>
                  <p className="text-sm mt-1">{moto.observacoes}</p>
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowPhotosDialog(true)}>
                  <Camera className="h-4 w-4" /> Ver Fotos {fotos.length > 0 && `(${fotos.length})`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Avaliação Comercial */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Avaliação Comercial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasEvaluation ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem label="Valor FIPE" value={formatCurrency(avaliacao?.valor_fipe)} />
                    <InfoItem label="Menor Valor" value={formatCurrency(avaliacao?.menor_valor)} />
                    <InfoItem label="Maior Valor" value={formatCurrency(avaliacao?.maior_valor)} />
                    <InfoItem label="Quanto Pede" value={formatCurrency(avaliacao?.quanto_pede)} />
                    <InfoItem label="Quanto Vende" value={formatCurrency(avaliacao?.quanto_vende)} />
                    <InfoItem label="Quanto Vende (errado)" value={formatCurrency(avaliacao?.quanto_vende_errado)} />
                    <InfoItem label="Aval. Consignação" value={formatCurrency(avaliacao?.avaliacao_consignacao)} />
                    <InfoItem label="Aval. Compra" value={formatCurrency(avaliacao?.avaliacao_compra)} />
                    <InfoItem label="Custos Loja" value={formatCurrency(avaliacao?.previsao_custos_loja)} />
                    <InfoItem label="Custos Cliente" value={formatCurrency(avaliacao?.previsao_custos_cliente)} />
                    <InfoItem label="Negociação" value={avaliacao?.negociacao === 'compra' ? 'Compra' : avaliacao?.negociacao === 'consignacao' ? 'Consignação' : null} />
                    <InfoItem label="Situação" value={sit?.label} />
                  </div>
                  {avaliacao?.observacao_avaliador && (
                    <div className="mt-2">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observação do Avaliador</span>
                      <p className="text-sm mt-1">{avaliacao.observacao_avaliador}</p>
                    </div>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" className="gap-1.5 mt-3" onClick={() => setShowEvalDialog(true)}>
                      <Edit className="h-4 w-4" /> Editar Avaliação
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">Avaliação ainda não realizada</p>
                  {canEdit && (
                    <Button size="sm" className="gap-1.5" onClick={() => setShowEvalDialog(true)}>
                      <DollarSign className="h-4 w-4" /> Fazer Avaliação
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Dialog de Avaliação Comercial */}
      <Dialog open={showEvalDialog} onOpenChange={setShowEvalDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Avaliação Comercial
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label>Valor FIPE</Label>
              <Input type="number" value={valorFipe} onChange={e => setValorFipe(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Menor Valor</Label>
              <Input type="number" value={menorValor} onChange={e => setMenorValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Maior Valor</Label>
              <Input type="number" value={maiorValor} onChange={e => setMaiorValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quanto Pede?</Label>
              <Input type="number" value={quantoPede} onChange={e => setQuantoPede(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quanto Vende?</Label>
              <Input type="number" value={quantoVende} onChange={e => setQuantoVende(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quanto Vende (se der errado)?</Label>
              <Input type="number" value={quantoVendeErrado} onChange={e => setQuantoVendeErrado(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Avaliação Consignação</Label>
              <Input type="number" value={avalConsig} onChange={e => setAvalConsig(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Avaliação Compra</Label>
              <Input type="number" value={avalCompra} onChange={e => setAvalCompra(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Previsão Custos Loja</Label>
              <Input type="number" value={prevCustosLoja} onChange={e => setPrevCustosLoja(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Previsão Custos Cliente</Label>
              <Input type="number" value={prevCustosCliente} onChange={e => setPrevCustosCliente(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Negociação</Label>
              <Select value={negociacao} onValueChange={v => setNegociacao(v as Negociacao)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="consignacao">Consignação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={situacao} onValueChange={v => setSituacao(v as SituacaoAvaliacao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SITUACOES_AVALIACAO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação do Avaliador</Label>
              <Textarea value={obsAvaliador} onChange={e => setObsAvaliador(e.target.value)} rows={3} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={() => setShowEvalDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Fotos */}
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

export default AvaliacaoForm;
