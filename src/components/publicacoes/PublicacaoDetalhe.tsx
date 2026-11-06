import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Clock, DollarSign, ExternalLink, Eye, FileText, Loader2, Pencil, Plus, RefreshCw, Save, ShoppingCart, Tag, Trash2, Upload, X, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import { getTipoAquisicaoBadgeClass, getTipoAquisicaoLabel } from '@/lib/tipoAquisicao';
import { ETAPAS_PUBLICACAO, FOTOS_MAX, FOTOS_MIN, FOTO_MAX_BYTES, MARCAS_SITE, SITE_URL, slugSite, type EtapaPublicacao } from '@/lib/siteMoto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import StatusTimeline, { defaultFormatStatusLabel } from '@/components/shared/StatusTimeline';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';
import EditarMotoPublicacaoDialog from './EditarMotoPublicacaoDialog';

export interface ItemPublicacao {
  avaliacao: any;
  estoque: { status: string; preco_acao: number | null; loja_id: string | null; created_at: string } | null;
  site: any | null;
  etapa: EtapaPublicacao;
  lojaBpm: string | null;
  dataAquisicao: string;
}

interface Props {
  item: ItemPublicacao;
  onClose: () => void;
}

/** Linha da view site_motos_dados: a moto do BPM já traduzida para o site. */
interface DadosSite {
  marca: string | null;
  modelo: string | null;
  ano_modelo: number | null;
  preco: number | null;
  preco_de: number | null;
  pendencias: string[];
}



// Movimentações da publicação no Histórico (status_history, entity_type 'publicacao').
const ROTULO_HISTORICO: Record<string, string> = {
  publicacao_fotos_tiradas: 'FOTOS TIRADAS',
  publicacao_fotos_adicionadas: 'FOTOS ADICIONADAS',
  publicacao_fotos_editadas: 'FOTOS EDITADAS',
  publicacao_publicada: 'PUBLICADA NO SITE',
  publicacao_despublicada: 'RETIRADA DO SITE',
  publicacao_desativada: 'DESATIVADA',
  publicacao_em_aberto: 'PUBLICAÇÃO VOLTOU PARA EM ABERTO',
  vendido: 'adquirida',
  contrato_compra_gerado: 'CONTRATO GERADO',
  em_andamento: 'Pós-Compra em andamento',
  'Em Andamento': 'Pós-Compra em andamento',
};

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatKm = (km: string | null | undefined) => {
  if (!km) return null;
  const num = parseInt(String(km).replace(/\D/g, ''), 10);
  return Number.isNaN(num) ? km : `${num.toLocaleString('pt-BR')} km`;
};

// Foto no Storage do DB 299 (bucket site-motos): a tabela guarda o caminho; a tela trabalha com a URL pública.
const urlFoto = (caminho: string) => supabase.storage.from('site-motos').getPublicUrl(caminho).data.publicUrl;
const caminhoFoto = (url: string) => decodeURIComponent(url.split('/site-motos/')[1] || url);

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Redimensiona para no máximo 1600px e converte para WebP no navegador (fotos menores no site). */
async function paraWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao converter a foto'))), 'image/webp', 0.85));
}

const InfoItem = ({ label, value, valueClassName }: { label: string; value: string | null | undefined; valueClassName?: string }) => (
  value ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className={`text-sm font-semibold ${valueClassName || ''}`}>{value}</span>
    </div>
  ) : null
);

const Destaque = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
    <p className="text-base font-bold text-primary">{value}</p>
  </div>
);

