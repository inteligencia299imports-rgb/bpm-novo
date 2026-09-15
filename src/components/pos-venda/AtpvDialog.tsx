import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Bike, User, FileText, Loader2, CheckCircle2, ExternalLink, AlertTriangle, History, PackagePlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatPersonName, cn } from '@/lib/utils';
import { extrairErroFuncao } from '@/lib/edgeFunctionError';
import { useAuth } from '@/contexts/AuthContext';
import { validarCpf } from '@/lib/cpf';
import StatusTimeline from '@/components/shared/StatusTimeline';

/**
 * Emissão do ATPV-e de uma moto 0km (RENAVE / SERPRO) — última etapa do pós-venda.
 * Página aberta a partir do ProcessoDialog (etapa ATPV-E) — centraliza aqui tudo que
 * importa pra essa etapa: dados do cliente, moto que será emplacada e o histórico
 * completo de chamadas ao RENAVE (entrada em estoque, saída/ATPV-e etc — tabela
 * renave_chamadas), sem dados de pagamento/agregados/observações (isso já foi
 * resolvido lá na proposta/NF-e de venda).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento: any;
  /** Linha achatada de estoque_motos_novas (fonte === '0km'), com os campos renave_*. */
  estoqueMoto: any;
  onDone?: () => void;
}

const formatCpfCnpj = (v: string) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
    <span className="text-sm font-semibold">{value || '—'}</span>
  </div>
);

const OPERACAO_LABEL: Record<string, string> = {
  cliente: 'Sessão RENAVE',
  pendentes: 'Consulta de pendentes',
  entrada: 'Entrada em estoque',
  saida: 'Saída (ATPV-e)',
  'atpv-pdf': 'PDF do ATPV-e',
};

// Uma "operação" lógica (ex.: 'saida') pode fazer várias chamadas HTTP
// diferentes (município, vínculo de NF, saída propriamente dita, PDF) — cada
// uma vira uma linha em renave_chamadas com o mesmo `operacao`. Rotular só
// pelo `operacao` fazia a linha do tempo mostrar "SAÍDA (ATPV-e)" repetido
// várias vezes pra uma única ação bem-sucedida (achado 2026-09-15) — o
// rótulo por endpoint mostra o que cada linha realmente fez.
const ENDPOINT_LABEL: Record<string, string> = {
  '/api/cliente-autenticado': 'Sessão RENAVE',
  '/api/veiculos-zero-km-pendentes-entrada-estoque': 'Consulta de pendentes',
  '/api/entradas-estoque-zero-km': 'Entrada em estoque',
  '/api/municipios': 'Consulta de município',
  '/api/notas-fiscais': 'Vínculo de nota fiscal',
  '/api/saidas-estoque-veiculo-zero-km': 'Saída (ATPV-e)',
  '/api/pdf-atpv': 'PDF do ATPV-e',
};

