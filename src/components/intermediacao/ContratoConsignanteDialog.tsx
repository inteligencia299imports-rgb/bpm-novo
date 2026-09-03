import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Save, Download, Eye, Plus, Trash2, Loader2, DollarSign, User, Bike, MessageSquare, ArrowLeft, Pencil, MapPin, Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateContratoConsignantePdf } from '@/lib/generateContratoConsignantePdf';
import { ESTOQUE_MOTO_SELECT, mapEstoqueMoto, fetchLojaMap } from '@/lib/estoqueMoto';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import ClienteForm from '@/components/clientes/ClienteForm';
import { cadastroClienteCompleto } from '@/lib/clienteCadastro';

/** Props for ContratoConsignanteDialog */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  onSaved?: () => void;
}

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

const formatCpfCnpj = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
      d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
    );
  }
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
    e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
  );
};

const formatTelefone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const tipoContaLabel = (v: string | null | undefined) => {
  if (v === 'corrente') return 'Corrente';
  if (v === 'poupanca') return 'Poupança';
  if (v === 'pagamento') return 'Pagamento';
  return v || undefined;
};

const fmtDataNasc = (v: string | null | undefined) =>
  v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1') : undefined;

const InfoDisplay = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  ) : null
);

interface CustoOperacional {
  id?: string;
  tipo: string;
  responsavel: string;
  descricao: string;
  valor: string;
}

