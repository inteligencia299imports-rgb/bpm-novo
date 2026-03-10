import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Save, Loader2, User, Store, Tag, DollarSign, Camera, Edit, MessageCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { SituacaoAvaliacao, MotoFoto } from '@/types/crm';
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

// Currency mask: formats input as "1.234,56"
const applyCurrencyMask = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  const formatted = (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatted;
};

const parseCurrencyToNumber = (value: string): number | null => {
  if (!value) return null;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

const numberToCurrencyMask = (value: number | null): string => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const AvaliacaoForm: React.FC<Props> = ({ avaliacaoId, onClose }) => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [showEvalDialog, setShowEvalDialog] = useState(false);
  const [showPhotosDialog, setShowPhotosDialog] = useState(false);
  const canEdit = role === 'avaliador' || role === 'gestor' || role === 'vendedor';

  // form fields (stored as masked strings)
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
  const [obsAvaliador, setObsAvaliador] = useState('');

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
        setValorFipe(numberToCurrencyMask(data.valor_fipe));
        setMenorValor(numberToCurrencyMask(data.menor_valor));
        setMaiorValor(numberToCurrencyMask(data.maior_valor));
        setQuantoPede(numberToCurrencyMask(data.quanto_pede));
        setQuantoVende(numberToCurrencyMask(data.quanto_vende));
        setQuantoVendeErrado(numberToCurrencyMask(data.quanto_vende_errado));
        setAvalConsig(numberToCurrencyMask(data.avaliacao_consignacao));
        setAvalCompra(numberToCurrencyMask(data.avaliacao_compra));
        setPrevCustosLoja(numberToCurrencyMask(data.previsao_custos_loja));
        setPrevCustosCliente(numberToCurrencyMask(data.previsao_custos_cliente));
        setObsAvaliador(data.observacao_avaliador || '');

        if (data.moto_avaliacao_id) {
          const { data: fotosData } = await supabase.from('moto_fotos').select('*').eq('moto_avaliacao_id', data.moto_avaliacao_id);
          if (fotosData) setFotos(fotosData);
        }
      }
      setLoading(false);
    };
    load();
  }, [avaliacaoId]);

  const handleCurrencyChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(applyCurrencyMask(e.target.value));
  };

  const allFieldsFilled = () => {
    return [valorFipe, menorValor, maiorValor, quantoPede, quantoVende, quantoVendeErrado, avalConsig, avalCompra, prevCustosLoja, prevCustosCliente, obsAvaliador].every(v => v.trim() !== '');
  };

  const handleSave = async () => {
    if (!allFieldsFilled()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setSaving(true);
    const updateData: any = {
      valor_fipe: parseCurrencyToNumber(valorFipe),
      menor_valor: parseCurrencyToNumber(menorValor),
      maior_valor: parseCurrencyToNumber(maiorValor),
      quanto_pede: parseCurrencyToNumber(quantoPede),
      quanto_vende: parseCurrencyToNumber(quantoVende),
      quanto_vende_errado: parseCurrencyToNumber(quantoVendeErrado),
      avaliacao_consignacao: parseCurrencyToNumber(avalConsig),
      avaliacao_compra: parseCurrencyToNumber(avalCompra),
      previsao_custos_loja: parseCurrencyToNumber(prevCustosLoja),
      previsao_custos_cliente: parseCurrencyToNumber(prevCustosCliente),
      observacao_avaliador: obsAvaliador || null,
      avaliador_id: user!.id,
    };

    const { error } = await supabase.from('avaliacoes').update(updateData).eq('id', avaliacaoId);

    if (error) {
      toast.error('Erro ao salvar avaliação');
    } else {
      toast.success('Avaliação salva!');
      setShowEvalDialog(false);
      setAvaliacao((prev: any) => ({ ...prev, ...updateData }));
    }
    setSaving(false);
  };

  const handleStatusChange = async (newStatus: SituacaoAvaliacao) => {
    const { error } = await supabase.from('avaliacoes').update({ situacao: newStatus }).eq('id', avaliacaoId);
    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      const label = SITUACOES_AVALIACAO.find(s => s.value === newStatus)?.label;
      toast.success(`Status alterado para ${label}`);
      setAvaliacao((prev: any) => ({ ...prev, situacao: newStatus }));
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const moto = avaliacao?.moto_avaliacao;
  const at = avaliacao?.atendimento;
  const sit = SITUACOES_AVALIACAO.find(s => s.value === avaliacao?.situacao);
  const interesse = at?.interesse;

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

  const getInteresseLabel = (int: string) => {
    switch (int) {
      case 'comprar': return 'Comprar';
      case 'vender': return 'Vender';
      case 'trocar': return 'Trocar';
      default: return int;
    }
  };

  // Status buttons config - filter out current status
  // "Adquirida" not available if interesse is "trocar"
  const statusButtons = [
    { value: 'em_aberto' as SituacaoAvaliacao, label: 'Em Aberto', icon: <Clock className="h-4 w-4" />, color: '#F2C94C' },
    { value: 'adquirida' as SituacaoAvaliacao, label: 'Adquirida', icon: <CheckCircle className="h-4 w-4" />, color: '#27AE60' },
    { value: 'dispensada' as SituacaoAvaliacao, label: 'Dispensada', icon: <XCircle className="h-4 w-4" />, color: '#FF3B30' },
  ]
    .filter(b => b.value !== avaliacao?.situacao)
    .filter(b => !(b.value === 'adquirida' && interesse === 'trocar'));

  const CurrencyField = ({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-destructive">*</span></Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        <Input
          value={value}
          onChange={onChange}
          className="pl-10"
          placeholder="0,00"
          inputMode="numeric"
        />
      </div>
    </div>
  );

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

          {/* Status Actions */}
          <div className="md:col-span-2 flex flex-col items-center gap-3">
            <div className="flex gap-2 flex-wrap justify-center">
              {statusButtons.map(btn => (
                <Button
                  key={btn.value}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  style={{ borderColor: btn.color, color: btn.color }}
                  onClick={() => handleStatusChange(btn.value)}
                >
                  {btn.icon}
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>
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
            <CurrencyField label="Valor FIPE" value={valorFipe} onChange={handleCurrencyChange(setValorFipe)} />
            <CurrencyField label="Menor Valor" value={menorValor} onChange={handleCurrencyChange(setMenorValor)} />
            <CurrencyField label="Maior Valor" value={maiorValor} onChange={handleCurrencyChange(setMaiorValor)} />
            <CurrencyField label="Quanto Pede?" value={quantoPede} onChange={handleCurrencyChange(setQuantoPede)} />
            <CurrencyField label="Quanto Vende?" value={quantoVende} onChange={handleCurrencyChange(setQuantoVende)} />
            <CurrencyField label="Quanto Vende (se der errado)?" value={quantoVendeErrado} onChange={handleCurrencyChange(setQuantoVendeErrado)} />
            <CurrencyField label="Avaliação Consignação" value={avalConsig} onChange={handleCurrencyChange(setAvalConsig)} />
            <CurrencyField label="Avaliação Compra" value={avalCompra} onChange={handleCurrencyChange(setAvalCompra)} />
            <CurrencyField label="Previsão Custos Loja" value={prevCustosLoja} onChange={handleCurrencyChange(setPrevCustosLoja)} />
            <CurrencyField label="Previsão Custos Cliente" value={prevCustosCliente} onChange={handleCurrencyChange(setPrevCustosCliente)} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação do Avaliador <span className="text-destructive">*</span></Label>
              <Textarea value={obsAvaliador} onChange={e => setObsAvaliador(e.target.value)} rows={3} placeholder="Observações sobre a avaliação..." />
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
