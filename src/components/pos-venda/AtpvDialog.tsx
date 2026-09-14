import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Bike, User, FileText, Loader2, CheckCircle2, XCircle, ExternalLink, AlertTriangle, History, PackagePlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatPersonName } from '@/lib/utils';

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

const formatDataHora = (v: string) => {
  try {
    return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return v;
  }
};

const AtpvDialog: React.FC<Props> = ({ open, onOpenChange, atendimento, estoqueMoto, onDone }) => {
  const [emitindo, setEmitindo] = useState(false);
  const [nfVenda, setNfVenda] = useState<any | null>(null);
  const [nfLoading, setNfLoading] = useState(true);
  const [nfCompra, setNfCompra] = useState<any | null>(null);
  const [estoque, setEstoque] = useState<any>(estoqueMoto);
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);
  const [dataEntrada, setDataEntrada] = useState('');
  const [entrandoEstoque, setEntrandoEstoque] = useState(false);

  useEffect(() => { setEstoque(estoqueMoto); }, [estoqueMoto]);

  const emnId: string | undefined = estoque?.id;
  const chassi: string = estoque?.chassi || '';
  const cli = atendimento?.cliente || {};
  const end = cli?.clientes_fornecedores_enderecos?.[0] || {};

  const renaveEntrouEstoque = !!estoque?.renave_id_estoque;
  const atpvEmitido = !!estoque?.renave_atpv_numero;

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
        setNfCompra(data || null);
        const base = data?.data_entrada || data?.data_emissao;
        setDataEntrada(base ? String(base).slice(0, 10) : new Date().toISOString().slice(0, 10));
      });
    return () => { cancel = true; };
  }, [open, emnId]);

  const carregarHistorico = async () => {
    if (!emnId && !chassi) return;
    setHistoricoLoading(true);
    let query = (supabase as any).from('renave_chamadas').select('*').order('created_at', { ascending: false }).limit(50);
    query = emnId && chassi
      ? query.or(`estoque_moto_nova_id.eq.${emnId},chassi.eq.${chassi}`)
      : emnId
        ? query.eq('estoque_moto_nova_id', emnId)
        : query.eq('chassi', chassi);
    const { data } = await query;
    setHistorico(data || []);
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
        },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || error?.message || 'Falha na entrada RENAVE');
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
        body: { acao: 'saida', estoque_moto_nova_id: emnId, atendimento_id: atendimento.id },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || error?.message || 'Falha ao emitir o ATPV-e');
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
          <Badge className="text-[10px] shrink-0 bg-emerald-100 text-emerald-700">ATPV-e emitido</Badge>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {historicoLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</span>
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chamada ao RENAVE registrada ainda para esta moto.</p>
          ) : (
            <div className="space-y-2">
              {historico.map((h) => (
                <div key={h.id} className="flex items-start gap-2.5 text-sm border-b last:border-0 pb-2 last:pb-0">
                  {h.sucesso ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{OPERACAO_LABEL[h.operacao] || h.operacao}</span>
                      <span className="text-xs text-muted-foreground">{formatDataHora(h.created_at)}</span>
                      {h.status_http != null && (
                        <span className="text-xs text-muted-foreground">HTTP {h.status_http}</span>
                      )}
                    </div>
                    {!h.sucesso && h.erro_mensagem && (
                      <p className="text-xs text-destructive mt-0.5 break-words">{h.erro_mensagem}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
            {estoque?.renave_atpv_url && (
              <a href={estoque.renave_atpv_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-medium">
                <ExternalLink className="h-3.5 w-3.5" /> Baixar ATPV-e (PDF)
              </a>
            )}
            <p className="text-xs text-muted-foreground">O pós-venda foi concluído com a emissão do ATPV-e.</p>
          </CardContent>
        </Card>
      ) : !renaveEntrouEstoque ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Entrada RENAVE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-[200px]">
              <Label className="text-xs text-muted-foreground">Data da entrada</Label>
              <Input className="mt-1" type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
              {nfCompra && (
                <p className="text-[11px] text-muted-foreground mt-1">Sugerida a partir da NF-e de compra da montadora.</p>
              )}
            </div>
            {estoque?.renave_ultimo_erro && (
              <span className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Última tentativa: {estoque.renave_ultimo_erro}
              </span>
            )}
            <Button className="w-full gap-2" disabled={entrandoEstoque} onClick={fazerEntrada}>
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
          {estoque?.renave_ultimo_erro && (
            <span className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Última tentativa: {estoque.renave_ultimo_erro}
            </span>
          )}
          <Button
            className="w-full gap-2"
            disabled={emitindo || !nfAutorizada}
            onClick={emitir}
          >
            {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Emitir ATPV-e e concluir pós-venda
          </Button>
        </div>
      )}
    </div>
  );
};

export default AtpvDialog;
