import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRightLeft, FileText, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, Radio, Link2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { extrairErroFuncao } from '@/lib/edgeFunctionError';
import { useAuth } from '@/contexts/AuthContext';
import { validarCpf } from '@/lib/cpf';
import { cn } from '@/lib/utils';
import { useNfeCompra } from '@/hooks/useNfeCompra';
import CancelarNfeDialog from '@/components/shared/CancelarNfeDialog';
import { NfeDanfeButton } from '@/components/shared/NfeCabecalhoAcoes';

const formatCpf = (v: string) => v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

interface EstoqueItemBasico {
  id: string;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  chassi?: string | null;
  avaliacao_id?: string | null;
  loja_id?: string | null;
  empresa?: string | null;
  atendimento_venda_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estoqueItem: EstoqueItemBasico | null;
  onSuccess: () => void;
}

interface LojaOpcao {
  id: string;
  loja: string;
  empresa_id: string;
  empresa_nome: string;
}

/**
 * Transferência de estoque (seminova ou 0km) entre empresas do grupo, aberta
 * a partir do menu "Acessar" do Estoque. Duas NF-e's espelhadas: a origem
 * emite a SAÍDA (CFOP 5152/6152) e, só depois dela autorizar em produção, o
 * destino emite a ENTRADA (CFOP 1152/2152) — cada uma com seu próprio ciclo
 * homologação → produção, mesmo padrão do TransferenciaFagMmatosDialog (que é
 * a mesma ideia, só que com destino fixo/natureza dedicada em vez do CFOP
 * comum de transferência). Seminova chaveia por avaliacao_id; 0km chaveia
 * pelo próprio id de estoque_motos_novas (não tem avaliação).
 *
 * Seminova só POA↔FLN por ora ("299f"/"299p"). 0km também inclui a FAG
 * ("Ducati BSB"), além de "Ducati FLN"/"Ducati POA" — o backend decide
 * sozinho a família de CFOP certa (152 = mesma raiz de CNPJ/filial;
 * 949 = raiz de CNPJ diferente) comparando o CNPJ real das duas empresas,
 * nunca por nome fixo.
 */
