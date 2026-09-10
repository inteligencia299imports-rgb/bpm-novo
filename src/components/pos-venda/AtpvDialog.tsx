import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Bike, User, FileText, Loader2, CheckCircle2, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatPersonName } from '@/lib/utils';

/**
 * Emissão do ATPV-e de uma moto 0km (RENAVE / SERPRO) — última etapa do pós-venda.
 * Página aberta a partir do ProcessoDialog (etapa ATPV-E). Faz a saída de estoque
 * no RENAVE usando a NF-e de venda 0km autorizada em produção e gera o ATPV-e.
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

const AtpvDialog: React.FC<Props> = ({ open, onOpenChange, atendimento, estoqueMoto, onDone }) => {
  const [emitindo, setEmitindo] = useState(false);
  const [nfVenda, setNfVenda] = useState<any | null>(null);
  const [nfLoading, setNfLoading] = useState(true);
  const [estoque, setEstoque] = useState<any>(estoqueMoto);

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

  const recarregarEstoque = async () => {
    if (!emnId) return;
    const { data } = await (supabase as any).from('estoque_motos_novas').select('*').eq('id', emnId).maybeSingle();
    if (data) setEstoque({ ...estoque, ...data });
  };

  const nfAutorizada = !!nfVenda && nfVenda.status === 'processada' && nfVenda.ambiente === 'producao' && !!nfVenda.chave_nfe;

  const emitir = async () => {
    if (!emnId) return;
    setEmitindo(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('renave', {
        body: { acao: 'saida', estoque_moto_nova_id: emnId, atendimento_id: atendimento.id },
      });
      if (error || (res && res.error)) {
        toast.error(res?.error || error?.message || 'Falha ao emitir o ATPV-e');
        await recarregarEstoque();
        return;
      }
      toast.success(`ATPV-e emitido${res?.atpv_numero ? ` — Nº ${res.atpv_numero}` : ''}`);
      await recarregarEstoque();
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
            <CardTitle className="text-sm flex items-center gap-2"><Bike className="h-4 w-4 text-primary" /> Moto 0km</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Info label="Marca / Modelo" value={motoLabel} />
            <Info label="Chassi" value={<span className="font-mono">{chassi || '—'}</span>} />
            <Info label="RENAVAM" value={estoque?.renave_renavam || estoque?.renavam} />
            <Info label="Placa" value={estoque?.renave_placa || estoque?.placa} />
            <Info label="idEstoque RENAVE" value={estoque?.renave_id_estoque} />
            <Info label="Estado RENAVE" value={estoque?.renave_estado} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Comprador</CardTitle>
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
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> NF-e de venda (0km)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {nfLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</span>
          ) : !nfVenda ? (
            <span className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Nenhuma NF-e de venda 0km encontrada — emita a NF-e antes do ATPV-e.
            </span>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label="Número / Série" value={`${nfVenda.numero || '—'} / ${nfVenda.serie || '—'}`} />
              <Info label="Situação" value={nfVenda.status || '—'} />
              <Info label="Ambiente" value={nfVenda.ambiente || '—'} />
              <Info label="Chave" value={<span className="font-mono text-[11px] break-all">{nfVenda.chave_nfe || '—'}</span>} />
            </div>
          )}
          {!nfLoading && nfVenda && !nfAutorizada && (
            <span className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" /> A NF-e precisa estar <strong>autorizada em produção</strong> para emitir o ATPV-e.
            </span>
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
      ) : (
        <div className="space-y-2">
          {!renaveEntrouEstoque && (
            <span className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Esta moto ainda não tem <strong>entrada no estoque RENAVE</strong> — faça a entrada em Estoque &gt; RENAVE.
            </span>
          )}
          {estoque?.renave_ultimo_erro && (
            <span className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Última tentativa: {estoque.renave_ultimo_erro}
            </span>
          )}
          <Button
            className="w-full gap-2"
            disabled={emitindo || !renaveEntrouEstoque || !nfAutorizada}
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
