import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { SITUACOES_AVALIACAO } from '@/types/crm';
import type { Avaliacao, SituacaoAvaliacao, Negociacao, MotoFoto } from '@/types/crm';
import { toast } from 'sonner';

interface Props {
  avaliacaoId: string;
  onClose: () => void;
}

const AvaliacaoForm: React.FC<Props> = ({ avaliacaoId, onClose }) => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
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
          atendimentos (id, nome_cliente, telefone, loja, vendedor_id, interesse),
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

        // load photos
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
      onClose();
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const moto = avaliacao?.moto_avaliacao;
  const at = avaliacao?.atendimento;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold">Avaliação</h1>
      </div>

      {/* Dados da moto e atendimento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Atendimento</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {at?.nome_cliente}</p>
            <p><span className="text-muted-foreground">Telefone:</span> {at?.telefone}</p>
            <p><span className="text-muted-foreground">Loja:</span> {at?.loja}</p>
            <p><span className="text-muted-foreground">Interesse:</span> {at?.interesse}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da Moto</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Marca/Modelo:</span> {moto?.marca} {moto?.modelo}</p>
            <p><span className="text-muted-foreground">Ano:</span> {moto?.ano_fabricacao}/{moto?.ano_modelo}</p>
            <p><span className="text-muted-foreground">Placa:</span> {moto?.placa || '-'}</p>
            <p><span className="text-muted-foreground">KM:</span> {moto?.km || '-'}</p>
            <p><span className="text-muted-foreground">Cor:</span> {moto?.cor || '-'}</p>
            {moto?.observacoes && <p><span className="text-muted-foreground">Obs:</span> {moto.observacoes}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Fotos */}
      {fotos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">📷 Fotos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {fotos.map(f => (
                <div key={f.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img src={f.url} alt={f.tipo} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form de avaliação */}
      <Card>
        <CardHeader><CardTitle className="text-base">Avaliação Comercial</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Valor FIPE</Label>
            <Input type="number" value={valorFipe} onChange={e => setValorFipe(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Menor Valor</Label>
            <Input type="number" value={menorValor} onChange={e => setMenorValor(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Maior Valor</Label>
            <Input type="number" value={maiorValor} onChange={e => setMaiorValor(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Quanto Pede?</Label>
            <Input type="number" value={quantoPede} onChange={e => setQuantoPede(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Quanto Vende?</Label>
            <Input type="number" value={quantoVende} onChange={e => setQuantoVende(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Quanto Vende (se der errado)?</Label>
            <Input type="number" value={quantoVendeErrado} onChange={e => setQuantoVendeErrado(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Avaliação Consignação</Label>
            <Input type="number" value={avalConsig} onChange={e => setAvalConsig(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Avaliação Compra</Label>
            <Input type="number" value={avalCompra} onChange={e => setAvalCompra(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Previsão Custos Loja</Label>
            <Input type="number" value={prevCustosLoja} onChange={e => setPrevCustosLoja(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Previsão Custos Cliente</Label>
            <Input type="number" value={prevCustosCliente} onChange={e => setPrevCustosCliente(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Negociação</Label>
            <Select value={negociacao} onValueChange={v => setNegociacao(v as Negociacao)} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="consignacao">Consignação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select value={situacao} onValueChange={v => setSituacao(v as SituacaoAvaliacao)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SITUACOES_AVALIACAO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Observação do Avaliador</Label>
            <Textarea value={obsAvaliador} onChange={e => setObsAvaliador(e.target.value)} rows={3} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex gap-3 justify-end pt-2 pb-8">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Avaliação
          </Button>
        </div>
      )}
    </div>
  );
};

export default AvaliacaoForm;
