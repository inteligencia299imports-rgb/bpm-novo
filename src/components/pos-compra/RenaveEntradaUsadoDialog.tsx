import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bike, Loader2, AlertTriangle, History, PackagePlus, CheckCircle2, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn, firstLastName } from '@/lib/utils';
import { extrairErroFuncao } from '@/lib/edgeFunctionError';
import { useAuth } from '@/contexts/AuthContext';
import { validarCpf } from '@/lib/cpf';
import StatusTimeline from '@/components/shared/StatusTimeline';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import DocumentUpload from '@/components/showroom/DocumentUpload';

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
  '/api/solicitacoes-entrada-estoque': 'Entrada em estoque',
  '/api/notas-fiscais': 'Vínculo de nota fiscal',
  '/api/pdf-atpv': 'Download ATPV-e',
  '/api/atpv-assinatura-vendedor': 'Envio de assinatura do ATPV-e',
  '/api/crlve/{placaVeiculo}/{renavamVeiculo}': 'Download CRLV-e',
  '/api/estoques/{id}': 'Consulta de estado do estoque',
};

// Sequência real da SERPRO pra entrada de seminova comprada de particular
// (confirmada no manual oficial + diagramas de fluxo + achados reais
// 2026-09-22, chassis 95VHA00AAHM000135/95V1X00AARM000160):
// 1 confirmar entrada (usa o CPF do vendedor, gera o idEstoque, estado
//   inicial "Solicitado" -- é essa chamada que cria a "intenção de venda" do
//   lado da SERPRO) ->
// 2 download do ATPV-e (só funciona DEPOIS do passo 1 -- sem a intenção de
//   venda criada, a SERPRO rejeita com "Não existe intenção de venda
//   disponível...") ->
// 3 assinatura do vendedor (só funciona depois do idEstoque existir; é o que
//   dispara a transferência de propriedade no Detran) ->
// 4 baixar termo de entrada (documento separado do número de protocolo que já
//   vem no passo 1 -- só libera DEPOIS da assinatura, não logo após a
//   entrada; achado real) ->
// 5 chave NF-e (automático dentro do passo 1) ->
// 6 download do CRLV-e já com a empresa como dona.
// Depois da assinatura (3), o Detran processa a transferência de forma
// ASSÍNCRONA (Solicitado -> Transferido -> Confirmado, transações 203/204 e
// 227 do lado da SERPRO) -- não é instantâneo, por isso existe o botão de
// atualizar o "Estado RENAVE" (handleAtualizarEstado).
// Layout igual ao StatusTimeline (Histórico) -- gutter fixo com o indicador
// centrado sobre a linha vertical contínua (desenhada pelo pai), mesmo
// espaçamento pb-10 last:pb-0 entre etapas (space-y-1 título->conteúdo dentro
// de cada uma). Mantém o número dentro do círculo (em vez da
// bolinha do histórico) a pedido explícito -- aqui os passos são sequenciais
// e o número ajuda a situar a ordem.
const StepRow = ({ numero, titulo, feito, children }: { numero: number; titulo: string; feito: boolean; ultimo?: boolean; children: React.ReactNode }) => (
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

// "Foto - ATPV-e assinado à mão" fica em 1º e é o default -- é o formato
// usado na prática (impresso, assinado à mão, fotografado).
const TIPOS_ASSINATURA = [
  { value: 'proprio_punho_atpve', label: 'Foto - ATPV-e assinado à mão' },
  { value: 'proprio_punho_papel_moeda', label: 'Foto - ATPV papel-moeda assinado à mão' },
  { value: 'qualificada_xml_atpve', label: 'Assinatura digital qualificada (P7S) - XML do ATPV-e' },
  { value: 'qualificada_foto_papel_moeda', label: 'Assinatura digital qualificada (P7S) - foto do ATPV papel-moeda' },
] as const;

const blobParaBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

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
      .select(`id, chassi, placa, renavam, numero_crv, codigo_seguranca_crv, tipo_crv, km, crlv_url, renave_id_estoque, renave_estado, renave_num_termo_entrada, renave_termo_entrada_url, renave_ultimo_erro, renave_atpv_numero, renave_atpv_url, renave_atpv_assinatura_url, renave_atpv_assinatura_enviada_em, renave_nf_vinculada_em, renave_crlve_url, ${MARCA_MODELO_SELECT}`)
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
      // Saída (Pós-Venda) grava na mesma avaliação — tem histórico próprio lá.
      .not('operacao', 'like', 'saida-usado%')
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
  const assinaturaEnviada = !!avaliacao?.renave_atpv_assinatura_enviada_em;
  const nfVinculada = !!avaliacao?.renave_nf_vinculada_em;
  // O CRLV-e só libera quando o estabelecimento já consta como proprietário
  // no RENAVAM -- confirmado no manual oficial ("O estabelecimento somente
  // pode visualizar CRLV eletrônico que conste o estabelecimento como
  // proprietário"), o que só acontece no estado CONFIRMADO (pós transação
  // 227), não em TRANSFERIDO (só mudou o dono, CRV ainda não reemitido).
  const estadoConfirmado = String(avaliacao?.renave_estado ?? '').toUpperCase() === 'CONFIRMADO';

  // ---- Passo 1: download do ATPV-e ----
  const [baixandoAtpv, setBaixandoAtpv] = useState(false);
  const handleBaixarAtpv = async () => {
    setBaixandoAtpv(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'atpv-pdf-usado', avaliacao_id: avaliacaoId },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao baixar o ATPV-e'));
        return;
      }
      toast.success('ATPV-e baixado');
      await carregarAvaliacao();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao baixar o ATPV-e');
    } finally {
      setBaixandoAtpv(false);
    }
  };

  // ---- Passo 2: enviar ATPV-e assinado pelo vendedor ----
  // DocumentUpload já cuida do botão "Anexar" + storage + popup de
  // visualizar/baixar/remover (mesmo padrão da CNH). `deferPreview` mantém o
  // botão em estado de carregando até a SERPRO confirmar o envio.
  const [tipoAssinatura, setTipoAssinatura] = useState<string>(TIPOS_ASSINATURA[0].value);
  const handleAssinaturaAnexada = async (url: string) => {
    // Grava a URL já aqui -- assim o popup de visualizar/baixar funciona
    // mesmo se o envio à SERPRO falhar (dá pra conferir o arquivo sem
    // reanexar). Só renave_atpv_assinatura_enviada_em (gravado pelo
    // backend) marca que a SERPRO de fato aceitou.
    await (supabase as any).from('avaliacoes').update({ renave_atpv_assinatura_url: url }).eq('id', avaliacaoId);
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const arquivo_base64 = await blobParaBase64(blob);
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'atpv-assinatura', avaliacao_id: avaliacaoId, tipo: tipoAssinatura, arquivo_base64 },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao enviar a assinatura'));
        return;
      }
      toast.success('Assinatura enviada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar a assinatura');
    } finally {
      await carregarAvaliacao();
    }
  };
  const handleAssinaturaRemovida = async () => {
    await (supabase as any).from('avaliacoes').update({ renave_atpv_assinatura_url: null }).eq('id', avaliacaoId);
    await carregarAvaliacao();
  };

  // Depois da assinatura enviada, o Detran processa a transferência de forma
  // assíncrona do lado da SERPRO (Solicitado -> Transferido -> Confirmado) --
  // não há webhook, então a tela precisa reconsultar sob demanda.
  const [atualizandoEstado, setAtualizandoEstado] = useState(false);
  const handleAtualizarEstado = async () => {
    setAtualizandoEstado(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'estoque-status', avaliacao_id: avaliacaoId },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao consultar o estado no RENAVE'));
        return;
      }
      await carregarAvaliacao();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao consultar o estado no RENAVE');
    } finally {
      setAtualizandoEstado(false);
    }
  };

  // ---- Passo 4: retry do vínculo da NF-e (quando o automático do passo 2 falha) ----
  const [vinculandoNf, setVinculandoNf] = useState(false);
  const handleVincularNf = async () => {
    setVinculandoNf(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'vincular-nf', avaliacao_id: avaliacaoId },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao vincular a NF-e'));
        return;
      }
      toast.success('NF-e vinculada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao vincular a NF-e');
    } finally {
      await carregarAvaliacao();
      setVinculandoNf(false);
    }
  };

  // ---- Recuperação: cancela um estoque travado (entrada órfã, sem intenção
  // de venda válida -- ver achado 2026-09-22 no comentário do topo) pra
  // permitir refazer a entrada do zero. ----
  const [cancelandoEstoque, setCancelandoEstoque] = useState(false);
  const [mostrarCancelarEstoque, setMostrarCancelarEstoque] = useState(false);
  const handleCancelarEstoque = async () => {
    // Achado real 2026-09-22: mesmo o schema do OpenAPI marcando
    // cpfOperadorResponsavel como opcional, a SERPRO exige em produção.
    if (!cpfEnviadoValido) { toast.error('Informe um CPF de operador válido antes de cancelar.'); return; }
    setCancelandoEstoque(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'cancelar-estoque', avaliacao_id: avaliacaoId, cpf_operador: cpfEnviado },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao cancelar o estoque'));
        return;
      }
      toast.success('Estoque cancelado — pode refazer a entrada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao cancelar o estoque');
    } finally {
      await carregarAvaliacao();
      setCancelandoEstoque(false);
    }
  };

  // ---- Documento do termo de entrada (o número já vem na entrada, o PDF é
  // uma consulta separada -- ver termoEntradaEstoque em renave.ts) ----
  const [baixandoTermo, setBaixandoTermo] = useState(false);
  const handleBaixarTermoEntrada = async () => {
    setBaixandoTermo(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'termo-entrada-pdf', avaliacao_id: avaliacaoId },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao baixar o termo de entrada'));
        return;
      }
      toast.success('Termo de entrada baixado');
      await carregarAvaliacao();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao baixar o termo de entrada');
    } finally {
      setBaixandoTermo(false);
    }
  };

  // ---- Passo 5: download do CRLV-e ----
  const [baixandoCrlve, setBaixandoCrlve] = useState(false);
  const handleBaixarCrlve = async () => {
    setBaixandoCrlve(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'crlve', avaliacao_id: avaliacaoId },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao baixar o CRLV-e'));
        return;
      }
      toast.success('CRLV-e baixado');
      await carregarAvaliacao();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao baixar o CRLV-e');
    } finally {
      setBaixandoCrlve(false);
    }
  };

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

            <Card>
              <CardHeader className="pb-6">
                <CardTitle className="text-sm flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Entrada no RENAVE (SERPRO)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      ? 'Código de segurança e/ou tipo do CRV não identificados no CRLV anexado - reanexe um documento mais legível na avaliação.'
                      : 'Nenhum CRLV anexado nesta avaliação - anexe o CRLV pra extrair o código de segurança e o tipo.'}
                  </span>
                )}

                <div className="relative">
                {/* Linha vertical contínua, mesmo padrão do StatusTimeline (Histórico
                    abaixo) -- centrada no gutter de 24px onde ficam os números. */}
                <div className="absolute left-[11.5px] top-2 bottom-2 w-px bg-primary/40" />

                <StepRow numero={1} titulo="Gerar termo de entrada" feito={entrouEstoque}>
                  {entrouEstoque ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Entrada confirmada.</span>
                        {/* Recuperação: entrada pode ficar órfã (intenção de venda
                            cancelada do lado da SERPRO) -- ver achado 2026-09-22. */}
                        {!mostrarCancelarEstoque && (
                          <button
                            type="button"
                            onClick={() => setMostrarCancelarEstoque(true)}
                            className="text-xs text-muted-foreground underline decoration-dotted hover:text-destructive"
                          >
                            Cancelar e refazer entrada
                          </button>
                        )}
                      </div>
                      {mostrarCancelarEstoque && (
                        <div className="flex items-center gap-2">
                          {/* A SERPRO exige CPF do operador pra cancelar; se não tiver
                              um funcionário com CPF cadastrado, pede pra digitar aqui. */}
                          {!funcionarioCpf && (
                            <Input
                              className={cn('h-8 w-36 text-sm', cpfOperador.length === 11 && !cpfOperadorValido && 'border-destructive text-destructive')}
                              inputMode="numeric"
                              value={formatCpf(cpfOperador)}
                              onChange={(e) => setCpfOperador(e.target.value.replace(/\D/g, '').slice(0, 11))}
                              placeholder="CPF do operador"
                            />
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5"
                            disabled={cancelandoEstoque || !cpfEnviadoValido}
                            onClick={handleCancelarEstoque}
                          >
                            {cancelandoEstoque ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Código de segurança e tipo do CRV são só leitura aqui — vêm do
                          CRLV/avaliação. Quilometragem é editável (hodômetro de verdade
                          na hora da entrada) e grava de volta em avaliacoes.km ao confirmar. */}
                      <div className="grid grid-cols-2 gap-3 mt-4">
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
                    </div>
                  )}
                </StepRow>

                <StepRow numero={2} titulo="Download do ATPV-e" feito={!!avaliacao?.renave_atpv_url}>
                  {/* Achado real 2026-09-22 (chassi 95VHA00AAHM000135): a SERPRO rejeita
                      o download do ATPV-e ("Não existe intenção de venda disponível...")
                      quando pedido antes da entrada -- a "intenção de venda" só existe
                      depois que a entrada (passo 1) cria ela como efeito colateral. Por
                      isso esse passo fica escondido até entrouEstoque. */}
                  {!entrouEstoque ? null : avaliacao?.renave_atpv_url ? (
                    <Button
                      size="sm"
                      className="gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      onClick={() => window.open(avaliacao.renave_atpv_url, '_blank', 'noopener')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> ATPV-e
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={baixandoAtpv} onClick={handleBaixarAtpv}>
                      {baixandoAtpv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      ATPV-e
                    </Button>
                  )}
                </StepRow>

                <StepRow numero={3} titulo="Enviar ATPV assinado" feito={assinaturaEnviada}>
                  {!entrouEstoque ? null : assinaturaEnviada ? (
                    // Já enviada à SERPRO — sem Select (nada mais pra escolher) e sem
                    // opção de remover (documento já processado do lado oficial).
                    // Só o botão verde, que abre o pop-up de visualizar/baixar.
                    <DocumentUpload
                      label="ATPV"
                      className="w-24 justify-center shrink-0 text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-600 hover:border-emerald-700"
                      currentUrl={avaliacao?.renave_atpv_assinatura_url ?? null}
                      bucketPath={`docs/${avaliacaoId}/atpv-assinatura`}
                      onUploaded={handleAssinaturaAnexada}
                      bloquearRemocao
                      deferPreview
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select value={tipoAssinatura} onValueChange={setTipoAssinatura}>
                        <SelectTrigger className="h-9 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_ASSINATURA.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <DocumentUpload
                        label="ATPV"
                        className={cn('w-24 justify-center shrink-0', avaliacao?.renave_atpv_assinatura_url && 'text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-600 hover:border-emerald-700')}
                        currentUrl={avaliacao?.renave_atpv_assinatura_url ?? null}
                        bucketPath={`docs/${avaliacaoId}/atpv-assinatura`}
                        onUploaded={handleAssinaturaAnexada}
                        onRemoved={handleAssinaturaRemovida}
                        deferPreview
                      />
                    </div>
                  )}
                </StepRow>

                <StepRow numero={4} titulo="Baixar termo de entrada" feito={!!avaliacao?.renave_termo_entrada_url}>
                  {/* Achado real 2026-09-22 (chassi 95VHA00AAHM000135): a SERPRO só
                      libera o termo de entrada depois da assinatura do ATPV (passo 3)
                      enviada -- não logo após a entrada (passo 1). */}
                  {!entrouEstoque ? null : avaliacao?.renave_termo_entrada_url ? (
                    <Button
                      size="sm"
                      className="gap-1.5 w-24 justify-center text-white bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      onClick={() => window.open(avaliacao.renave_termo_entrada_url, '_blank', 'noopener')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Termo
                    </Button>
                  ) : assinaturaEnviada ? (
                    <Button size="sm" variant="outline" className="gap-1.5 w-24 justify-center" disabled={baixandoTermo} onClick={handleBaixarTermoEntrada}>
                      {baixandoTermo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Termo
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground text-right">
                      Disponível após enviar a assinatura do ATPV (passo 3)
                    </span>
                  )}
                </StepRow>

                <StepRow numero={5} titulo="Vinculação com NF-e" feito={nfVinculada}>
                  {!entrouEstoque ? null : nfVinculada ? (
                    <span className="text-xs text-muted-foreground">Automático, feito junto com o passo 1.</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Vínculo automático falhou
                      </span>
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={vinculandoNf} onClick={handleVincularNf}>
                        {vinculandoNf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </StepRow>

                <StepRow numero={6} titulo="Download do CRLV-e" feito={!!avaliacao?.renave_crlve_url} ultimo>
                  {!assinaturaEnviada ? null : avaliacao?.renave_crlve_url ? (
                    <Button
                      size="sm"
                      className="gap-1.5 w-24 justify-center text-white bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      onClick={() => window.open(avaliacao.renave_crlve_url, '_blank', 'noopener')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> CRLV-e
                    </Button>
                  ) : !estadoConfirmado ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground text-right">
                        Aguardando confirmação do Detran (estado atual: {avaliacao?.renave_estado || 'SOLICITADO'})
                      </span>
                      <button
                        type="button"
                        onClick={handleAtualizarEstado}
                        disabled={atualizandoEstado}
                        title="Consultar estado atual no RENAVE"
                        className="text-muted-foreground hover:text-primary disabled:opacity-50 shrink-0"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', atualizandoEstado && 'animate-spin')} />
                      </button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5 w-24 justify-center" disabled={baixandoCrlve} onClick={handleBaixarCrlve}>
                      {baixandoCrlve ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      CRLV-e
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

export default RenaveEntradaUsadoDialog;
