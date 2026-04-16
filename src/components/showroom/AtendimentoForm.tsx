import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, SendHorizonal, CheckCircle } from 'lucide-react';
import { LOJAS, INTERESSES, TEMPERATURAS, ORIGENS, UFS, TIPOS_ATENDIMENTO, SEXOS } from '@/types/crm';
import type { Interesse, SituacaoShowroom } from '@/types/crm';
import MotoVendaSection from './MotoVendaSection';
import MotoCompraSection from './MotoCompraSection';
import { toast } from 'sonner';
import { cn, formatPersonName } from '@/lib/utils';

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
  const { user, userName } = useAuth();
  const isEditing = !!atendimentoId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [searchingPhone, setSearchingPhone] = useState(false);
  const [clientFound, setClientFound] = useState<boolean | null>(null);

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

  const isDucati = loja === 'Ducati';

  // compra
  const [origemMoto, setOrigemMoto] = useState('estoque');
  const [compraMarca, setCompraMarca] = useState('');
  const [compraModelo, setCompraModelo] = useState('');
  const [compraAno, setCompraAno] = useState('');
  const [estoqueMotoId, setEstoqueMotoId] = useState('');
  const [chassi, setChassi] = useState('');

  // venda
  const [vendaMarca, setVendaMarca] = useState('');
  const [vendaModelo, setVendaModelo] = useState('');
  const [vendaAnoFab, setVendaAnoFab] = useState('');
  const [vendaAnoMod, setVendaAnoMod] = useState('');
  const [vendaCategoria, setVendaCategoria] = useState('');
  const [vendaCor, setVendaCor] = useState('');
  const [vendaPlaca, setVendaPlaca] = useState('');
  const [vendaKm, setVendaKm] = useState('');
  const [vendaCilindrada, setVendaCilindrada] = useState('');
  const [vendaObs, setVendaObs] = useState('');
  const [temManual, setTemManual] = useState('');
  const [temChaveReserva, setTemChaveReserva] = useState('');
  const [manutencaoEmDia, setManutencaoEmDia] = useState('');
  const [motoAvaliacaoId, setMotoAvaliacaoId] = useState<string | null>(null);
  const [enviadaAvaliacao, setEnviadaAvaliacao] = useState(false);

  useEffect(() => {
    if (!atendimentoId) return;
    const load = async () => {
      try {
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
            setEstoqueMotoId(mi.estoque_moto_id || '');
            setChassi((mi as any).chassi || '');
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
            setVendaCilindrada((ma as any).cilindrada || '');
            setVendaObs(ma.observacoes || '');
            setTemManual((ma as any).tem_manual ? 'sim' : (ma as any).tem_manual === false ? 'nao' : '');
            setTemChaveReserva((ma as any).tem_chave_reserva ? 'sim' : (ma as any).tem_chave_reserva === false ? 'nao' : '');
            setManutencaoEmDia((ma as any).manutencao_vencida ? 'sim' : (ma as any).manutencao_vencida === false ? 'nao' : '');
            setEnviadaAvaliacao(ma.enviada_avaliacao || false);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar atendimento:', err);
        toast.error('Erro ao carregar atendimento');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [atendimentoId]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setTelefone(formatted);
    // Auto-search when phone reaches 11 digits (only for new atendimentos)
    const digits = unformatPhone(formatted);
    if (digits.length === 11 && !isEditing) {
      // Trigger search after state update
      setTimeout(() => searchClientByPhoneDigits(digits), 100);
    }
  };

  const searchClientByPhoneDigits = useCallback(async (digits: string) => {
    if (digits.length !== 11) return;

    setSearchingPhone(true);
    try {
      const { data } = await supabase
        .from('atendimentos')
        .select('nome_cliente, sexo, uf, origem')
        .eq('telefone', digits)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setNomeCliente(data.nome_cliente);
        setSexo(data.sexo);
        setUf(data.uf);
        if (data.origem) setOrigem(data.origem);
        toast.success('Cliente encontrado! Dados preenchidos automaticamente.');
      } else {
        setNomeCliente('');
        setSexo('');
        setUf('DF');
        setOrigem('');
        toast.info('Cliente não encontrado. Preencha os dados manualmente.');
      }
    } catch (err) {
      console.error('Erro ao buscar cliente:', err);
    } finally {
      setSearchingPhone(false);
    }
  }, []);


  const isPhoneValid = unformatPhone(telefone).length === 11;

  const handleSave = async () => {
    if (!nomeCliente.trim() || !isPhoneValid || !loja || !sexo || !uf || !tipoAtendimento || !origem || !temperatura) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (nomeCliente.trim().split(/\s+/).length < 2) {
      toast.error('Informe o nome completo do cliente (nome e sobrenome)');
      return;
    }
    if (isDucati && (interesse === 'comprar' || interesse === 'trocar') && (!compraModelo || !compraAno)) {
      toast.error('Preencha o modelo e ano da moto Ducati');
      return;
    }
    if (isDucati && (interesse === 'comprar' || interesse === 'trocar') && chassi.replace(/\s/g, '').length > 0 && (chassi.replace(/\s/g, '').length < 6 || chassi.replace(/\s/g, '').length > 17)) {
      toast.error('O chassi deve ter entre 6 e 17 caracteres');
      return;
    }
    if (!isDucati && (interesse === 'comprar' || interesse === 'trocar') && origemMoto === 'externo' && (!compraMarca || !compraModelo || !compraAno)) {
      toast.error('Preencha todos os campos da Moto de Interesse');
      return;
    }
    if ((interesse === 'vender' || interesse === 'trocar') && (!vendaMarca || !vendaModelo || !vendaAnoFab || !vendaAnoMod || !vendaCategoria || !vendaCor || !vendaPlaca.trim() || !vendaKm.trim() || !vendaCilindrada.trim())) {
      toast.error('Preencha todos os campos da Moto do Cliente');
      return;
    }
    if ((interesse === 'vender' || interesse === 'trocar') && (!temManual || !temChaveReserva || !manutencaoEmDia)) {
      toast.error('Informe Manual, Chave Reserva e Revisão Vencida');
      return;
    }
    if ((interesse === 'vender' || interesse === 'trocar') && vendaPlaca.trim().length !== 7) {
      toast.error('A placa deve ter exatamente 7 caracteres');
      return;
    }
    setSaving(true);

    const atData = {
      vendedor_id: user!.id,
      loja, nome_cliente: formatPersonName(nomeCliente), telefone: unformatPhone(telefone),
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

      // Register initial status in history
      await supabase.from('status_history').insert({
        entity_type: 'showroom',
        entity_id: atId,
        status: 'em_aberto',
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
      });
    }

    if (interesse === 'comprar' || interesse === 'trocar') {
      const miData = isDucati
        ? {
            atendimento_id: atId!,
            origem: 'estoque' as const,
            marca: 'DUCATI',
            modelo: compraModelo || null,
            ano: compraAno || null,
            estoque_moto_id: null,
            chassi: chassi.toUpperCase().replace(/\s/g, '') || null,
          }
        : {
            atendimento_id: atId!,
            origem: origemMoto,
            marca: origemMoto === 'externo' ? compraMarca || null : null,
            modelo: origemMoto === 'externo' ? compraModelo || null : null,
            ano: origemMoto === 'externo' ? compraAno || null : null,
            estoque_moto_id: origemMoto === 'estoque' ? estoqueMotoId || null : null,
            chassi: null,
          };
      if (isEditing) {
        const { data: existing } = await supabase.from('motos_interesse').select('id').eq('atendimento_id', atId!).maybeSingle();
        if (existing) {
          await supabase.from('motos_interesse').update(miData as any).eq('id', existing.id);
        } else {
          await supabase.from('motos_interesse').insert(miData as any);
        }
      } else {
        await supabase.from('motos_interesse').insert(miData as any);
      }
    } else if (isEditing && interesse === 'vender') {
      // Se mudou para "vender", remover moto de interesse existente
      await supabase.from('motos_interesse').delete().eq('atendimento_id', atId!);
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
          cilindrada: vendaCilindrada || null,
          observacoes: vendaObs || null,
          tem_manual: temManual === 'sim',
          tem_chave_reserva: temChaveReserva === 'sim',
          manutencao_vencida: manutencaoEmDia === 'sim',
        };
        if (motoAvaliacaoId) {
          await supabase.from('motos_avaliacao').update(maData).eq('id', motoAvaliacaoId);
        } else {
          await supabase.from('motos_avaliacao').insert(maData);
        }
      }
    } else if (isEditing && interesse === 'comprar') {
      // Se mudou para "comprar", remover moto do cliente (avaliação) existente
      if (motoAvaliacaoId) {
        await supabase.from('motos_avaliacao').delete().eq('id', motoAvaliacaoId);
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
      // Registrar no histórico
      await supabase.from('status_history').insert({
        entity_type: 'avaliacao',
        entity_id: motoAvaliacaoId,
        status: 'avaliacao_solicitada',
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
      } as any);
      // Notificar avaliadores
      await supabase.rpc('notify_role', {
        _role: 'avaliador' as any,
        _title: 'Avaliação Solicitada',
        _message: `Nova avaliação solicitada para o atendimento | Por: ${userName || user?.email || 'Usuário'}`,
        _entity_id: atendimentoId,
        _entity_type: 'avaliacao',
      });
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
        "px-3 h-9 rounded-md text-sm font-medium border transition-colors",
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
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[220px_2fr_auto_auto] gap-4">
          <div className="space-y-1.5">
            <Label>Telefone *</Label>
            <div className="flex gap-2">
              <Input
                value={telefone}
                onChange={handlePhoneChange}
                
                placeholder="(61) 90000-0000"
                maxLength={15}
                className="flex-1"
              />
              {searchingPhone && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {telefone && !isPhoneValid && (
              <p className="text-xs text-destructive">Telefone deve ter 11 dígitos</p>
            )}
          </div>
          {(isEditing || isPhoneValid) && (
            <>
              <div className="space-y-1.5">
                <Label>Nome do Cliente *</Label>
                <Input
                  placeholder="Nome Sobrenome"
                  value={nomeCliente}
                  onChange={e => {
                    const formatted = e.target.value
                      .toLowerCase()
                      .replace(/(?:^|\s)\S/g, match => match.toUpperCase());
                    setNomeCliente(formatted);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF *</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sexo *</Label>
                <div className="flex flex-wrap gap-2">
                  {SEXOS.map(s => (
                    <ToggleButton key={s} label={s} value={s} selected={sexo} onSelect={setSexo} />
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card: Dados do Atendimento */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dados do Atendimento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap justify-between gap-4">
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
              <div className="flex flex-wrap gap-2 [&>button]:min-w-[90px]">
                {TIPOS_ATENDIMENTO.map(t => (
                  <ToggleButton key={t} label={t} value={t} selected={tipoAtendimento} onSelect={setTipoAtendimento} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temperatura *</Label>
              <div className="flex flex-wrap gap-2 [&>button]:min-w-[90px]">
                {TEMPERATURAS.map(t => (
                  <ToggleButton key={t} label={t} value={t} selected={temperatura} onSelect={setTemperatura} />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 max-w-[220px] gap-4">
            <div className="space-y-1.5">
              <Label>Origem *</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interesse *</Label>
              <Select value={interesse} onValueChange={v => setInteresse(v as Interesse)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INTERESSES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
          estoqueMotoId={estoqueMotoId} setEstoqueMotoId={setEstoqueMotoId}
          loja={loja}
          chassi={chassi} setChassi={setChassi}
          disabled={isEditing && (situacao === 'sinal' || situacao === 'vendido')}
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
            cilindrada={vendaCilindrada} setCilindrada={setVendaCilindrada}
            obs={vendaObs} setObs={setVendaObs}
            temManual={temManual} setTemManual={setTemManual}
            temChaveReserva={temChaveReserva} setTemChaveReserva={setTemChaveReserva}
            manutencaoEmDia={manutencaoEmDia} setManutencaoEmDia={setManutencaoEmDia}
            motoAvaliacaoId={motoAvaliacaoId}
            atendimentoId={atendimentoId}
            interesse={interesse}
            isEditing={isEditing}
          />
          {!isEditing && motoAvaliacaoId && !enviadaAvaliacao && (
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

      {/* Card: Observações */}
      <Card>
        <CardHeader><CardTitle className="text-base">Observações do Atendimento</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value.toUpperCase())} rows={3} placeholder="Observações gerais sobre o atendimento..." className="uppercase" />
        </CardContent>
      </Card>

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