const AtpvDialog: React.FC<Props> = ({ open, onOpenChange, atendimento, estoqueMoto, onDone }) => {
  const { user } = useAuth();
  const [emitindo, setEmitindo] = useState(false);
  const [nfVenda, setNfVenda] = useState<any | null>(null);
  const [nfLoading, setNfLoading] = useState(true);
  const [estoque, setEstoque] = useState<any>(estoqueMoto);
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);
  const [dataEntrada, setDataEntrada] = useState('');
  const [cpfOperador, setCpfOperador] = useState('');
  const [funcionarioCpf, setFuncionarioCpf] = useState<string | null>(null);
  const [funcionarioLoading, setFuncionarioLoading] = useState(true);
  const [entrandoEstoque, setEntrandoEstoque] = useState(false);

  useEffect(() => { setEstoque(estoqueMoto); }, [estoqueMoto]);

  // CPF do operador vem do cadastro de funcionário (funcionarios_hcm.usuario_id
  // = usuário logado); só se não achar é que o campo fica disponível pra
  // preencher na mão.
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancel = false;
    setFuncionarioLoading(true);
    (supabase as any)
      .from('funcionarios_hcm')
      .select('cpf')
      .eq('usuario_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancel) return;
        const cpf = data?.cpf ? String(data.cpf).replace(/\D/g, '') : null;
        setFuncionarioCpf(cpf && cpf.length === 11 ? cpf : null);
        setFuncionarioLoading(false);
      });
    return () => { cancel = true; };
  }, [open, user?.id]);

  const emnId: string | undefined = estoque?.id;
  const chassi: string = estoque?.chassi || '';
  const cli = atendimento?.cliente || {};
  const end = cli?.clientes_fornecedores_enderecos?.[0] || {};

  const renaveEntrouEstoque = !!estoque?.renave_id_estoque;
  const atpvEmitido = !!estoque?.renave_atpv_numero;

  // Reabrir a tela não garante que o `estoqueMoto` (prop, vindo do pai) esteja
  // atualizado — se o pai não recarregou a lista depois de uma emissão, a
  // tela reabre com dado velho e mostra o botão de emitir de novo mesmo já
  // feito. Rebusca direto do banco toda vez que abre.
  useEffect(() => {
    if (!open || !emnId) return;
    let cancel = false;
    (supabase as any).from('estoque_motos_novas').select('*').eq('id', emnId).maybeSingle()
      .then(({ data }: any) => { if (!cancel && data) setEstoque((prev: any) => ({ ...prev, ...data })); });
    return () => { cancel = true; };
  }, [open, emnId]);

  useEffect(() => {
    if (!open || !emnId) return;
    let cancel = false;
    setNfLoading(true);
    (supabase as any)
      .from('nfe_entradas')
      .select('chave_nfe, numero, serie, status, ambiente, data_emissao, valor_total')
      .eq('estoque_moto_nova_id', emnId)
      .eq('operacao', 'venda_0km')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancel) { setNfVenda(data || null); setNfLoading(false); } });
    return () => { cancel = true; };
  }, [open, emnId]);

  // NF-e de compra (faturamento da montadora) — mesma que a entrada RENAVE usa
  // (chave/valor) no edge function. A data de entrada no RENAVE, por padrão,
  // é a data dessa nota — não faz sentido sugerir "hoje".
  useEffect(() => {
    if (!open || !emnId) return;
    let cancel = false;
    (supabase as any)
      .from('nfe_entradas')
      .select('data_entrada, data_emissao')
      .eq('estoque_moto_nova_id', emnId)
      .eq('operacao', 'compra')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancel) return;
        const base = data?.data_entrada || data?.data_emissao;
        setDataEntrada(base ? String(base).slice(0, 10) : new Date().toISOString().slice(0, 10));
      });
    return () => { cancel = true; };
  }, [open, emnId]);

  const carregarHistorico = async () => {
    if (!emnId && !chassi) return;
    setHistoricoLoading(true);
    // Só o que deu certo — falhas aparecem só como "última tentativa" no
    // card de ação, não poluem a linha do tempo.
    let query = (supabase as any).from('renave_chamadas').select('*').eq('sucesso', true).order('created_at', { ascending: false }).limit(50);
    query = emnId && chassi
      ? query.or(`estoque_moto_nova_id.eq.${emnId},chassi.eq.${chassi}`)
      : emnId
        ? query.eq('estoque_moto_nova_id', emnId)
        : query.eq('chassi', chassi);
    const { data } = await query;
    // Município e vínculo de nota fiscal são passos internos de apoio (rodam
    // de novo a cada tentativa de saída, inclusive as que falharam depois em
    // outro passo) — mostrar isso na timeline não é útil pro usuário e ainda
    // parece duplicado. Fica só nos marcos reais do histórico da moto.
    const rows: any[] = (data || []).filter((r: any) => r.endpoint !== '/api/municipios' && r.endpoint !== '/api/notas-fiscais');
    const usuarioIds = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean)));
    let nomes: Record<string, string> = {};
    if (usuarioIds.length > 0) {
      const { data: users } = await (supabase as any).from('user_roles').select('user_id, nome').in('user_id', usuarioIds);
      nomes = Object.fromEntries((users || []).map((u: any) => [u.user_id, u.nome]));
    }
    setHistorico(rows.map((r) => ({
      id: r.id,
      status: ENDPOINT_LABEL[r.endpoint] || OPERACAO_LABEL[r.operacao] || r.operacao,
      created_at: r.created_at,
      changed_by_name: r.usuario_id ? nomes[r.usuario_id] : null,
    })));
    setHistoricoLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emnId, chassi]);

  const recarregarEstoque = async () => {
    if (!emnId) return;
    const { data } = await (supabase as any).from('estoque_motos_novas').select('*').eq('id', emnId).maybeSingle();
    if (data) setEstoque({ ...estoque, ...data });
  };

  const nfAutorizada = !!nfVenda && nfVenda.status === 'processada' && nfVenda.ambiente === 'producao' && !!nfVenda.chave_nfe;
  const cpfEnviado = funcionarioCpf || cpfOperador;
  const cpfOperadorValido = validarCpf(cpfOperador);
  const cpfEnviadoValido = !!funcionarioCpf || cpfOperadorValido;

  const fazerEntrada = async () => {
    if (!emnId) return;
    setEntrandoEstoque(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: {
          acao: 'entrada',
          estoque_moto_nova_id: emnId,
          quilometragem_hodometro: 0, // 0km — sem hodômetro rodado
          data_entrada_estoque: new Date(dataEntrada + 'T12:00:00').toISOString(),
          cpf_operador: cpfEnviado,
        },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha na entrada RENAVE'));
        await Promise.all([recarregarEstoque(), carregarHistorico()]);
        return;
      }
      toast.success(`Entrada RENAVE OK — RENAVAM ${res?.estoque?.renavam ?? '—'}`);
      await Promise.all([recarregarEstoque(), carregarHistorico()]);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      setEntrandoEstoque(false);
    }
  };

  const emitir = async () => {
    if (!emnId) return;
    setEmitindo(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'saida', estoque_moto_nova_id: emnId, atendimento_id: atendimento.id, cpf_operador: cpfEnviado },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao emitir o ATPV-e'));
        await Promise.all([recarregarEstoque(), carregarHistorico()]);
        return;
      }
      toast.success(`ATPV-e emitido${res?.atpv_numero ? ` — Nº ${res.atpv_numero}` : ''}`);
      await Promise.all([recarregarEstoque(), carregarHistorico()]);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      setEmitindo(false);
    }
  };

  if (!open) return null;

  const motoLabel = [estoque?.marca, estoque?.modelo].filter(Boolean).join(' ') || 'Moto 0km';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Emissão do ATPV-e
          </h1>
          <p className="text-xs text-muted-foreground">RENAVE / SERPRO — {motoLabel}</p>
        </div>
        {atpvEmitido && (
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700">ATPV-e emitido</Badge>
            {estoque?.renave_atpv_url && (
              <Button
                size="sm"
                className="gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700"
                onClick={() => window.open(estoque.renave_atpv_url, '_blank', 'noopener')}
              >
                <ExternalLink className="h-3.5 w-3.5" /> ATPV-e
              </Button>
            )}
          </span>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Info label="Nome / Razão Social" value={formatPersonName(cli?.nome_razao_social || '')} />
            <Info label="CPF / CNPJ" value={cli?.cpf_cnpj ? formatCpfCnpj(cli.cpf_cnpj) : '—'} />
            <Info label="E-mail" value={cli?.email} />
            <Info label="Município / UF" value={[end?.cidade, end?.uf].filter(Boolean).join(' / ')} />
            <Info label="Logradouro" value={[end?.logradouro, end?.numero].filter(Boolean).join(', ')} />
            <Info label="CEP" value={end?.cep} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Bike className="h-4 w-4 text-primary" /> Dados da Moto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Info label="Marca / Modelo" value={motoLabel} />
            <Info label="Chassi" value={chassi || '—'} />
            <Info label="RENAVAM" value={estoque?.renave_renavam || estoque?.renavam} />
            <Info label="Placa" value={estoque?.renave_placa || estoque?.placa} />
            <Info label="idEstoque RENAVE" value={estoque?.renave_id_estoque} />
            <Info label="Estado RENAVE" value={estoque?.renave_estado} />
            <Info
              label="NF-e de Venda"
              value={
                nfLoading ? 'Carregando…'
                  : !nfVenda ? 'Não emitida'
                    : `Nº ${nfVenda.numero || '—'} / Série ${nfVenda.serie || '—'}`
              }
            />
          </CardContent>
        </Card>
      </div>

      {atpvEmitido ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="space-y-2 py-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> ATPV-e emitido — Nº {estoque?.renave_atpv_numero}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Info label="Termo de saída" value={estoque?.renave_num_termo_saida} />
              <Info label="Estado RENAVE" value={estoque?.renave_estado} />
              <Info label="Placa" value={estoque?.renave_placa} />
            </div>
            <p className="text-xs text-muted-foreground">O pós-venda foi concluído com a emissão do ATPV-e.</p>
          </CardContent>
        </Card>
      ) : !renaveEntrouEstoque ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Entrada RENAVE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Data da entrada</Label>
                <Input className="mt-1" type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">CPF do Operador</Label>
                {funcionarioLoading ? (
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</p>
                ) : funcionarioCpf ? (
                  <p className="mt-1 text-sm font-semibold">{formatCpfCnpj(funcionarioCpf)}</p>
                ) : (
                  <Input
                    className={cn('mt-1', cpfOperador.length === 11 && !cpfOperadorValido && 'border-destructive text-destructive focus-visible:ring-destructive')}
                    inputMode="numeric"
                    value={formatCpfCnpj(cpfOperador)}
                    onChange={(e) => setCpfOperador(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="000.000.000-00"
                  />
                )}
              </div>
            </div>
            <Button className="w-full gap-2" disabled={entrandoEstoque || funcionarioLoading || !cpfEnviadoValido} onClick={fazerEntrada}>
              {entrandoEstoque ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Processar Entrada
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {!nfLoading && !nfAutorizada && (
            <span className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {!nfVenda ? 'Nenhuma NF-e de venda 0km encontrada — emita a NF-e antes do ATPV-e.' : 'A NF-e de venda precisa estar autorizada em produção para emitir o ATPV-e.'}
            </span>
          )}
          {!funcionarioLoading && !funcionarioCpf && (
            <div className="max-w-[200px]">
              <Label className="text-xs text-muted-foreground">CPF do Operador</Label>
              <Input
                className={cn('mt-1', cpfOperador.length === 11 && !cpfOperadorValido && 'border-destructive text-destructive focus-visible:ring-destructive')}
                inputMode="numeric"
                value={formatCpfCnpj(cpfOperador)}
                onChange={(e) => setCpfOperador(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="000.000.000-00"
              />
            </div>
          )}
          <Button
            className="w-full gap-2"
            disabled={emitindo || funcionarioLoading || !nfAutorizada || !cpfEnviadoValido}
            onClick={emitir}
          >
            {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Emitir ATPV-e e concluir pós-venda
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {historicoLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</span>
          ) : (
            <StatusTimeline history={historico} formatLabel={(raw) => raw} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AtpvDialog;
