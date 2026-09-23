import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Bike, User, Loader2, AlertTriangle, History, PackageMinus, CheckCircle2, Download, ExternalLink, RefreshCw, Circle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn, firstLastName, formatPersonName } from '@/lib/utils';
import { extrairErroFuncao } from '@/lib/edgeFunctionError';
import { useAuth } from '@/contexts/AuthContext';
import { validarCpf } from '@/lib/cpf';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';

/**
 * Saída de moto SEMINOVA vendida do estoque no RENAVE — etapa "SAÍDA RENAVE"
 * do Pós-Venda. Contraparte do RenaveEntradaUsadoDialog (Pós-Compra): o
 * estoque RENAVE da seminova vive na avaliação da moto (renave_id_estoque),
 * então a saída lê/grava lá também (colunas renave_saida_*).
 *
 * Página aberta a partir do ProcessoDialog — mesmo padrão do AtpvDialog (0km):
 * substitui o conteúdo do detalhe em vez de abrir um pop-up por cima.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Atendimento da venda (com `cliente` e endereços). */
  atendimento: any;
  /** Avaliação da moto vendida (estoque_motos.avaliacao_id). */
  avaliacaoId: string;
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

const ENDPOINT_LABEL: Record<string, string> = {
  '/api/solicitacoes-saida-estoque': 'Saída de estoque',
  '/api/notas-fiscais': 'Vínculo da NF-e de venda',
  '/api/pdf-atpv': 'Download ATPV-e da venda',
  '/api/solicitacoes-cancelamento-saida-estoque': 'Cancelamento da saída',
};

// Mesmo layout de passos do RenaveEntradaUsadoDialog (linha vertical contínua
// desenhada pelo pai, número dentro do círculo).
const StepRow = ({ numero, titulo, feito, children }: { numero: number; titulo: string; feito: boolean; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 pb-10 last:pb-0">
    <div className="w-6 shrink-0 flex justify-center">
      <span className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold z-10',
        feito ? 'bg-primary text-primary-foreground' : 'bg-background text-primary border-2 border-primary',
      )}>
        {numero}
      </span>
    </div>
    <div className="flex-1 min-w-0 space-y-1">
      <span className="text-sm font-semibold leading-none -mt-0.5 block">{titulo}</span>
      <div>{children}</div>
    </div>
  </div>
);

const Requisito = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <li className={cn('flex items-center gap-2 text-xs', ok ? 'text-foreground' : 'text-muted-foreground')}>
    {ok
      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      : <Circle className="h-3.5 w-3.5 shrink-0" />}
    <span>{children}</span>
  </li>
);