const PublicacaoDetalhe: React.FC<Props> = ({ item, onClose }) => {
  const { user, userName } = useAuth();
  const avId = item.avaliacao.id as string;
  const [moto, setMoto] = useState<any>(null);
  const [site, setSite] = useState<any>(item.site);
  const [etapa, setEtapa] = useState<EtapaPublicacao>(item.etapa);
  const [dados, setDados] = useState<DadosSite | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [descricao, setDescricao] = useState<string>(item.site?.descricao ?? '');
  // Galeria (URLs públicas, na ordem; a 1ª é a capa). fotosGravadas = como está no banco, para o histórico.
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotosGravadas, setFotosGravadas] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [editarMotoOpen, setEditarMotoOpen] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);
  const inputSubstituir = useRef<HTMLInputElement>(null);
  const [substituindo, setSubstituindo] = useState<number | null>(null);
  const [vendo, setVendo] = useState<number | null>(null);
  const [soltando, setSoltando] = useState(false);
  // Pop-up do motivo da desativação (null = fechado).
  const [motivoDesativar, setMotivoDesativar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [avRes, dadosRes, siteRes, fotosRes] = await Promise.all([
      supabase.from('avaliacoes')
        .select(`id, atendimento_id, placa, ano_fabricacao, ano_modelo, km, cor, cilindrada, categoria, observacoes,
          tem_manual, tem_chave_reserva, manutencao_vencida, tem_acessorios, acessorios_descricao,
          valor_fipe, quanto_pede, tipo_aquisicao, situacao, ${MARCA_MODELO_SELECT}`)
        .eq('id', avId).maybeSingle(),
      (supabase as any).from('site_motos_dados').select('marca, modelo, ano_modelo, preco, preco_de, pendencias').eq('avaliacao_id', avId).maybeSingle(),
      (supabase as any).from('site_motos').select('*').eq('avaliacao_id', avId).maybeSingle(),
      (supabase as any).from('site_motos_fotos').select('caminho').eq('avaliacao_id', avId).order('ordem'),
    ]);
    if (avRes.error) toast.error(`Erro ao carregar a moto: ${avRes.error.message}`);
    const av = avRes.data ? flattenMarcaModelo(avRes.data as any) : null;
    setMoto(av);
    if (dadosRes.error) toast.error(`Erro ao carregar os dados do site: ${dadosRes.error.message}`);
    else setDados(dadosRes.data);
    if (siteRes.data) {
      setSite(siteRes.data);
      setEtapa(siteRes.data.etapa);
    }
    if (fotosRes.error) toast.error(`Erro ao carregar as fotos: ${fotosRes.error.message}`);
    else {
      const urls = ((fotosRes.data as { caminho: string }[]) || []).map((r) => urlFoto(r.caminho));
      setFotos(urls);
      setFotosGravadas(urls);
    }

    // Histórico: avaliação/pós-compra/preparação/publicação (pela avaliação) + showroom/contrato (pelo atendimento).
    const [{ data: hAv }, { data: hAt }] = await Promise.all([
      supabase.from('status_history').select('*')
        .in('entity_type', ['avaliacao', 'consulta', 'pos_compra', 'consignacao', 'preparacao', 'publicacao'])
        .eq('entity_id', avId).order('created_at', { ascending: true }),
      av?.atendimento_id
        ? supabase.from('status_history').select('*').in('entity_type', ['showroom', 'contrato']).eq('entity_id', av.atendimento_id).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setHistory([...(hAv || []), ...(hAt || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
  }, [avId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Fotos conferidas aqui (estado local); o resto vem do BPM.
  // pendenciasSite: o que tira a moto do site (mesma regra da view). Descrição é exigida só no botão Publicar
  // (os anúncios migrados do site antigo estão no ar sem descrição).
  const pendenciasSite = [
    ...(dados?.pendencias ?? []).filter((p) => p !== 'Fotos'),
    ...(fotos.length === 0 ? ['Fotos'] : []),
  ];
  const pendencias = [
    ...pendenciasSite,
    ...(fotos.length > 0 && fotos.length < FOTOS_MIN ? [`Mínimo de ${FOTOS_MIN} fotos (${fotos.length}/${FOTOS_MIN})`] : []),
    ...(descricao.trim() === '' ? ['Descrição do anúncio'] : []),
  ];
  const avisoPendencias = etapa === 'publicada' ? pendenciasSite : pendencias;
  const estoque = item.estoque;
  // Com sinal ou vendida a moto já saiu do site: a tela fica só para consulta.
  const travada = ['sinal', 'vendido', 'retirada'].includes(estoque?.status || '');
  const marcaLabel = MARCAS_SITE.find((m) => m.value === dados?.marca)?.label || moto?.marca;
  const precoAcao = estoque?.preco_acao ? Number(estoque.preco_acao) : null;
  const etapaAtual = ETAPAS_PUBLICACAO.find((e) => e.value === etapa);

  const gravar = async (nova: EtapaPublicacao, msg: string, statusHistorico?: string, observacao?: string) => {
    setSalvando(true);
    const base = { avaliacao_id: avId, descricao: descricao.trim() || null, etapa: nova };
    // Endereço da página: fixado na 1ª publicação (não muda depois, para não quebrar links e Google).
    const slugAtual = site?.slug || (nova === 'publicada' ? slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo) : null);
    let { error } = await (supabase as any).from('site_motos').upsert({ ...base, slug: slugAtual }, { onConflict: 'avaliacao_id' });
    if (error?.code === '23505' && /slug/.test(error.message) && !site?.slug) {
      // Já existe anúncio com o mesmo marca-modelo-ano: diferencia pela placa.
      ({ error } = await (supabase as any).from('site_motos')
        .upsert({ ...base, slug: slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo, String(moto?.placa || '').replace(/-/g, '')) }, { onConflict: 'avaliacao_id' }));
    }
    if (!error) {
      // Galeria inteira de uma vez (ordem = posição; a 1ª é a capa).
      ({ error } = await (supabase as any).rpc('salvar_fotos_site_moto', { _avaliacao_id: avId, _caminhos: fotos.map(caminhoFoto) }));
    }
    if (error) {
      setSalvando(false);
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    // Histórico: mudanças nas fotos (comparando com o que estava gravado) + mudança de etapa.
    const antes = fotosGravadas;
    const adicionadas = fotos.some((u) => !antes.includes(u));
    const mantidas = fotos.filter((u) => antes.includes(u));
    const editadas = antes.some((u) => !fotos.includes(u)) || mantidas.some((u, i) => antes.filter((x) => fotos.includes(x))[i] !== u);
    const registros = [
      ...(adicionadas ? ['publicacao_fotos_adicionadas'] : []),
      ...(editadas ? ['publicacao_fotos_editadas'] : []),
      ...(statusHistorico ? [statusHistorico] : []),
    ];
    if (registros.length) {
      await supabase.from('status_history').insert(registros.map((status) => ({
        entity_type: 'publicacao',
        entity_id: avId,
        status,
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
        // O motivo (ex.: desativação) vai só na linha da mudança de etapa.
        observacoes: status === statusHistorico ? observacao || null : null,
      })) as any);
    }
    setSalvando(false);
    toast.success(msg);
    await carregar();
  };

  // Salvar: grava fotos e descrição. Antes de publicar, a etapa segue as fotos:
  // com o mínimo de fotos vai para Fotos Tiradas; abaixo dele fica (ou volta) em Em Aberto.
  const salvar = () => {
    if (etapa === 'publicada') return gravar('publicada', 'Anúncio atualizado no site');
    if (etapa === 'desativada') return gravar('desativada', 'Salvo');
    const nova: EtapaPublicacao = fotos.length >= FOTOS_MIN ? 'fotos_tiradas' : 'em_aberto';
    if (nova === etapa) return gravar(etapa, 'Salvo');
    return nova === 'fotos_tiradas'
      ? gravar('fotos_tiradas', 'Salvo e movido para Fotos Tiradas', 'publicacao_fotos_tiradas')
      : gravar('em_aberto', 'Salvo e movido para Em Aberto', 'publicacao_em_aberto');
  };

  const subirFoto = async (f: File) => {
    const blob = await paraWebp(f);
    const caminho = `${avId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const { error } = await supabase.storage.from('site-motos').upload(caminho, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
    return supabase.storage.from('site-motos').getPublicUrl(caminho).data.publicUrl;
  };

  // Substituir: troca a foto na mesma posição da galeria.
  const substituirFoto = async (files: FileList | null) => {
    const i = substituindo;
    const f = files?.[0];
    if (inputSubstituir.current) inputSubstituir.current.value = '';
    setSubstituindo(null);
    if (i === null || !f) return;
    if (f.size > FOTO_MAX_BYTES) {
      toast.error(`Foto acima de 3 MB não é aceita: ${f.name} (${mb(f.size)})`);
      return;
    }
    setEnviando(true);
    try {
      const url = await subirFoto(f);
      setFotos((lista) => lista.map((x, j) => (j === i ? url : x)));
    } catch (e: any) {
      toast.error(`Erro ao enviar foto: ${e?.message || e}`);
    }
    setEnviando(false);
  };

  const enviarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const lista = Array.from(files);
    const grandes = lista.filter((f) => f.size > FOTO_MAX_BYTES);
    if (grandes.length) toast.error(`Foto acima de 3 MB não é aceita: ${grandes.map((f) => `${f.name} (${mb(f.size)})`).join(', ')}`);
    const aceitas = lista.filter((f) => f.size <= FOTO_MAX_BYTES).slice(0, Math.max(0, FOTOS_MAX - fotos.length));
    if (lista.length - grandes.length > aceitas.length) toast.error(`O anúncio aceita no máximo ${FOTOS_MAX} fotos.`);
    if (!aceitas.length) {
      if (inputFotos.current) inputFotos.current.value = '';
      return;
    }
    setEnviando(true);
    const novas: string[] = [];
    try {
      for (const f of aceitas) novas.push(await subirFoto(f));
    } catch (e: any) {
      toast.error(`Erro ao enviar foto: ${e?.message || e}`);
    }
    if (novas.length) setFotos((f) => [...f, ...novas].slice(0, FOTOS_MAX));
    setEnviando(false);
    if (inputFotos.current) inputFotos.current.value = '';
  };

  const moverPara = (de: number, para: number) => setFotos((f) => {
    if (de === para || de < 0 || para < 0 || de >= f.length || para >= f.length) return f;
    const n = [...f];
    const [x] = n.splice(de, 1);
    n.splice(para, 0, x);
    return n;
  });

  const ocupado = salvando || enviando;

  return (
    <div className="space-y-4">
      {/* Cabeçalho (mesmo padrão do Pós-Compra) */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold truncate">
              {[item.avaliacao.marca, item.avaliacao.modelo].filter(Boolean).join(' ').toUpperCase()}
            </h1>
            {etapaAtual && (
              <Badge className="text-[10px] shrink-0 border-transparent shadow-none" style={{ backgroundColor: `${etapaAtual.hex}26`, color: etapaAtual.hex }}>
                {etapaAtual.value === 'publicada' ? 'Publicada' : etapaAtual.value === 'desativada' ? 'Desativada' : etapaAtual.label}
              </Badge>
            )}
            {item.avaliacao.tipo_aquisicao && (
              <Badge variant="outline" className={`text-[10px] shrink-0 ${getTipoAquisicaoBadgeClass(item.avaliacao.tipo_aquisicao)}`}>
                {getTipoAquisicaoLabel(item.avaliacao.tipo_aquisicao)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {String(item.avaliacao.placa || '').replace(/-/g, '').toUpperCase()}
            {item.dataAquisicao && ` · ${estoque ? 'Entrada' : 'Aquisição'} em ${format(new Date(item.dataAquisicao), 'dd/MM/yyyy', { locale: ptBR })}`}
          </p>
        </div>
        {!travada && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {etapa === 'publicada' && site?.slug && (
            <Button size="sm" asChild className="w-28 gap-1.5">
              <a href={`${SITE_URL}/seminovas/${site.slug}`} target="_blank" rel="noreferrer" title="Ver anúncio no site"><ShoppingCart className="h-4 w-4" fill="currentColor" /> Site</a>
            </Button>
          )}
          {etapa === 'publicada' && (
            <Button size="sm" variant="outline" className="w-28 gap-1.5 border-destructive bg-transparent text-destructive hover:bg-transparent hover:text-destructive hover:opacity-80" disabled={ocupado} onClick={() => setMotivoDesativar('')}>
              <X className="h-4 w-4" /> Desativar
            </Button>
          )}
          <Button size="sm" variant="outline" className="w-28 gap-1.5 border-primary bg-transparent hover:bg-transparent hover:opacity-80" disabled={ocupado} onClick={salvar}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Save className="h-4 w-4 text-primary" />} Salvar
          </Button>
          {/* Publicar só aparece quando já dá para ir ao ar (fotos, descrição e dados da moto completos). */}
          {etapa !== 'publicada' && dados && pendencias.length === 0 && (
            <Button size="sm" className="w-28 gap-1.5" disabled={ocupado} onClick={() => gravar('publicada', 'Publicada no site', 'publicacao_publicada')}>
              <ExternalLink className="h-4 w-4" /> Publicar
            </Button>
          )}
        </div>
        )}
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados da Moto */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Dados da Moto
                {moto && !travada && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setEditarMotoOpen(true)} title="Editar dados da moto">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              {!moto ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem label="Marca" value={moto.marca} />
                    <InfoItem label="Modelo" value={(moto.modelo || '').toUpperCase()} />
                    <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />
                    <InfoItem label="Ano Modelo" value={moto.ano_modelo} />
                    <InfoItem label="Cilindrada" value={moto.cilindrada ? `${moto.cilindrada} cc` : null} />
                    <InfoItem label="Categoria" value={moto.categoria} />
                    <InfoItem label="Cor" value={moto.cor} />
                    <InfoItem label="Placa" value={moto.placa?.replace(/-/g, '')} />
                    <InfoItem label="KM" value={formatKm(moto.km)} />
                    <InfoItem label="Loja" value={item.lojaBpm} />
                    {moto.observacoes && (
                      <div className="col-span-2">
                        <InfoItem label="Observações" value={moto.observacoes} />
                      </div>
                    )}
                  </div>
                  <MaintenanceBadges
                    temManual={moto.tem_manual}
                    temChaveReserva={moto.tem_chave_reserva}
                    manutencaoVencida={moto.manutencao_vencida}
                    temAcessorios={moto.tem_acessorios}
                    acessoriosDescricao={moto.acessorios_descricao}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Coluna da direita: Valores + Descrição do Anúncio */}
          <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Valores
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent>
              {!moto ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="py-2">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <Destaque label="Preço" value={formatCurrency(moto.quanto_pede)} />
                    <Destaque label="Valor da FIPE" value={formatCurrency(moto.valor_fipe)} />
                    <Destaque label="Preço Ação" value={formatCurrency(precoAcao)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Descrição do Anúncio */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Descrição do Anúncio
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
              <Textarea rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} readOnly={travada}
                placeholder="Texto que aparece na página da moto no site" className="flex-1 min-h-[120px]" />
              {etapa !== 'em_aberto' && dados && avisoPendencias.length > 0 && (
                <p className="text-xs rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
                  {etapa === 'publicada' ? 'Fora do site até resolver' : 'Para publicar falta'}: <b>{avisoPendencias.join(', ')}</b>.
                </p>
              )}
            </CardContent>
          </Card>
          </div>

          {/* Fotos */}
          <Card className="flex flex-col md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" /> Fotos
                <span className="text-xs font-normal text-muted-foreground">({fotos.length}/{FOTOS_MAX} fotos)</span>
                {fotos.length > 0 && !travada && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-primary hover:text-primary hover:bg-transparent hover:opacity-80"
                    disabled={ocupado || fotos.length >= FOTOS_MAX} onClick={() => inputFotos.current?.click()}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
                  </Button>
                )}
                <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => enviarFotos(e.target.files)} />
                <input ref={inputSubstituir} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => substituirFoto(e.target.files)} />
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              {fotos.length === 0 && travada ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma foto.</p>
              ) : fotos.length === 0 ? (
                // Sem fotos: área para clicar ou soltar os arquivos.
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => inputFotos.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setSoltando(true); }}
                  onDragLeave={() => setSoltando(false)}
                  onDrop={(e) => { e.preventDefault(); setSoltando(false); enviarFotos(e.dataTransfer.files); }}
                  className={cn(
                    'w-full py-24 rounded-lg border-2 border-dashed text-sm text-muted-foreground flex flex-col items-center gap-2 transition-colors',
                    soltando ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/60 hover:bg-muted/40',
                  )}
                >
                  {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                  <span className="font-medium text-foreground">Clique ou arraste as fotos aqui</span>
                  <span className="text-xs">De {FOTOS_MIN} a {FOTOS_MAX} fotos, no máximo 3 MB cada.</span>
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                    {fotos.map((url, i) => (
                      <div
                        key={url}
                        draggable={!travada}
                        onDragStart={(e) => { if (travada) return; setArrastando(i); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { if (travada) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => { if (travada) return; e.preventDefault(); if (arrastando !== null) moverPara(arrastando, i); setArrastando(null); }}
                        onDragEnd={() => setArrastando(null)}
                        className={cn(
                          'group relative rounded-md overflow-hidden border select-none',
                          !travada && 'cursor-grab active:cursor-grabbing',
                          i === 0 ? 'border-primary ring-2 ring-primary' : 'border-border',
                          arrastando === i && 'opacity-40',
                        )}
                      >
                        <img src={url} alt="" draggable={false} className="w-full aspect-[3/4] object-cover pointer-events-none" />
                        {i === 0 && <span className="absolute top-1 left-1 text-[10px] font-semibold rounded bg-primary text-primary-foreground px-1.5 py-0.5">CAPA</span>}
                        <span className="absolute top-1 right-1 text-[10px] rounded bg-black/55 text-white px-1">{i + 1}</span>
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                          <button type="button" title="Visualizar" onClick={() => setVendo(i)}
                            className="rounded-full bg-white/90 p-1.5 text-foreground hover:bg-white"><Eye className="h-4 w-4" /></button>
                          {!travada && (<>
                          <button type="button" title="Substituir" disabled={ocupado} onClick={() => { setSubstituindo(i); inputSubstituir.current?.click(); }}
                            className="rounded-full bg-white/90 p-1.5 text-foreground hover:bg-white"><RefreshCw className="h-4 w-4" /></button>
                          <button type="button" title="Excluir" disabled={ocupado} onClick={() => setFotos((f) => f.filter((x) => x !== url))}
                            className="rounded-full bg-white/90 p-1.5 text-destructive hover:bg-white"><Trash2 className="h-4 w-4" /></button>
                          </>)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!travada && <p className="text-[11px] text-muted-foreground">Arraste para ordenar a galeria do site.</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Observações */}
          {moto?.atendimento_id && <AtendimentoObservacoes idOperacao={moto.atendimento_id} />}

          {/* Histórico de Movimentações */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Histórico de Movimentações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline
                history={history}
                formatLabel={(raw) => ROTULO_HISTORICO[raw] || defaultFormatStatusLabel(raw)}
                renderPopupExtra={(h) => (h.observacoes ? (
                  <div>
                    <span className="text-xs text-muted-foreground">{h.status === 'publicacao_desativada' ? 'Motivo da Desativação' : 'Observações'}</span>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{h.observacoes}</p>
                  </div>
                ) : null)}
              />
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Desativar: motivo obrigatório (mesmo padrão do Perdido) */}
      <Dialog open={motivoDesativar !== null} onOpenChange={(o) => { if (!o) setMotivoDesativar(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Desativar Anúncio
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo da desativação <span className="text-destructive">*</span></Label>
            <Textarea value={motivoDesativar || ''} onChange={(e) => setMotivoDesativar(e.target.value)} placeholder="Informe o motivo..." rows={3} />
            <p className="text-xs text-muted-foreground">O anúncio sai do site e vai para <strong>Desativadas</strong>. Para voltar, é só publicar de novo.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMotivoDesativar(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!motivoDesativar?.trim() || salvando}
                onClick={async () => {
                  const motivo = motivoDesativar!.trim();
                  setMotivoDesativar(null);
                  await gravar('desativada', 'Anúncio desativado', 'publicacao_desativada', motivo);
                }}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualizar foto (com navegação entre as fotos da galeria) */}
      <Dialog open={vendo !== null && !!fotos[vendo]} onOpenChange={(o) => { if (!o) setVendo(null); }}>
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogTitle className="sr-only">Foto {vendo !== null ? vendo + 1 : ''}</DialogTitle>
          {vendo !== null && fotos[vendo] && (
            <div className="relative flex flex-col items-center gap-2">
              <img src={fotos[vendo]} alt="" className="max-h-[80vh] w-auto rounded-md object-contain" />
              <span className="text-xs text-muted-foreground">
                {vendo === 0 ? 'Capa · ' : ''}{vendo + 1} de {fotos.length}
              </span>
              {fotos.length > 1 && (
                <>
                  <button type="button" title="Anterior" onClick={() => setVendo((v) => (v === null ? v : (v - 1 + fotos.length) % fotos.length))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow border border-border hover:bg-background"><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" title="Próxima" onClick={() => setVendo((v) => (v === null ? v : (v + 1) % fotos.length))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow border border-border hover:bg-background"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditarMotoPublicacaoDialog open={editarMotoOpen} onOpenChange={setEditarMotoOpen} moto={moto} onSaved={carregar} />
    </div>
  );
};

export default PublicacaoDetalhe;
