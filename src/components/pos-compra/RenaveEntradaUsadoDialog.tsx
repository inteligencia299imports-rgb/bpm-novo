import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Bike, Loader2, AlertTriangle, History, PackagePlus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn, firstLastName } from '@/lib/utils';
import { extrairErroFuncao } from '@/lib/edgeFunctionError';
import { useAuth } from '@/contexts/AuthContext';
import { validarCpf } from '@/lib/cpf';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';

/**
 * Entrada de moto SEMINOVA (veículo próprio) em estoque no RENAVE — etapa
 * "ENTRADA RENAVE" do Pós-Compra. Contraparte do AtpvDialog (pós-venda), mas
 * só a metade de entrada — a saída/ATPV-e de seminova é fluxo de venda, fora
 * de escopo aqui.
 *
 * Página aberta a partir do PosCompraProcessoDialog (etapa ENTRADA RENAVE) —
 * mesmo padrão do AtpvDialog: substitui o conteúdo do modal em vez de abrir
 * um pop-up por cima (sem <Dialog> próprio).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  onDone?: () => void;
}

const formatCpf = (v: string) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
    <span className="text-sm font-semibold">{value || '—'}</span>
  </div>
);

const ENDPOINT_LABEL: Record<string, string> = {
  '/api/solicitacoes-entrada-estoque-veiculo-proprio': 'Entrada em estoque',
  '/api/notas-fiscais': 'Vínculo de nota fiscal',
};

const RenaveEntradaUsadoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, onDone }) => {
  const { user } = useAuth();
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [cpfOperador, setCpfOperador] = useState('');
  const [funcionarioCpf, setFuncionarioCpf] = useState<string | null>(null);
  const [funcionarioLoading, setFuncionarioLoading] = useState(true);
  // Código de segurança/tipo do CRV NÃO têm cópia local editável aqui de
  // propósito — vêm sempre da avaliação (fonte única), lidos do CRLV.
  // Quilometragem já tem cópia editável (abaixo) — é lida do hodômetro de
  // verdade na hora da entrada, e a confirmação grava de volta em
  // avaliacoes.km (continua uma fonte só, só que atualizável aqui).
  const [extraindoCrlv, setExtraindoCrlv] = useState(false);
  const [quilometragem, setQuilometragem] = useState('');

  const carregarAvaliacao = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('avaliacoes')
      .select(`id, chassi, placa, renavam, numero_crv, codigo_seguranca_crv, tipo_crv, km, crlv_url, renave_id_estoque, renave_estado, renave_num_termo_entrada, renave_ultimo_erro, ${MARCA_MODELO_SELECT}`)
      .eq('id', avaliacaoId)
      .maybeSingle();
    const flat = flattenMarcaModelo(data);
    setAvaliacao(flat || null);
    setQuilometragem(flat?.km ? String(flat.km).replace(/\D/g, '') : '');
    setLoading(false);
    return flat;
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const data = await carregarAvaliacao();
      // Código de segurança/tipo do CRV podem não ter sido extraídos ainda
      // (avaliação antiga, ou CRLV ilegível na 1ª tentativa) — tenta ler o
      // CRLV já anexado de novo automaticamente ao abrir a Entrada, sem
      // precisar reanexar o documento.
      if (data && !data.renave_id_estoque && data.crlv_url && (!data.codigo_seguranca_crv || !data.tipo_crv)) {
        setExtraindoCrlv(true);
        try {
          await supabase.functions.invoke('extrair-dados-crlv', {
            body: { avaliacao_id: avaliacaoId, url: data.crlv_url },
          });
        } catch {
          // best-effort -- se falhar, o card avisa que continua faltando
        }
        setExtraindoCrlv(false);
        await carregarAvaliacao();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacaoId]);

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

  const carregarHistorico = async () => {
    setHistoricoLoading(true);
    const { data } = await (supabase as any)
      .from('renave_chamadas')
      .select('*')
      .eq('avaliacao_id', avaliacaoId)
      .eq('sucesso', true)
      .neq('endpoint', '/api/notas-fiscais')
      .order('created_at', { ascending: false })
      .limit(50);
    const rows: any[] = data || [];
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
    if (!open) return;
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, avaliacaoId]);

  const cpfEnviado = funcionarioCpf || cpfOperador;
  const cpfOperadorValido = validarCpf(cpfOperador);
  const cpfEnviadoValido = !!funcionarioCpf || cpfOperadorValido;
  const entrouEstoque = !!avaliacao?.renave_id_estoque;
  const faltaDadosCrv = !avaliacao?.codigo_seguranca_crv
    || String(avaliacao.codigo_seguranca_crv).replace(/\D/g, '').length !== 11
    || !avaliacao?.tipo_crv;

  const kmInformado = quilometragem ? Number(quilometragem) : null;

  const confirmarEntrada = async () => {
    if (faltaDadosCrv || !cpfEnviadoValido) return;
    setEntrando(true);
    try {
      // Quilometragem pode ser corrigida na hora (quem confirma está vendo o
      // hodômetro de verdade) — grava direto em avaliacoes.km antes de
      // chamar o RENAVE, continua sendo a fonte única (só que atualizável
      // aqui, não uma cópia divergente). Código de segurança/tipo do CRV
      // continuam só leitura, vêm do CRLV.
      if (kmInformado != null && kmInformado !== Number(avaliacao?.km || 0)) {
        await (supabase as any).from('avaliacoes').update({ km: kmInformado }).eq('id', avaliacaoId);
      }
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: {
          acao: 'entrada-usado',
          avaliacao_id: avaliacaoId,
          cpf_operador: cpfEnviado,
          quilometragem_hodometro: kmInformado ?? undefined,
        },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha na entrada RENAVE'));
        await Promise.all([carregarAvaliacao(), carregarHistorico()]);
        return;
      }
      toast.success('Entrada RENAVE confirmada');
      await Promise.all([carregarAvaliacao(), carregarHistorico()]);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      setEntrando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" /> Entrada RENAVE
            {entrouEstoque && (
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Bike className="h-4 w-4 text-primary" /> Dados da Moto</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Info label="Marca" value={avaliacao?.marca} />
                <Info label="Modelo" value={avaliacao?.modelo} />
                <Info label="Chassi" value={avaliacao?.chassi} />
                <Info label="Placa" value={avaliacao?.placa} />
                <Info label="RENAVAM" value={avaliacao?.renavam} />
                <Info label="Nº do CRV" value={avaliacao?.numero_crv} />
                <Info label="ID Estoque RENAVE" value={avaliacao?.renave_id_estoque} />
                <Info label="Estado RENAVE" value={avaliacao?.renave_estado ? <span className="text-primary">{avaliacao.renave_estado}</span> : undefined} />
              </CardContent>
            </Card>

            {entrouEstoque ? null : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Confirmar Entrada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {avaliacao?.renave_ultimo_erro && (
                    <span className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {avaliacao.renave_ultimo_erro}
                    </span>
                  )}
                  {extraindoCrlv && (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Lendo dados do CRLV anexado…
                    </span>
                  )}
                  {!extraindoCrlv && faltaDadosCrv && (
                    <span className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      {avaliacao?.crlv_url
                        ? 'Código de segurança e/ou tipo do CRV não identificados no CRLV anexado — reanexe um documento mais legível na avaliação.'
                        : 'Nenhum CRLV anexado nesta avaliação — anexe o CRLV pra extrair o código de segurança e o tipo.'}
                    </span>
                  )}
                  {/* Código de segurança e tipo do CRV são só leitura aqui — vêm do
                      CRLV/avaliação. Quilometragem é editável (hodômetro de verdade
                      na hora da entrada) e grava de volta em avaliacoes.km ao confirmar. */}
                  <div className="grid grid-cols-2 gap-3">
                    <Info label="Código de Segurança do CRV" value={avaliacao?.codigo_seguranca_crv} />
                    <Info label="Tipo do CRV" value={avaliacao?.tipo_crv} />
                    <div>
                      <Label className="text-xs text-muted-foreground">Quilometragem do Hodômetro</Label>
                      <Input
                        className="mt-1"
                        inputMode="numeric"
                        value={quilometragem ? Number(quilometragem).toLocaleString('pt-BR') : ''}
                        onChange={(e) => setQuilometragem(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">CPF do Operador</Label>
                      {funcionarioLoading ? (
                        <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</p>
                      ) : funcionarioCpf ? (
                        <p className="mt-1 text-sm font-semibold">{formatCpf(funcionarioCpf)}</p>
                      ) : (
                        <Input
                          className={cn('mt-1', cpfOperador.length === 11 && !cpfOperadorValido && 'border-destructive text-destructive focus-visible:ring-destructive')}
                          inputMode="numeric"
                          value={formatCpf(cpfOperador)}
                          onChange={(e) => setCpfOperador(e.target.value.replace(/\D/g, '').slice(0, 11))}
                          placeholder="000.000.000-00"
                        />
                      )}
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2"
                    disabled={entrando || funcionarioLoading || !cpfEnviadoValido || faltaDadosCrv}
                    onClick={confirmarEntrada}
                  >
                    {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                    Confirmar Entrada
                  </Button>
                </CardContent>
              </Card>
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
        )}
    </div>
  );
};

export default RenaveEntradaUsadoDialog;