const TransferenciaEstoqueDialog: React.FC<Props> = ({ open, onOpenChange, estoqueItem, onSuccess }) => {
  const eh0km = !!estoqueItem && !estoqueItem.avaliacao_id;
  const entityId = eh0km ? (estoqueItem?.id || '') : (estoqueItem?.avaliacao_id || '');
  const [lojas, setLojas] = useState<LojaOpcao[]>([]);
  const [lojasLoading, setLojasLoading] = useState(true);
  const [destinoLojaId, setDestinoLojaId] = useState('');
  const [renaveInfo, setRenaveInfo] = useState<{ id_estoque: string | null; estado: string | null; ultimo_erro: string | null } | null>(null);
  const [renaveLoading, setRenaveLoading] = useState(false);
  const { user } = useAuth();
  const [funcionarioCpf, setFuncionarioCpf] = useState<string | null>(null);
  const [funcionarioCpfLoading, setFuncionarioCpfLoading] = useState(true);
  const [cpfOperador, setCpfOperador] = useState('');

  const saida = useNfeCompra(entityId, open, eh0km ? 'transferencia_saida_0km' : 'transferencia_saida', eh0km ? 'estoque_moto_nova' : 'avaliacao');
  const entrada = useNfeCompra(entityId, open, eh0km ? 'transferencia_entrada_0km' : 'transferencia_entrada', eh0km ? 'estoque_moto_nova' : 'avaliacao', onSuccess);

  // useNfeCompra não carrega sozinho ao montar (mesmo achado do
  // TransferenciaFagMmatosDialog) — sem isso o diálogo sempre parte de "nada
  // emitido ainda", mesmo reabrindo sobre uma transferência já em andamento.
  useEffect(() => {
    if (open && entityId) { saida.carregar(); entrada.carregar(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId]);

  // Restaura a loja de destino ao reabrir sobre uma transferência já em
  // andamento — sem isso, o Select (já travado depois da saída emitida)
  // ficava vazio pra sempre e o botão de reemitir/produção falhava com
  // "destino_loja_id é obrigatório".
  useEffect(() => {
    const destinoSalvo = saida.nfe?.transferencia_destino_loja_id || entrada.nfe?.transferencia_destino_loja_id;
    if (destinoSalvo && !destinoLojaId) setDestinoLojaId(destinoSalvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saida.nfe, entrada.nfe]);

  // Seminova: POA/FLN (Ducati) + MMATOS/FAG (raiz de CNPJ diferente — CFOP
  // 5949/1949 mesmo estado ou 6912/2912 interestadual, resolvido
  // automaticamente no backend; cadastro fiscal da MMATOS 1949 feito em
  // 2026-09-30). 0km já incluía a FAG (Ducati BSB) antes.
  const lojasPermitidas = eh0km
    ? ['Ducati FLN', 'Ducati POA', 'Ducati BSB']
    : ['299f', '299p', '299i', '299s', 'Ducati BSB'];

  const carregarRenaveInfo = React.useCallback(() => {
    if (!eh0km || !entityId) return;
    (supabase as any)
      .from('estoque_motos_novas')
      .select('renave_id_estoque, renave_estado, renave_ultimo_erro')
      .eq('id', entityId)
      .maybeSingle()
      .then(({ data }: any) => {
        setRenaveInfo(data ? { id_estoque: data.renave_id_estoque, estado: data.renave_estado, ultimo_erro: data.renave_ultimo_erro } : null);
      });
  }, [eh0km, entityId]);

  useEffect(() => { if (open) carregarRenaveInfo(); }, [open, carregarRenaveInfo]);

  // Pedido do usuário, 2026-09-30: o diálogo continua acessível depois da
  // venda (pra ver/baixar as DANFE's de uma transferência anterior). O
  // Cancelar da ENTRADA só fica disponível se a venda dessa moto NÃO
  // estiver fiscalmente fechada (bloqueia se a NF de venda estiver
  // autorizada em produção e ainda não devolvida) — a entrada reatribui
  // loja/empresa, então desfazer isso com uma venda fechada em outro lugar
  // seria inconsistente. Reforço do usuário, mesmo dia: o Cancelar da SAÍDA
  // NÃO tem essa trava — fica sempre liberado (a saída sozinha não move a
  // moto nem depende da venda; só a entrada em produção bloqueia, e isso já
  // é travado no próprio backend).
  const [vendaFechada, setVendaFechada] = useState(false);
  useEffect(() => {
    if (!open || !estoqueItem?.atendimento_venda_id) { setVendaFechada(false); return; }
    let cancel = false;
    const opVenda = eh0km ? 'venda_0km' : 'venda_seminova';
    const opDevolucao = eh0km ? 'devolucao_venda_0km' : 'devolucao_venda_seminova';
    Promise.all([
      (supabase as any).from('nfe_entradas').select('id').eq('atendimento_id', estoqueItem.atendimento_venda_id)
        .eq('operacao', opVenda).eq('status', 'processada').eq('ambiente', 'producao').limit(1).maybeSingle(),
      (supabase as any).from('nfe_entradas').select('id').eq('atendimento_id', estoqueItem.atendimento_venda_id)
        .eq('operacao', opDevolucao).eq('status', 'processada').eq('ambiente', 'producao').limit(1).maybeSingle(),
    ]).then(([{ data: venda }, { data: devolucao }]) => {
      if (cancel) return;
      setVendaFechada(!!venda && !devolucao);
    });
    return () => { cancel = true; };
  }, [open, estoqueItem?.atendimento_venda_id, eh0km]);

  // CPF do operador — mesmo padrão do RenaveDialog: tenta achar pelo cadastro
  // de funcionário do usuário logado, só pede na mão se não achar.
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancel = false;
    setFuncionarioCpfLoading(true);
    (supabase as any)
      .from('funcionarios_hcm')
      .select('cpf')
      .eq('usuario_id', user.id)
      .maybeSingle()
      .then(({ data: fnc }: any) => {
        if (cancel) return;
        const cpf = fnc?.cpf ? String(fnc.cpf).replace(/\D/g, '') : null;
        setFuncionarioCpf(cpf && cpf.length === 11 ? cpf : null);
        setFuncionarioCpfLoading(false);
      });
    return () => { cancel = true; };
  }, [open, user?.id]);

  const cpfOperadorEnviado = funcionarioCpf || cpfOperador;
  const cpfOperadorValido = !!funcionarioCpf || validarCpf(cpfOperador);

  const sincronizarRenave = async () => {
    setRenaveLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'transferencia-entre-estabelecimentos', estoque_moto_nova_id: entityId, cpf_operador: cpfOperadorEnviado },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || await extrairErroFuncao(error, 'Falha ao sincronizar com o RENAVE'));
        return;
      }
      toast.success('Transferência sincronizada com o RENAVE.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao chamar o RENAVE');
    } finally {
      setRenaveLoading(false);
      carregarRenaveInfo();
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLojasLoading(true);
    (supabase as any)
      .from('loja_empresas')
      .select('id, loja, empresa_id, empresas:empresa_id(nome)')
      .eq('sistema', 'motos')
      .then(({ data }: any) => {
        if (cancel) return;
        const opts = ((data as any[]) || [])
          .filter((l) => l.id !== estoqueItem?.loja_id && lojasPermitidas.includes(l.loja))
          .map((l) => ({ id: l.id, loja: l.loja, empresa_id: l.empresa_id, empresa_nome: l.empresas?.nome || '' }))
          .sort((a, b) => (a.empresa_nome + a.loja).localeCompare(b.empresa_nome + b.loja));
        setLojas(opts);
        setLojasLoading(false);
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estoqueItem?.loja_id, eh0km]);

  // Pedido do usuário, 2026-09-30: a saída também cobre a moto 0km "enviada
  // como demonstração" pra outra empresa/UF (mesma operação de estoque,
  // CFOP escolhido livremente na emissão — 949/152 de transferência de
  // propriedade ou 912 de demonstração) — sem aba/operação nova. Quando a
  // NF já foi emitida fora do bpm-novo (direto na Focus), dá pra vincular o
  // XML aqui em vez de emitir pelo botão normal.
  const [mostrarVincular, setMostrarVincular] = useState(false);
  const [vincularXml, setVincularXml] = useState('');
  const [vincularRef, setVincularRef] = useState('');
  const [vinculandoSaida, setVinculandoSaida] = useState(false);
  const handleVincularSaida = async () => {
    if (!vincularXml.trim() || !vincularRef.trim()) {
      toast.error('Cole o XML completo da NF-e e informe o ref usado na emissão pela Focus');
      return;
    }
    setVinculandoSaida(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfe-compra', {
        body: { acao: 'vincular_transferencia_saida', tipo: 'transferencia_saida_0km', estoque_moto_nova_id: entityId, xml: vincularXml.trim(), ref: vincularRef.trim() },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'Falha ao vincular');
      toast.success('NF de saída vinculada');
      setVincularXml('');
      setVincularRef('');
      setMostrarVincular(false);
      await saida.carregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao vincular a NF');
    } finally {
      setVinculandoSaida(false);
    }
  };

  const motoLabel = [estoqueItem?.marca, estoqueItem?.modelo].filter(Boolean).join(' ') || 'Moto';
  const saidaEmitida = saida.emitida;
  const saidaProducao = saidaEmitida && saida.nfe?.ambiente === 'producao';
  const podeReemitirHomologSaida = saidaEmitida && saida.nfe?.ambiente === 'homologacao';
  const entradaEmitida = entrada.emitida;
  const podeReemitirHomologEntrada = entradaEmitida && entrada.nfe?.ambiente === 'homologacao';

  if (!estoqueItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" /> Transferência de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-semibold text-foreground">{motoLabel}</p>
            <p className="text-xs text-muted-foreground">
              {estoqueItem.placa || estoqueItem.chassi || '—'} — atualmente em {estoqueItem.empresa || '—'}
            </p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Empresa/loja de destino</Label>
            <Select value={destinoLojaId} onValueChange={setDestinoLojaId} disabled={saidaEmitida || lojasLoading}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={lojasLoading ? 'Carregando…' : 'Selecione o destino'} />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.empresa_nome} — {l.loja}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Passo 1: saída (empresa de origem) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" /> 1. Saída (origem)
                {saidaProducao && (
                  <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {saidaEmitida && (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Nº NF</span>
                  <div className="flex items-center gap-3">
                    <span className={saida.nfe?.ambiente === 'producao' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-orange-600 dark:text-orange-400'}>
                      Nº {saida.nfe?.numero || '-'} • Série {saida.nfe?.serie || '-'}
                    </span>
                    <NfeDanfeButton nfe={saida} placaOuChassi={estoqueItem?.placa || estoqueItem?.chassi} />
                  </div>
                </div>
              )}
              {saida.pendente && (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                  <Button variant="ghost" size="sm" disabled={saida.loading} onClick={saida.consultar} className="gap-1.5">
                    <RefreshCw className={`h-4 w-4 ${saida.loading ? 'animate-spin' : ''}`} /> Atualizar
                  </Button>
                </div>
              )}
              {saida.erro && !saida.pendente && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {saida.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {(saida.emitida || saida.cancelada) && saida.nfe?.ambiente === 'producao' && <CancelarNfeDialog nfe={saida} />}
                {(!saidaEmitida || podeReemitirHomologSaida) && !saida.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={saida.loading || !destinoLojaId}
                    onClick={() => saida.emitir({ ambiente: 'homologacao', destino_loja_id: destinoLojaId })}
                  >
                    {saida.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : saida.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {saida.erro ? 'Tentar novamente' : 'NF-e (Homologação)'}
                  </Button>
                )}
                {podeReemitirHomologSaida && !saida.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={saida.loading || !destinoLojaId}
                    onClick={() => saida.emitir({ ambiente: 'producao', destino_loja_id: destinoLojaId })}
                  >
                    <FileText className="h-4 w-4" /> NF-e (Produção)
                  </Button>
                )}
                {eh0km && !saidaEmitida && !saida.pendente && (
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setMostrarVincular((v) => !v)}>
                    <Link2 className="h-3.5 w-3.5" /> Já tenho o XML
                  </Button>
                )}
              </div>

              {mostrarVincular && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    NF já autorizada fora do bpm-novo (ex.: demonstração, CFOP 912) — cole o XML e o <code>ref</code> usado na emissão pela Focus pra vincular aqui.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Ref da Focus</Label>
                    <Input value={vincularRef} onChange={(e) => setVincularRef(e.target.value)} placeholder="referência usada na emissão" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">XML da NF-e</Label>
                    <Textarea value={vincularXml} onChange={(e) => setVincularXml(e.target.value)} placeholder="Cole o XML completo (nfeProc)..." rows={4} className="font-mono text-xs" />
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vinculandoSaida} onClick={handleVincularSaida}>
                    {vinculandoSaida ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Vincular
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Passo 2: entrada (empresa de destino) — só depois da saída em produção */}
          <Card className={!saidaProducao ? 'opacity-50 pointer-events-none' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" /> 2. Entrada (destino)
                {entradaEmitida && entrada.nfe?.ambiente === 'producao' && (
                  <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!saidaProducao && (
                <p className="text-xs text-muted-foreground">Disponível depois da saída ser autorizada em produção.</p>
              )}
              {saidaProducao && !entradaEmitida && vendaFechada && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  Esta moto já tem NF-e de venda autorizada em produção — não é possível gerar a entrada. Cancele a saída em vez disso.
                </p>
              )}
              {entradaEmitida && (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Nº NF</span>
                  <div className="flex items-center gap-3">
                    <span className={entrada.nfe?.ambiente === 'producao' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-orange-600 dark:text-orange-400'}>
                      Nº {entrada.nfe?.numero || '-'} • Série {entrada.nfe?.serie || '-'}
                    </span>
                    <NfeDanfeButton nfe={entrada} placaOuChassi={estoqueItem?.placa || estoqueItem?.chassi} />
                  </div>
                </div>
              )}
              {entrada.pendente && (
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitindo NF-e…</Badge>
                  <Button variant="ghost" size="sm" disabled={entrada.loading} onClick={entrada.consultar} className="gap-1.5">
                    <RefreshCw className={`h-4 w-4 ${entrada.loading ? 'animate-spin' : ''}`} /> Atualizar
                  </Button>
                </div>
              )}
              {entrada.erro && !entrada.pendente && (
                <p className="text-sm text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {entrada.nfe?.erro_mensagem || 'Falha na emissão da NF-e'}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {(entrada.emitida || entrada.cancelada) && entrada.nfe?.ambiente === 'producao' && !vendaFechada && <CancelarNfeDialog nfe={entrada} />}
                {/* A entrada referencia a chave da saída via NFref — como a
                    saída já precisa estar em produção pra esse card ficar
                    ativo (ver `saidaProducao` acima), testar a entrada em
                    homologação é sempre impossível por definição (a SEFAZ de
                    homologação não enxerga chave de produção, rejeição [267]
                    — achado real 2026-10-01, SSH9B65). Direto em produção. */}
                {saidaProducao && !vendaFechada && (!entradaEmitida || podeReemitirHomologEntrada) && !entrada.pendente && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={entrada.loading || !destinoLojaId}
                    onClick={() => entrada.emitir({ ambiente: 'producao', destino_loja_id: destinoLojaId })}
                  >
                    {entrada.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : entrada.erro ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {entrada.erro ? 'Tentar novamente' : 'NF-e (Produção)'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Passo 3 (só 0km): sincronizar a transferência com o RENAVE, depois
              das duas NF-e's autorizadas em produção. Best-effort — payload da
              SERPRO ainda não validado em produção, ver renave/index.ts. */}
          {eh0km && saidaProducao && entradaEmitida && entrada.nfe?.ambiente === 'producao' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" /> 3. Sincronizar RENAVE
                  {renaveInfo?.id_estoque && (
                    <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sincronizado
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renaveInfo?.id_estoque ? (
                  <p className="text-xs text-muted-foreground">
                    RENAVE {renaveInfo.id_estoque}{renaveInfo.estado ? ` - ${renaveInfo.estado}` : ''}
                  </p>
                ) : (
                  <>
                    {renaveInfo?.ultimo_erro && (
                      <p className="text-sm text-destructive flex items-start gap-1.5">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {renaveInfo.ultimo_erro}
                      </p>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">CPF do Operador</Label>
                      {funcionarioCpfLoading ? (
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
                    <div className="flex justify-end">
                      <Button size="sm" className="gap-1.5" disabled={renaveLoading || funcionarioCpfLoading || !cpfOperadorValido} onClick={sincronizarRenave}>
                        {renaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                        Sincronizar RENAVE
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferenciaEstoqueDialog;