const RenaveSaidaUsadoDialog: React.FC<Props> = ({ open, onOpenChange, atendimento, avaliacaoId, onDone }) => {
  const { user } = useAuth();
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nfVenda, setNfVenda] = useState<any | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);
  const [cpfOperador, setCpfOperador] = useState('');
  const [funcionarioCpf, setFuncionarioCpf] = useState<string | null>(null);
  const [funcionarioLoading, setFuncionarioLoading] = useState(true);

  const cli = atendimento?.cliente || {};
  const enderecos: any[] = cli?.clientes_fornecedores_enderecos || [];
  const end = enderecos.find((e) => e.tipo === 'fiscal') || enderecos[0] || {};

  const carregarAvaliacao = async () => {
    const { data } = await (supabase as any)
      .from('avaliacoes')
      .select(`id, chassi, placa, renavam, renave_id_estoque, renave_estado, renave_nf_vinculada_em, renave_atpv_assinatura_enviada_em, renave_crlve_url, renave_saida_em, renave_saida_atendimento_id, renave_num_termo_saida, renave_termo_saida_url, renave_saida_atpv_numero, renave_saida_atpv_url, renave_nf_venda_vinculada_em, renave_saida_ultimo_erro, ${MARCA_MODELO_SELECT}`)
      .eq('id', avaliacaoId)
      .maybeSingle();
    setAvaliacao(flattenMarcaModelo(data) || null);
  };

  const carregarNfVenda = async () => {
    const { data } = await (supabase as any)
      .from('nfe_entradas')
      .select('chave_nfe, numero, serie, status, ambiente, data_emissao, valor_total')
      .eq('atendimento_id', atendimento.id)
      .eq('operacao', 'venda_seminova')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setNfVenda(data || null);
  };

  const carregarHistorico = async () => {
    setHistoricoLoading(true);
    // Só as chamadas da saída (a entrada tem o próprio histórico no Pós-Compra).
    const { data } = await (supabase as any)
      .from('renave_chamadas')
      .select('*')
      .eq('avaliacao_id', avaliacaoId)
      .eq('sucesso', true)
      .like('operacao', 'saida-usado%')
      .order('created_at', { ascending: false })
      .limit(50);
    const rows: any[] = (data || []).filter((r: any) => r.endpoint !== '/api/municipios');
    const usuarioIds = Array.from(new Set(rows.map((r) => r.usuario_id).filter(Boolean)));
    let nomes: Record<string, string> = {};
    if (usuarioIds.length > 0) {
      const { data: users } = await (supabase as any).from('user_roles').select('user_id, nome').in('user_id', usuarioIds);
      nomes = Object.fromEntries((users || []).map((u: any) => [u.user_id, firstLastName(u.nome)]));
    }
    setHistorico(rows.map((r) => ({
      id: r.id,
      status: ENDPOINT_LABEL[r.endpoint] || r.operacao,
      created_at: r.created_at,
      changed_by_name: r.usuario_id ? nomes[r.usuario_id] : null,
    })));
    setHistoricoLoading(false);
  };

  useEffect(() => {
    if (!open || !avaliacaoId) return;
    (async () => {
      setLoading(true);
      await Promise.all([carregarAvaliacao(), carregarNfVenda()]);
      setLoading(false);
    })();
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacaoId, atendimento?.id]);

  // CPF do operador vem do cadastro de funcionário; só sem ele o campo aparece.
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

  const cpfEnviado = funcionarioCpf || cpfOperador;
  const cpfOperadorValido = validarCpf(cpfOperador);
  const cpfEnviadoValido = !!funcionarioCpf || cpfOperadorValido;

  // Pré-requisitos da SERPRO pra saída (manual solicitar-saida-estoque).
  const entrouEstoque = !!avaliacao?.renave_id_estoque;
  const nfCompraVinculada = !!avaliacao?.renave_nf_vinculada_em;
  const assinaturaEntradaEnviada = !!avaliacao?.renave_atpv_assinatura_enviada_em;
  const estadoConfirmado = String(avaliacao?.renave_estado ?? '').toUpperCase() === 'CONFIRMADO';
  const nfVendaAutorizada = !!nfVenda && nfVenda.status === 'processada' && nfVenda.ambiente === 'producao' && !!nfVenda.chave_nfe;
  const podeSair = entrouEstoque && nfCompraVinculada && assinaturaEntradaEnviada && estadoConfirmado && nfVendaAutorizada;

  const saiuEstoque = !!avaliacao?.renave_saida_em;
  const nfVendaVinculada = !!avaliacao?.renave_nf_venda_vinculada_em;

  const invocar = async (body: Record<string, unknown>, falha: string): Promise<any | null> => {
    const { data: res, error } = await supabase.functions.invoke('renave', { body });
    if (error || (res && res.error)) {
      toast.error(res?.error || await extrairErroFuncao(error, falha));
      return null;
    }
    return res;
  };

  const [atualizandoEstado, setAtualizandoEstado] = useState(false);
  const handleAtualizarEstado = async () => {
    setAtualizandoEstado(true);
    try {
      await invocar({ acao: 'estoque-status', avaliacao_id: avaliacaoId }, 'Falha ao consultar o estado no RENAVE');
      await carregarAvaliacao();
    } finally {
      setAtualizandoEstado(false);
    }
  };

  // ---- Passo 1: saída ----
  const [saindo, setSaindo] = useState(false);
  const confirmarSaida = async () => {
    if (!podeSair || !cpfEnviadoValido) return;
    setSaindo(true);
    try {
      const res = await invocar({ acao: 'saida-usado', atendimento_id: atendimento.id, cpf_operador: cpfEnviado }, 'Falha na saída RENAVE');
      if (res) {
        toast.success(`Saída RENAVE confirmada${res.atpv_numero ? ` — ATPV-e Nº ${res.atpv_numero}` : ''}`);
        onDone?.();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      await Promise.all([carregarAvaliacao(), carregarHistorico()]);
      setSaindo(false);
    }
  };

  // ---- Recuperação: cancelar uma saída indevida ----
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const handleCancelarSaida = async () => {
    if (!cpfEnviadoValido) { toast.error('Informe um CPF de operador válido antes de cancelar.'); return; }
    setCancelando(true);
    try {
      const res = await invocar({ acao: 'saida-usado-cancelar', atendimento_id: atendimento.id, cpf_operador: cpfEnviado }, 'Falha ao cancelar a saída');
      if (res) {
        toast.success('Saída cancelada — a moto voltou ao estoque no RENAVE');
        setMostrarCancelar(false);
      }
    } finally {
      await Promise.all([carregarAvaliacao(), carregarHistorico()]);
      setCancelando(false);
    }
  };

  // ---- Passos 2-4: retry/documentos depois da saída ----
  const [executando, setExecutando] = useState<string | null>(null);
  const executar = async (acao: string, sucesso: string, falha: string) => {
    setExecutando(acao);
    try {
      const res = await invocar({ acao, atendimento_id: atendimento.id }, falha);
      if (res) toast.success(sucesso);
    } finally {
      await Promise.all([carregarAvaliacao(), carregarHistorico()]);
      setExecutando(null);
    }
  };

  if (!open) return null;

  const abrir = (url: string) => window.open(url, '_blank', 'noopener');
  const botaoVerde = 'gap-1.5 w-24 justify-center text-white bg-emerald-600 hover:bg-emerald-700 shrink-0';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-primary" /> Saída RENAVE
            {saiuEstoque && (
              <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirmada
              </Badge>
            )}
          </h1>
        </div>
      </div>

      <Separator />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Comprador</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Info label="Nome / Razão Social" value={formatPersonName(cli?.nome_razao_social || '')} />
                <Info label="CPF / CNPJ" value={cli?.cpf_cnpj ? formatCpfCnpj(cli.cpf_cnpj) : undefined} />
                <Info label="E-mail" value={cli?.email} />
                <Info label="Município / UF" value={[end?.cidade, end?.uf].filter(Boolean).join(' / ')} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Bike className="h-4 w-4 text-primary" /> Dados da Moto</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Info label="Marca / Modelo" value={[avaliacao?.marca, avaliacao?.modelo].filter(Boolean).join(' ')} />
                <Info label="Placa" value={avaliacao?.placa} />
                <Info label="Chassi" value={avaliacao?.chassi} />
                <Info label="RENAVAM" value={avaliacao?.renavam} />
                <Info label="ID Estoque RENAVE" value={avaliacao?.renave_id_estoque} />
                <Info label="Estado RENAVE" value={avaliacao?.renave_estado ? <span className="text-primary">{avaliacao.renave_estado}</span> : undefined} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-6">
              <CardTitle className="text-sm flex items-center gap-2"><PackageMinus className="h-4 w-4 text-primary" /> Saída no RENAVE (SERPRO)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {avaliacao?.renave_saida_ultimo_erro && (
                <span className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {avaliacao.renave_saida_ultimo_erro}
                </span>
              )}

              <div className="relative">
                <div className="absolute left-[11.5px] top-2 bottom-2 w-px bg-primary/40" />

                <StepRow numero={1} titulo="Registrar saída" feito={saiuEstoque}>
                  {saiuEstoque ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Saída confirmada em {format(new Date(avaliacao.renave_saida_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}.
                        </span>
                        {!mostrarCancelar && (
                          <button
                            type="button"
                            onClick={() => setMostrarCancelar(true)}
                            className="text-xs text-muted-foreground underline decoration-dotted hover:text-destructive"
                          >
                            Cancelar saída
                          </button>
                        )}
                      </div>
                      {mostrarCancelar && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Só vale enquanto o Detran não transferiu pro comprador. */}
                          {!funcionarioCpf && (
                            <Input
                              className={cn('h-8 w-36 text-sm', cpfOperador.length === 11 && !cpfOperadorValido && 'border-destructive text-destructive')}
                              inputMode="numeric"
                              value={formatCpfCnpj(cpfOperador)}
                              onChange={(e) => setCpfOperador(e.target.value.replace(/\D/g, '').slice(0, 11))}
                              placeholder="CPF do operador"
                            />
                          )}
                          <Button size="sm" variant="destructive" className="gap-1.5" disabled={cancelando || !cpfEnviadoValido} onClick={handleCancelarSaida}>
                            {cancelando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Confirmar cancelamento
                          </Button>
                          <Button size="sm" variant="ghost" disabled={cancelando} onClick={() => setMostrarCancelar(false)}>Voltar</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 mt-3">
                      <ul className="space-y-1.5">
                        <Requisito ok={entrouEstoque}>Entrada no RENAVE feita no Pós-Compra</Requisito>
                        <Requisito ok={nfCompraVinculada}>NF-e de compra vinculada à entrada</Requisito>
                        <Requisito ok={assinaturaEntradaEnviada}>ATPV da entrada assinado e enviado</Requisito>
                        <li className={cn('flex items-center gap-2 text-xs', estadoConfirmado ? 'text-foreground' : 'text-muted-foreground')}>
                          {estadoConfirmado
                            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            : <Circle className="h-3.5 w-3.5 shrink-0" />}
                          <span>Estoque CONFIRMADO pelo Detran{!estadoConfirmado && entrouEstoque ? ` (atual: ${avaliacao?.renave_estado || 'SOLICITADO'})` : ''}</span>
                          {!estadoConfirmado && entrouEstoque && (
                            <button
                              type="button"
                              onClick={handleAtualizarEstado}
                              disabled={atualizandoEstado}
                              title="Consultar estado atual no RENAVE"
                              className="text-muted-foreground hover:text-primary disabled:opacity-50 shrink-0"
                            >
                              <RefreshCw className={cn('h-3.5 w-3.5', atualizandoEstado && 'animate-spin')} />
                            </button>
                          )}
                        </li>
                        <Requisito ok={nfVendaAutorizada}>
                          NF-e de venda autorizada em produção
                          {nfVenda?.numero ? ` (Nº ${nfVenda.numero} / Série ${nfVenda.serie || '—'})` : ''}
                        </Requisito>
                      </ul>
                      <div className="max-w-[200px]">
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
                      <Button
                        className="w-full gap-2"
                        disabled={saindo || funcionarioLoading || !cpfEnviadoValido || !podeSair}
                        onClick={confirmarSaida}
                      >
                        {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
                        Confirmar Saída
                      </Button>
                    </div>
                  )}
                </StepRow>

                <StepRow numero={2} titulo="Vinculação com NF-e de venda" feito={nfVendaVinculada}>
                  {!saiuEstoque ? null : nfVendaVinculada ? (
                    <span className="text-xs text-muted-foreground">Automático, feito junto com o passo 1.</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Vínculo automático falhou
                      </span>
                      <Button
                        size="sm" variant="outline" className="gap-1.5" disabled={!!executando}
                        onClick={() => executar('saida-usado-nf', 'NF-e de venda vinculada', 'Falha ao vincular a NF-e de venda')}
                      >
                        {executando === 'saida-usado-nf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </StepRow>

                <StepRow numero={3} titulo="Download do ATPV-e da venda" feito={!!avaliacao?.renave_saida_atpv_url}>
                  {/* ATPV-e gerado pelo RENAVE ("Documento gerado pelo RENAVE") —
                      dispensa assinaturas do vendedor e do comprador. */}
                  {!saiuEstoque ? null : avaliacao?.renave_saida_atpv_url ? (
                    <div className="flex items-center gap-2">
                      <Button size="sm" className={botaoVerde} onClick={() => abrir(avaliacao.renave_saida_atpv_url)}>
                        <ExternalLink className="h-3.5 w-3.5" /> ATPV-e
                      </Button>
                      {avaliacao?.renave_saida_atpv_numero && (
                        <span className="text-xs text-muted-foreground">Nº {avaliacao.renave_saida_atpv_numero}</span>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm" variant="outline" className="gap-1.5 w-24 justify-center" disabled={!!executando}
                      onClick={() => executar('saida-usado-atpv', 'ATPV-e baixado', 'Falha ao baixar o ATPV-e')}
                    >
                      {executando === 'saida-usado-atpv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      ATPV-e
                    </Button>
                  )}
                </StepRow>

                <StepRow numero={4} titulo="Baixar termo de saída" feito={!!avaliacao?.renave_termo_saida_url}>
                  {!saiuEstoque ? null : avaliacao?.renave_termo_saida_url ? (
                    <Button size="sm" className={botaoVerde} onClick={() => abrir(avaliacao.renave_termo_saida_url)}>
                      <ExternalLink className="h-3.5 w-3.5" /> Termo
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="outline" className="gap-1.5 w-24 justify-center" disabled={!!executando}
                      onClick={() => executar('saida-usado-termo', 'Termo de saída baixado', 'Falha ao baixar o termo de saída')}
                    >
                      {executando === 'saida-usado-termo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Termo
                    </Button>
                  )}
                </StepRow>
              </div>
            </CardContent>
          </Card>

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
      )}
    </div>
  );
};

export default RenaveSaidaUsadoDialog;
