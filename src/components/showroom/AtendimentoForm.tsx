import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, SendHorizonal } from 'lucide-react';
import { LOJAS, INTERESSES, TEMPERATURAS, ORIGENS, UFS, TIPOS_ATENDIMENTO, SEXOS } from '@/types/crm';
import type { Interesse, SituacaoShowroom } from '@/types/crm';
import MotoVendaSection from './MotoVendaSection';
import MotoCompraSection from './MotoCompraSection';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Phone mask utility
const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const unformatPhone = (value: string): string => value.replace(/\D/g, '');

interface Props {
  atendimentoId: string | null;
  onClose: () => void;
}

const AtendimentoForm: React.FC<Props> = ({ atendimentoId, onClose }) => {
  const { user } = useAuth();
  const isEditing = !!atendimentoId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  // form state
  const [loja, setLoja] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [telefone, setTelefone] = useState('');
  const [sexo, setSexo] = useState('');
  const [uf, setUf] = useState('DF');
  const [tipoAtendimento, setTipoAtendimento] = useState('');
  const [origem, setOrigem] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [interesse, setInteresse] = useState<Interesse>('comprar');
  const [situacao, setSituacao] = useState<SituacaoShowroom>('em_aberto');

  // compra
  const [origemMoto, setOrigemMoto] = useState('estoque');
  const [compraMarca, setCompraMarca] = useState('');
  const [compraModelo, setCompraModelo] = useState('');
  const [compraAno, setCompraAno] = useState('');

  // venda
  const [vendaMarca, setVendaMarca] = useState('');
  const [vendaModelo, setVendaModelo] = useState('');
  const [vendaAnoFab, setVendaAnoFab] = useState('');
  const [vendaAnoMod, setVendaAnoMod] = useState('');
  const [vendaCategoria, setVendaCategoria] = useState('');
  const [vendaCor, setVendaCor] = useState('');
  const [vendaPlaca, setVendaPlaca] = useState('');
  const [vendaKm, setVendaKm] = useState('');
  const [vendaObs, setVendaObs] = useState('');
  const [motoAvaliacaoId, setMotoAvaliacaoId] = useState<string | null>(null);
  const [enviadaAvaliacao, setEnviadaAvaliacao] = useState(false);

  useEffect(() => {
    if (!atendimentoId) return;
    const load = async () => {
      const { data: at } = await supabase.from('atendimentos').select('*').eq('id', atendimentoId).single();
      if (at) {
        setLoja(at.loja);
        setNomeCliente(at.nome_cliente);
        setTelefone(formatPhone(at.telefone));
        setSexo(at.sexo);
        setUf(at.uf);
        setTipoAtendimento(at.tipo_atendimento);
        setOrigem(at.origem || '');
        setTemperatura(at.temperatura || '');
        setObservacoes(at.observacoes || '');
        setInteresse(at.interesse as Interesse);
        setSituacao(at.situacao as SituacaoShowroom);
      }
      if (at?.interesse === 'comprar' || at?.interesse === 'trocar') {
        const { data: mi } = await supabase.from('motos_interesse').select('*').eq('atendimento_id', atendimentoId).maybeSingle();
        if (mi) {
          setOrigemMoto(mi.origem);
          setCompraMarca(mi.marca || '');
          setCompraModelo(mi.modelo || '');
          setCompraAno(mi.ano || '');
        }
      }
      if (at?.interesse === 'vender' || at?.interesse === 'trocar') {
        const { data: ma } = await supabase.from('motos_avaliacao').select('*').eq('atendimento_id', atendimentoId).maybeSingle();
        if (ma) {
          setMotoAvaliacaoId(ma.id);
          setVendaMarca(ma.marca);
          setVendaModelo(ma.modelo);
          setVendaAnoFab(ma.ano_fabricacao || '');
          setVendaAnoMod(ma.ano_modelo || '');
          setVendaCategoria(ma.categoria || '');
          setVendaCor(ma.cor || '');
          setVendaPlaca(ma.placa || '');
          setVendaKm(ma.km || '');
          setVendaObs(ma.observacoes || '');
          setEnviadaAvaliacao(ma.enviada_avaliacao || false);
        }
      }
      setLoading(false);
    };
    load();
  }, [atendimentoId]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelefone(formatPhone(e.target.value));
  };

  const isPhoneValid = unformatPhone(telefone).length === 11;

  const handleSave = async () => {
    if (!nomeCliente.trim() || !isPhoneValid || !loja || !sexo || !uf || !tipoAtendimento) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);

    const atData = {
      vendedor_id: user!.id,
      loja, nome_cliente: nomeCliente.trim(), telefone: unformatPhone(telefone),
      sexo, uf, tipo_atendimento: tipoAtendimento,
      origem: origem || null, temperatura: temperatura || null,
      observacoes: observacoes || null, interesse, situacao: isEditing ? situacao : 'em_aberto' as SituacaoShowroom,
    };

    let atId = atendimentoId;

    if (isEditing) {
      const { error } = await supabase.from('atendimentos').update(atData).eq('id', atendimentoId);
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('atendimentos').insert(atData).select('id').single();
      if (error) { toast.error('Erro ao criar atendimento'); setSaving(false); return; }
      atId = data.id;
    }

    // Save moto interesse
    if (interesse === 'comprar' || interesse === 'trocar') {
      const miData = {
        atendimento_id: atId!,
        origem: origemMoto,
        marca: origemMoto === 'externo' ? compraMarca || null : null,
        modelo: origemMoto === 'externo' ? compraModelo || null : null,
        ano: origemMoto === 'externo' ? compraAno || null : null,
      };
      if (isEditing) {
        const { data: existing } = await supabase.from('motos_interesse').select('id').eq('atendimento_id', atId!).maybeSingle();
        if (existing) {
          await supabase.from('motos_interesse').update(miData).eq('id', existing.id);
        } else {
          await supabase.from('motos_interesse').insert(miData);
        }
      } else {
        await supabase.from('motos_interesse').insert(miData);
      }
    }

    // Save moto avaliacao
    if (interesse === 'vender' || interesse === 'trocar') {
      if (vendaMarca.trim() && vendaModelo.trim()) {
        const maData = {
          atendimento_id: atId!,
          marca: vendaMarca.trim(), modelo: vendaModelo.trim(),
          ano_fabricacao: vendaAnoFab || null, ano_modelo: vendaAnoMod || null,
          categoria: vendaCategoria || null, cor: vendaCor || null,
          placa: vendaPlaca || null, km: vendaKm || null,
          observacoes: vendaObs || null,
        };
        if (motoAvaliacaoId) {
          await supabase.from('motos_avaliacao').update(maData).eq('id', motoAvaliacaoId);
        } else {
          await supabase.from('motos_avaliacao').insert(maData);
        }
      }
    }

    toast.success(isEditing ? 'Atendimento atualizado!' : 'Atendimento criado!');
    setSaving(false);
    onClose();
  };

  const handleEnviarAvaliacao = async () => {
    if (!motoAvaliacaoId) {
      toast.error('Salve o atendimento primeiro');
      return;
    }
    await supabase.from('motos_avaliacao').update({ enviada_avaliacao: true }).eq('id', motoAvaliacaoId);
    const { error } = await supabase.from('avaliacoes').insert({
      atendimento_id: atendimentoId!,
      moto_avaliacao_id: motoAvaliacaoId,
      situacao: 'sem_avaliar',
    });
    if (error) {
      toast.error('Erro ao enviar para avaliação');
    } else {
      setEnviadaAvaliacao(true);
      toast.success('Moto enviada para avaliação!');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const ToggleButton = ({ label, value, selected, onSelect }: { label: string; value: string; selected: string; onSelect: (v: string) => void }) => (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
        selected === value
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold">{isEditing ? 'Editar Atendimento' : 'Novo Atendimento'}</h1>
      </div>

      {/* Card: Dados do Cliente */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dados do Cliente</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Nome do Cliente *</Label>
            <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone *</Label>
            <Input
              value={telefone}
              onChange={handlePhoneChange}
              placeholder="(61) 99108-8509"
              maxLength={15}
            />
            {telefone && !isPhoneValid && (
              <p className="text-xs text-destructive">Telefone deve ter 11 dígitos</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Sexo *</Label>
            <Select value={sexo} onValueChange={setSexo}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{SEXOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>UF *</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Card: Dados do Atendimento */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dados do Atendimento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Loja *</Label>
              <div className="flex flex-wrap gap-2">
                {LOJAS.map(l => (
                  <ToggleButton key={l} label={l} value={l} selected={loja} onSelect={setLoja} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Atendimento *</Label>
              <div className="flex flex-wrap gap-2">
                {TIPOS_ATENDIMENTO.map(t => (
                  <ToggleButton key={t} label={t} value={t} selected={tipoAtendimento} onSelect={setTipoAtendimento} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Temperatura</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPERATURAS.map(t => (
                <ToggleButton key={t} label={t} value={t} selected={temperatura} onSelect={setTemperatura} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Interesse *</Label>
            <Select value={interesse} onValueChange={v => setInteresse(v as Interesse)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INTERESSES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Conditional sections */}
      {(interesse === 'comprar' || interesse === 'trocar') && (
        <MotoCompraSection
          origemMoto={origemMoto} setOrigemMoto={setOrigemMoto}
          marca={compraMarca} setMarca={setCompraMarca}
          modelo={compraModelo} setModelo={setCompraModelo}
          ano={compraAno} setAno={setCompraAno}
        />
      )}

      {(interesse === 'vender' || interesse === 'trocar') && (
        <>
          <MotoVendaSection
            marca={vendaMarca} setMarca={setVendaMarca}
            modelo={vendaModelo} setModelo={setVendaModelo}
            anoFab={vendaAnoFab} setAnoFab={setVendaAnoFab}
            anoMod={vendaAnoMod} setAnoMod={setVendaAnoMod}
            categoria={vendaCategoria} setCategoria={setVendaCategoria}
            cor={vendaCor} setCor={setVendaCor}
            placa={vendaPlaca} setPlaca={setVendaPlaca}
            km={vendaKm} setKm={setVendaKm}
            obs={vendaObs} setObs={setVendaObs}
            motoAvaliacaoId={motoAvaliacaoId}
            atendimentoId={atendimentoId}
          />
          {isEditing && motoAvaliacaoId && !enviadaAvaliacao && (
            <div className="flex justify-end">
              <Button variant="default" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleEnviarAvaliacao}>
                <SendHorizonal className="h-4 w-4" /> Enviar para Avaliação
              </Button>
            </div>
          )}
          {enviadaAvaliacao && (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="py-3 text-sm text-success font-medium text-center">
                ✓ Moto enviada para avaliação
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex gap-3 justify-end pt-2 pb-8">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default AtendimentoForm;