const ContratoConsignanteDialog: React.FC<Props> = ({ open, onOpenChange, atendimentoId, onSaved }) => {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [jaGerado, setJaGerado] = useState(false);

  // Consignante data
  const [nomeConsignante, setNomeConsignante] = useState('');
  const [telefoneConsignante, setTelefoneConsignante] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dadosBancarios, setDadosBancarios] = useState('');
  const [titularConta, setTitularConta] = useState('');
  // Cadastro completo do consignante (embute o ClienteForm, igual ao contrato de compra).
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteRecord, setClienteRecord] = useState<any | null>(null);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteTocado, setClienteTocado] = useState(false);

  // Loja da venda (define a filial/CNPJ do contrato)
  const [loja, setLoja] = useState<string | null>(null);

  // Moto / financeiro from avaliacao
  const [motoInfo, setMotoInfo] = useState<any>(null);
  const [avaliacaoInfo, setAvaliacaoInfo] = useState<any>(null);
  const [custosOficina, setCustosOficina] = useState<any[]>([]);
  const [estoqueInfo, setEstoqueInfo] = useState<any>(null);

  // Values
  const [valorFechamento, setValorFechamento] = useState('');
  const [valorRepasse, setValorRepasse] = useState('');

  // Custos operacionais
  const [custosOp, setCustosOp] = useState<CustoOperacional[]>([]);
  const [newCustoTipo, setNewCustoTipo] = useState('Processo');
  const [newCustoResp, setNewCustoResp] = useState('Cliente');
  const [newCustoDesc, setNewCustoDesc] = useState('');
  const [newCustoValor, setNewCustoValor] = useState('');

  // Obs
  const [obsContrato, setObsContrato] = useState('');
  const [obsInternas, setObsInternas] = useState('');

  // Date
  const [dataContrato, setDataContrato] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  // Baseline p/ detectar edição desde a última geração/carregamento (igual compra).
  const [baseline, setBaseline] = useState('');
  const consignanteSnapshot = () => JSON.stringify({
    nomeConsignante, telefoneConsignante, cpfCnpj, dadosBancarios, titularConta,
    valorFechamento, valorRepasse, obsContrato, obsInternas,
    dataContrato: dataContrato ? dataContrato.toISOString().slice(0, 10) : '',
    custos: custosOp.map((c) => `${c.tipo}|${c.responsavel}|${c.descricao}|${c.valor}`).join(';'),
  });

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, atendimentoId]);

  // Após terminar de carregar, fixa o baseline com os valores atuais.
  useEffect(() => {
    if (loading) return;
    setBaseline(consignanteSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const loadData = async () => {
    setLoading(true);

    // Find the estoque item that is consignada and linked to this atendimento_id (as atendimento_venda_id)
    const [{ data: estoqueItems }, { data: vendaAtendimento }, lojaMap] = await Promise.all([
      supabase
        .from('estoque_motos')
        .select(ESTOQUE_MOTO_SELECT)
        .eq('atendimento_venda_id', atendimentoId)
        .limit(1),
      supabase.from('atendimentos_motos').select('loja_empresas:loja_id(loja)').eq('id', atendimentoId).maybeSingle(),
      fetchLojaMap(),
    ]);
    setLoja((vendaAtendimento as any)?.loja_empresas?.loja || null);

    const estoqueRaw = estoqueItems?.[0];
    const estoque = estoqueRaw ? mapEstoqueMoto(estoqueRaw, lojaMap) : null;
    setEstoqueInfo(estoque);

    let avaliacao: any = null;
    let moto: any = null;
    let oficinaCosts: any[] = [];
    let consignanteAtendimento: any = null;

    if (estoque?.avaliacao_id) {
      const [{ data: avalData }, { data: custosData }] = await Promise.all([
        supabase.from('avaliacoes').select(`*, ${MARCA_MODELO_SELECT}`).eq('id', estoque.avaliacao_id).maybeSingle(),
        supabase.from('custos_oficina').select('*').eq('avaliacao_id', estoque.avaliacao_id),
      ]);
      avaliacao = avalData ? flattenMarcaModelo(avalData as any) : avalData;
      moto = avaliacao;
      oficinaCosts = custosData || [];

      // Fetch the original consignante's atendimento (the person who left the moto)
      if (avalData?.atendimento_id) {
        const { data: origAtend } = await supabase
          .from('atendimentos_motos')
          .select('cliente_id, cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))')
          .eq('id', avalData.atendimento_id)
          .maybeSingle();
        if ((origAtend as any)?.cliente_id) setClienteId((origAtend as any).cliente_id);
        if (origAtend?.cliente) {
          setClienteRecord(origAtend.cliente);
          consignanteAtendimento = { nome_cliente: (origAtend.cliente as any).nome_razao_social, telefone: (origAtend.cliente as any).telefone };
        } else {
          consignanteAtendimento = null;
        }
      }
    }

    setAvaliacaoInfo(avaliacao);
    setMotoInfo(moto);
    setCustosOficina(oficinaCosts);

    // Load existing contrato_consignante
    const [{ data: contrato }, { data: histGerado }] = await Promise.all([
      supabase.from('contratos_consignante').select('*').eq('atendimento_id', atendimentoId).maybeSingle(),
      supabase.from('status_history').select('id').eq('entity_type', 'contrato_consignante').eq('entity_id', atendimentoId).like('status', 'CONTRATO GERADO%').limit(1),
    ]);

    setJaGerado(!!(histGerado && histGerado.length > 0));

    if (contrato) {
      setContratoId(contrato.id);
      setNomeConsignante(contrato.nome_consignante || '');
      setTelefoneConsignante(formatTelefone(contrato.telefone_consignante || ''));
      setCpfCnpj(formatCpfCnpj(contrato.cpf_cnpj || ''));
      setDadosBancarios(contrato.dados_bancarios || '');
      setTitularConta(contrato.titular_conta || '');
      setValorFechamento((contrato.valor_fechamento ?? avaliacao?.valor_fechamento) != null ? formatCurrencyInput(String(Math.round((contrato.valor_fechamento ?? avaliacao?.valor_fechamento) * 100))) : '');
      setValorRepasse(contrato.valor_repasse ? formatCurrencyInput(String(Math.round(contrato.valor_repasse * 100))) : '');
      setObsContrato(contrato.observacoes_contrato || '');
      setObsInternas(contrato.observacoes_internas || '');
      setDataContrato(contrato.data_contrato ? new Date(contrato.data_contrato + 'T12:00:00') : undefined);

      // Load custos operacionais
      const { data: custosOpData } = await supabase.from('custos_operacionais').select('*').eq('contrato_consignante_id', contrato.id).order('created_at');
      setCustosOp((custosOpData || []).map((c: any) => ({
        id: c.id,
        tipo: c.tipo,
        responsavel: c.responsavel,
        descricao: c.descricao || '',
        valor: c.valor ? formatCurrencyInput(String(Math.round(c.valor * 100))) : '',
      })));
    } else {
      setContratoId(null);
      // Pre-fill consignante data from the original atendimento + contrato_consignacao
      setNomeConsignante(consignanteAtendimento?.nome_cliente || '');
      setTelefoneConsignante(formatTelefone(consignanteAtendimento?.telefone || ''));

      if (estoque?.avaliacao_id) {
        const { data: cc } = await supabase.from('contratos_consignacao').select('*').eq('avaliacao_id', estoque.avaliacao_id).maybeSingle();
        if (cc) {
          setCpfCnpj(formatCpfCnpj(cc.cpf_cnpj || ''));
        } else {
          setCpfCnpj('');
        }
      } else {
        setCpfCnpj('');
      }

      // Valor de Fechamento tem origem na avaliação — exibido no contrato, não editável.
      if (avaliacao?.valor_fechamento != null) {
        setValorFechamento(formatCurrencyInput(String(Math.round(avaliacao.valor_fechamento * 100))));
      } else {
        setValorFechamento('');
      }
      setDadosBancarios('');
      setTitularConta('');
      setValorRepasse('');
      setObsContrato('');
      setObsInternas('');
      setDataContrato(undefined);
      setCustosOp([]);
    }

    setEditandoCliente(false);
    setLoading(false);
  };

  const handleClienteSaved = async (savedId: string) => {
    setClienteId(savedId);
    setClienteTocado(true);
    const { data } = await supabase
      .from('clientes_fornecedores')
      .select('*, clientes_fornecedores_enderecos(*)')
      .eq('id', savedId)
      .maybeSingle();
    if (data) {
      setClienteRecord(data);
      if ((data as any).nome_razao_social) setNomeConsignante((data as any).nome_razao_social);
      if ((data as any).telefone) setTelefoneConsignante(formatTelefone(String((data as any).telefone)));
      if ((data as any).cpf_cnpj) setCpfCnpj(formatCpfCnpj((data as any).cpf_cnpj));
    }
    setEditandoCliente(false);
  };

  // Calculate abatimentos: custos oficina (all) + custos operacionais where responsavel = 'Cliente'
  const calcAbatimentos = () => {
    const oficTotal = custosOficina.filter((c: any) => (c.responsavel || '').toLowerCase() === 'cliente').reduce((sum: number, c: any) => sum + (c.valor_executado || c.valor_previsto || 0), 0);
    const opClienteTotal = custosOp
      .filter(c => c.responsavel === 'Cliente')
      .reduce((sum, c) => sum + parseCurrencyInput(c.valor), 0);
    return oficTotal + opClienteTotal;
  };

  // Auto-calculate repasse
  useEffect(() => {
    const vf = parseCurrencyInput(valorFechamento);
    const abat = calcAbatimentos();
    const repasse = vf - abat;
    setValorRepasse(repasse > 0 ? formatCurrencyInput(String(Math.round(repasse * 100))) : '0,00');
  }, [valorFechamento, custosOp, custosOficina]);

  const addCustoOp = async () => {
    if (!newCustoValor || parseCurrencyInput(newCustoValor) <= 0) {
      toast.error('Informe o valor do custo');
      return;
    }

    const newItem: CustoOperacional = {
      tipo: newCustoTipo,
      responsavel: newCustoResp,
      descricao: newCustoDesc,
      valor: newCustoValor,
    };

    // If contract already saved, insert directly
    if (contratoId) {
      const { data, error } = await supabase.from('custos_operacionais').insert({
        contrato_consignante_id: contratoId,
        tipo: newCustoTipo,
        responsavel: newCustoResp,
        descricao: newCustoDesc || null,
        valor: parseCurrencyInput(newCustoValor),
      } as any).select().single();
      if (error) { toast.error('Erro ao adicionar custo'); return; }
      newItem.id = data.id;
    }

    setCustosOp(prev => [...prev, newItem]);
    setNewCustoTipo('Processo');
    setNewCustoResp('Cliente');
    setNewCustoDesc('');
    setNewCustoValor('');

    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  const removeCustoOp = async (idx: number) => {
    const item = custosOp[idx];
    if (item.id) {
      await supabase.from('custos_operacionais').delete().eq('id', item.id);
    }
    setCustosOp(prev => prev.filter((_, i) => i !== idx));
  };

  const saveContrato = async (): Promise<string | null> => {
    setSaving(true);
    const payload: any = {
      atendimento_id: atendimentoId,
      nome_consignante: nomeConsignante || null,
      telefone_consignante: telefoneConsignante || null,
      cpf_cnpj: cpfCnpj || null,
      dados_bancarios: dadosBancarios || null,
      titular_conta: titularConta || null,
      valor_fechamento: parseCurrencyInput(valorFechamento) || null,
      valor_repasse: parseCurrencyInput(valorRepasse) || null,
      observacoes_contrato: obsContrato || null,
      observacoes_internas: obsInternas || null,
      data_contrato: dataContrato ? format(dataContrato, 'yyyy-MM-dd') : null,
    };

    let id = contratoId;
    if (id) {
      const { error } = await supabase.from('contratos_consignante').update(payload).eq('id', id);
      if (error) { console.error('Erro ao salvar contrato consignante:', error); toast.error('Erro ao salvar: ' + error.message); setSaving(false); return null; }

      // Save custos operacionais that don't have an id yet (added before save)
      const unsavedCustos = custosOp.filter(c => !c.id);
      if (unsavedCustos.length > 0) {
        const rows = unsavedCustos.map(c => ({
          contrato_consignante_id: id,
          tipo: c.tipo,
          responsavel: c.responsavel,
          descricao: c.descricao || null,
          valor: parseCurrencyInput(c.valor),
        }));
        const { data: inserted, error: errCustos } = await supabase.from('custos_operacionais').insert(rows as any).select();
        if (errCustos) { console.error('Erro ao salvar custos operacionais:', errCustos); toast.error('Erro ao salvar custos: ' + errCustos.message); }
        if (inserted) {
          let insertIdx = 0;
          setCustosOp(prev => prev.map(c => {
            if (!c.id && insertIdx < inserted.length) {
              return { ...c, id: inserted[insertIdx++]?.id };
            }
            return c;
          }));
        }
      }
    } else {
      const { data, error } = await supabase.from('contratos_consignante').insert(payload).select().single();
      if (error) { console.error('Erro ao criar contrato consignante:', error); toast.error('Erro ao criar: ' + error.message); setSaving(false); return null; }
      id = data.id;
      setContratoId(data.id);

      // Save custos operacionais that were added before first save
      if (custosOp.length > 0) {
        const rows = custosOp.map(c => ({
          contrato_consignante_id: data.id,
          tipo: c.tipo,
          responsavel: c.responsavel,
          descricao: c.descricao || null,
          valor: parseCurrencyInput(c.valor),
        }));
        const { data: inserted, error: errCustos } = await supabase.from('custos_operacionais').insert(rows as any).select();
        if (errCustos) { console.error('Erro ao salvar custos operacionais:', errCustos); toast.error('Erro ao salvar custos: ' + errCustos.message); }
        if (inserted) {
          setCustosOp(prev => prev.map((c, i) => ({ ...c, id: inserted[i]?.id })));
        }
      }
    }

    // Update valor_fechamento on the avaliacao linked to this estoque item
    const vfParsed = parseCurrencyInput(valorFechamento);
    if (estoqueInfo?.avaliacao_id && vfParsed > 0) {
      await supabase.from('avaliacoes').update({ valor_fechamento: vfParsed }).eq('id', estoqueInfo.avaliacao_id);
    }

    setSaving(false);
    return id;
  };

  const handleSave = async () => {
    const id = await saveContrato();
    if (id) {
      toast.success('Contrato salvo com sucesso!');
      onSaved?.();
      onOpenChange(false);
    }
  };

  const buildPdfData = () => {
    const abat = calcAbatimentos();
    const repasse = parseCurrencyInput(valorFechamento) - abat;

    // Build abatimentos list (only cliente costs)
    const abatimentosList: { descricao: string; valor: string }[] = [];
    for (const c of custosOficina) {
      if ((c.responsavel || '').toLowerCase() !== 'cliente') continue;
      const val = c.valor_executado || c.valor_previsto || 0;
      if (val <= 0) continue;
      const desc = `${(c.tipo || '').toUpperCase().replace('PECA', 'PEÇA').replace('SERVICO', 'SERVIÇO')} - ${(c.detalhes || '-').toUpperCase()}`;
      abatimentosList.push({ descricao: desc, valor: formatCurrency(val) });
    }
    for (const c of custosOp) {
      if (c.responsavel !== 'Cliente') continue;
      const val = parseCurrencyInput(c.valor);
      if (val <= 0) continue;
      abatimentosList.push({ descricao: `PROCESSO - ${(c.descricao || '-').toUpperCase()}`, valor: formatCurrency(val) });
    }

    const anoFab = motoInfo?.ano_fabricacao || estoqueInfo?.ano_fabricacao || '';
    const anoMod = motoInfo?.ano_modelo || estoqueInfo?.ano_modelo || '';
    const anoFabMod = anoFab && anoMod ? `${anoFab}/${anoMod}` : anoFab || anoMod || '-';

    return {
      loja,
      nomeConsignante: nomeConsignante || '-',
      telefoneConsignante: telefoneConsignante || '-',
      cpfCnpj: cpfCnpj || '-',
      dadosBancarios: dadosBancarios || '-',
      titularConta: titularConta || '-',
      bancoCliente: clienteRecord ? {
        banco: clienteRecord.banco ?? null,
        tipoConta: tipoContaLabel(clienteRecord.tipo_conta) ?? null,
        agencia: clienteRecord.agencia ?? null,
        conta: clienteRecord.conta ? `${clienteRecord.conta}${clienteRecord.digito_conta ? `-${clienteRecord.digito_conta}` : ''}` : null,
        chavePix: clienteRecord.chave_pix ?? null,
        favorecido: clienteRecord.favorecido ?? null,
        cpfCnpjFavorecido: clienteRecord.cpf_cnpj_favorecido ?? null,
      } : null,
      marcaMoto: motoInfo?.marca || estoqueInfo?.marca || '-',
      modeloMoto: motoInfo?.modelo || estoqueInfo?.modelo || '-',
      anoFabMod,
      placaMoto: (motoInfo?.placa || estoqueInfo?.placa || '-').replace(/-/g, ''),
      kmMoto: motoInfo?.km || estoqueInfo?.km || '-',
      valorConsignacao: formatCurrency(avaliacaoInfo?.valor_fechamento || parseCurrencyInput(valorFechamento)),
      totalAbatimentos: formatCurrency(abat),
      valorRepasse: formatCurrency(repasse > 0 ? repasse : 0),
      abatimentosList,
      observacoesContrato: obsContrato || '',
      dataContrato: dataContrato ? format(dataContrato, 'dd/MM/yyyy', { locale: ptBR }) : '-',
    };
  };

  const validarConsignante = (): boolean => {
    if (!nomeConsignante?.trim()) { toast.error('Nome do consignante é obrigatório'); return false; }
    if (!dataContrato) { toast.error('Data do contrato é obrigatória'); return false; }
    return true;
  };

  const handleGerar = async () => {
    if (!validarConsignante()) return;

    setGenerating(true);
    const id = await saveContrato();
    if (!id) { setGenerating(false); return; }

    try {
      await generateContratoConsignantePdf(buildPdfData(), 'download');

      if (user) {
        await supabase.from('status_history').insert({
          entity_type: 'contrato_consignante',
          entity_id: atendimentoId,
          status: 'CONTRATO GERADO',
          changed_by: user.id,
          changed_by_name: userName || 'Vendedor',
        });
      }
      setJaGerado(true);
      setBaseline(consignanteSnapshot());
      setClienteTocado(false);
      onSaved?.();
      toast.success('Contrato gerado com sucesso!');
      // Volta para a tela de detalhes.
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar contrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleVisualizar = async () => {
    setGenerating(true);
    try {
      await generateContratoConsignantePdf(buildPdfData(), 'view');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao visualizar');
    } finally {
      setGenerating(false);
    }
  };

  const handleBaixar = async () => {
    setGenerating(true);
    try {
      await generateContratoConsignantePdf(buildPdfData(), 'download');
      // Volta para a tela de detalhes.
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao baixar contrato');
    } finally {
      setGenerating(false);
    }
  };

  const abatimentos = calcAbatimentos();
  const repasseNum = parseCurrencyInput(valorFechamento) - abatimentos;

  // Houve edição desde a última geração/carregamento? (igual contrato de compra)
  const editado = consignanteSnapshot() !== baseline || clienteTocado;
  // Contrato já gerado e sem edições -> só permite baixar/visualizar.
  const modoLeitura = jaGerado && !editado;

  // Resumo do consignante (quando o cadastro está completo) — igual ao contrato de compra.
  const cli = clienteRecord;
  const cliEndereco = cli?.clientes_fornecedores_enderecos?.[0] || null;
  const cadastroCompleto = cadastroClienteCompleto(cli, cliEndereco);
  const fmtTelefone = (v: string | null | undefined) => {
    const d = (v || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v || undefined;
  };

  if (!open) return null;

  return (
    <div className="space-y-4 animate-fade-in pb-10" ref={listRef}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" /> Pagamento ao Consignante
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
              {/* Card: Dados do Consignante */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" /> Dados do Consignante
                    {clienteId && cadastroCompleto && !editandoCliente && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto"
                        onClick={() => setEditandoCliente(true)}
                        title="Editar dados do consignante"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {!clienteId ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Nome</Label>
                          <Input value={nomeConsignante} onChange={e => setNomeConsignante(e.target.value)} placeholder="Nome completo" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Telefone</Label>
                          <Input value={telefoneConsignante} onChange={e => setTelefoneConsignante(formatTelefone(e.target.value))} maxLength={15} placeholder="(00) 00000-0000" />
                        </div>
                      </div>
                      <div className="space-y-1.5 sm:max-w-[50%]">
                        <Label>CPF/CNPJ</Label>
                        <Input value={cpfCnpj} onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))} maxLength={18} placeholder="000.000.000-00" />
                      </div>
                    </div>
                  ) : (cadastroCompleto && !editandoCliente) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Nome" value={cli?.nome_razao_social} />
                      <InfoDisplay label="CPF/CNPJ" value={cli?.cpf_cnpj ? formatCpfCnpj(cli.cpf_cnpj) : undefined} />
                      <InfoDisplay label="Sexo" value={cli?.sexo} />
                      <InfoDisplay label="Data de Nascimento" value={fmtDataNasc(cli?.data_nascimento)} />
                      <InfoDisplay label="E-mail (NF)" value={cli?.email_nf} />
                      <InfoDisplay label="Telefone (comercial)" value={fmtTelefone(cli?.telefone_comercial)} />
                    </div>
                  ) : (
                    <ClienteForm
                      embedded
                      id={clienteId}
                      onSaved={handleClienteSaved}
                      onCancel={editandoCliente && cadastroCompleto ? () => setEditandoCliente(false) : undefined}
                    />
                  )}

                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">Dados para repasse ao consignante</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Titular da Conta</Label>
                      <Input value={titularConta} onChange={e => setTitularConta(e.target.value)} placeholder="Nome do titular" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dados Bancários</Label>
                    <Textarea rows={2} value={dadosBancarios} onChange={e => setDadosBancarios(e.target.value)} placeholder="Banco, Agência, Conta, Tipo (Corrente/Poupança), PIX..." />
                  </div>
                </CardContent>
              </Card>

              {clienteId && cadastroCompleto && !editandoCliente && (
                <>
                  {/* Card: Endereço */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" /> Endereço
                      </CardTitle>
                      <Separator className="mt-2" />
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="CEP" value={cliEndereco?.cep} />
                      <InfoDisplay label="Logradouro" value={cliEndereco?.logradouro} />
                      <InfoDisplay label="Número" value={cliEndereco?.numero} />
                      <InfoDisplay label="Complemento" value={cliEndereco?.complemento} />
                      <InfoDisplay label="Bairro" value={cliEndereco?.bairro} />
                      <InfoDisplay label="Cidade" value={cliEndereco?.cidade} />
                      <InfoDisplay label="UF" value={cliEndereco?.uf} />
                      <InfoDisplay label="País" value={cliEndereco?.pais} />
                    </CardContent>
                  </Card>

                  {/* Card: Dados Bancários (cadastro) */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-primary" /> Dados Bancários (cadastro)
                      </CardTitle>
                      <Separator className="mt-2" />
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Banco" value={cli?.banco} />
                      <InfoDisplay label="Tipo de Conta" value={tipoContaLabel(cli?.tipo_conta)} />
                      <InfoDisplay label="Agência" value={cli?.agencia} />
                      <InfoDisplay label="Conta" value={cli?.conta ? `${cli.conta}${cli?.digito_conta ? `-${cli.digito_conta}` : ''}` : undefined} />
                      <InfoDisplay label="Chave PIX" value={cli?.chave_pix} />
                      <InfoDisplay label="Favorecido" value={cli?.favorecido} />
                      <InfoDisplay label="CPF/CNPJ do Favorecido" value={cli?.cpf_cnpj_favorecido ? formatCpfCnpj(cli.cpf_cnpj_favorecido) : undefined} />
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Card: Moto */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bike className="h-4 w-4 text-primary" /> Moto
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {(motoInfo || estoqueInfo) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <InfoDisplay label="Marca" value={motoInfo?.marca || estoqueInfo?.marca} />
                      <InfoDisplay label="Modelo" value={(motoInfo?.modelo || estoqueInfo?.modelo || '').toUpperCase() || undefined} />
                      <InfoDisplay label="Ano Fab/Mod" value={(() => {
                        const f = motoInfo?.ano_fabricacao || estoqueInfo?.ano_fabricacao || '';
                        const m = motoInfo?.ano_modelo || estoqueInfo?.ano_modelo || '';
                        return f && m ? `${f}/${m}` : (f || m || undefined);
                      })()} />
                      <InfoDisplay label="Placa" value={(motoInfo?.placa || estoqueInfo?.placa) ? String(motoInfo?.placa || estoqueInfo?.placa).replace(/-/g, '') : undefined} />
                    </div>
                  )}
                  <div className="max-w-xs">
                    <InfoDisplay label="Valor de Fechamento" value={valorFechamento ? `R$ ${valorFechamento}` : '—'} />
                  </div>
                </CardContent>
              </Card>

              {/* Card: Resumo Financeiro */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Resumo Financeiro
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-3">

                {/* Add custo operacional inline */}
                <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs font-medium">Responsável</label>
                    <Select value={newCustoResp} onValueChange={setNewCustoResp}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Loja">Loja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Descrição</label>
                    <Input className="mt-1 h-9" value={newCustoDesc} onChange={e => setNewCustoDesc(e.target.value)} placeholder="Descrição" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Valor</label>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input className="pl-7 h-9" value={newCustoValor} onChange={e => setNewCustoValor(formatCurrencyInput(e.target.value))} inputMode="numeric" placeholder="0,00" />
                    </div>
                  </div>
                  <Button size="sm" className="h-9" onClick={addCustoOp}><Plus className="h-4 w-4" /></Button>
                </div>

                {/* Unified cost list */}
                {(custosOficina.length > 0 || custosOp.length > 0) && (
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                    {custosOficina.map((c: any) => {
                      const val = c.valor_executado || c.valor_previsto || 0;
                      if (val <= 0) return null;
                      const isAbatido = (c.responsavel || '').toLowerCase() === 'cliente';
                      return (
                        <div key={c.id} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">Oficina</span>
                          <span className="flex-1 truncate text-xs font-medium">
                            {(c.responsavel || '').toUpperCase()} - {(c.tipo || '').toUpperCase().replace('PECA', 'PEÇA').replace('SERVICO', 'SERVIÇO')} - {(c.detalhes || '-').toUpperCase()}
                          </span>
                          <span className={`font-semibold text-sm whitespace-nowrap ${isAbatido ? 'text-destructive' : 'text-foreground'}`}>{formatCurrency(val)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={async () => {
                            await supabase.from('custos_oficina').delete().eq('id', c.id);
                            setCustosOficina(prev => prev.filter((item: any) => item.id !== c.id));
                            toast.success('Custo de oficina removido');
                          }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                    {custosOp.map((c, idx) => {
                      const val = parseCurrencyInput(c.valor);
                      if (val <= 0) return null;
                      const isAbatido = c.responsavel === 'Cliente';
                      return (
                        <div key={`op-${idx}`} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">Operação</span>
                          <span className="flex-1 truncate text-xs font-medium">
                            {(c.responsavel || '').toUpperCase()} - PROCESSO - {(c.descricao || '-').toUpperCase()}
                          </span>
                          <span className={`font-semibold text-sm whitespace-nowrap ${isAbatido ? 'text-destructive' : 'text-foreground'}`}>{formatCurrency(val)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCustoOp(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">Total de Abatimentos</span>
                    <span className="text-lg font-bold text-destructive">
                      {formatCurrency(abatimentos)}
                    </span>
                  </div>
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">Valor de Repasse</span>
                    <span className={`text-lg font-bold ${repasseNum >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(repasseNum > 0 ? repasseNum : 0)}
                    </span>
                  </div>
                </div>
                </CardContent>
              </Card>

              {/* Card: Observações */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Observações
                  </CardTitle>
                  <Separator className="mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Observações do Contrato</Label>
                    <Textarea rows={3} value={obsContrato} onChange={e => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações Internas</Label>
                    <Textarea rows={3} value={obsInternas} onChange={e => setObsInternas(e.target.value)} placeholder="Observações internas..." />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Data do Contrato <span className="text-destructive">*</span></Label>
                    <Popover open={calOpen} onOpenChange={setCalOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataContrato && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataContrato ? format(dataContrato, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dataContrato} onSelect={setDataContrato} initialFocus className="p-3 pointer-events-auto" />
                        <div className="border-t p-2 flex justify-end">
                          <Button size="sm" disabled={!dataContrato} onClick={() => setCalOpen(false)}>OK</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardContent>
              </Card>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            {modoLeitura ? (
              <>
                <Button variant="outline" onClick={handleBaixar} disabled={generating}>
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </Button>
                <Button onClick={handleVisualizar} disabled={generating}>
                  <Eye className="h-4 w-4 mr-1" /> Visualizar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1">
                  <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button onClick={handleGerar} disabled={generating}>
                  <Download className="h-4 w-4 mr-1" /> {generating ? 'Gerando...' : 'Gerar'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ContratoConsignanteDialog;
