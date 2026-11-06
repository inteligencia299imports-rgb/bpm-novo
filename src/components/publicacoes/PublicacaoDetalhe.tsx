import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Camera, Clock, ExternalLink, GripVertical, ImagePlus, Loader2, Star, Tag, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MARCA_MODELO_SELECT, flattenMarcaModelo } from '@/lib/marcaModelo';
import { getTipoAquisicaoBadgeClass, getTipoAquisicaoLabel } from '@/lib/tipoAquisicao';
import { ETAPAS_PUBLICACAO, FOTOS_MAX, FOTO_MAX_BYTES, MARCAS_SITE, slugSite, type EtapaPublicacao } from '@/lib/siteMoto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import StatusTimeline, { defaultFormatStatusLabel } from '@/components/shared/StatusTimeline';
import AtendimentoObservacoes from '@/components/showroom/AtendimentoObservacoes';

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

const SITE_URL = 'https://299imports.com.br';

// Movimentações da publicação no Histórico (status_history, entity_type 'publicacao').
const ROTULO_HISTORICO: Record<string, string> = {
  publicacao_fotos_tiradas: 'FOTOS TIRADAS',
  publicacao_publicada: 'PUBLICADA NO SITE',
  publicacao_despublicada: 'RETIRADA DO SITE',
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
  const [fotos, setFotos] = useState<string[]>(item.site?.fotos ?? []);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [avRes, dadosRes, siteRes] = await Promise.all([
      supabase.from('avaliacoes')
        .select(`id, atendimento_id, placa, ano_fabricacao, ano_modelo, km, cor, cilindrada, categoria, chassi, renavam, observacoes,
          tem_manual, tem_chave_reserva, manutencao_vencida, tem_acessorios, acessorios_descricao,
          valor_fipe, quanto_pede, tipo_aquisicao, situacao, ${MARCA_MODELO_SELECT}`)
        .eq('id', avId).maybeSingle(),
      (supabase as any).from('site_motos_dados').select('marca, modelo, ano_modelo, preco, preco_de, pendencias').eq('avaliacao_id', avId).maybeSingle(),
      (supabase as any).from('site_motos').select('*').eq('avaliacao_id', avId).maybeSingle(),
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
  const pendencias = [
    ...(dados?.pendencias ?? []).filter((p) => p !== 'Fotos'),
    ...(fotos.length === 0 ? ['Fotos'] : []),
  ];
  const estoque = item.estoque;
  const foraDoSite = estoque && !['disponivel', 'servico'].includes(estoque.status);
  const marcaLabel = MARCAS_SITE.find((m) => m.value === dados?.marca)?.label || moto?.marca;
  const precoAcao = estoque?.preco_acao ? Number(estoque.preco_acao) : null;
  const etapaAtual = ETAPAS_PUBLICACAO.find((e) => e.value === etapa);

  const gravar = async (nova: EtapaPublicacao, msg: string, statusHistorico?: string) => {
    setSalvando(true);
    const base = { avaliacao_id: avId, descricao: descricao.trim() || null, fotos, etapa: nova };
    // Endereço da página: fixado na 1ª publicação (não muda depois, para não quebrar links e Google).
    const slugAtual = site?.slug || (nova === 'publicada' ? slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo) : null);
    let { error } = await (supabase as any).from('site_motos').upsert({ ...base, slug: slugAtual }, { onConflict: 'avaliacao_id' });
    if (error?.code === '23505' && /slug/.test(error.message) && !site?.slug) {
      // Já existe anúncio com o mesmo marca-modelo-ano: diferencia pela placa.
      ({ error } = await (supabase as any).from('site_motos')
        .upsert({ ...base, slug: slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo, String(moto?.placa || '').replace(/-/g, '')) }, { onConflict: 'avaliacao_id' }));
    }
    if (error) {
      setSalvando(false);
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    if (statusHistorico) {
      await supabase.from('status_history').insert({
        entity_type: 'publicacao',
        entity_id: avId,
        status: statusHistorico,
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
      } as any);
    }
    setSalvando(false);
    toast.success(msg);
    await carregar();
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
      for (const f of aceitas) {
        const blob = await paraWebp(f);
        const caminho = `${avId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const { error } = await supabase.storage.from('site-motos').upload(caminho, blob, { contentType: 'image/webp', upsert: false });
        if (error) throw error;
        novas.push(supabase.storage.from('site-motos').getPublicUrl(caminho).data.publicUrl);
      }
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
            {etapaAtual && <Badge className="text-[10px] shrink-0 text-white" style={{ backgroundColor: etapaAtual.hex }}>{etapaAtual.label}</Badge>}
            {item.avaliacao.tipo_aquisicao && (
              <Badge variant="outline" className={`text-[10px] shrink-0 ${getTipoAquisicaoBadgeClass(item.avaliacao.tipo_aquisicao)}`}>
                {getTipoAquisicaoLabel(item.avaliacao.tipo_aquisicao)}
              </Badge>
            )}
            {foraDoSite && (
              <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500 text-amber-600">
                {estoque?.status === 'sinal' ? 'Sinal · fora do site' : 'Indisponível · fora do site'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {String(item.avaliacao.placa || '').replace(/-/g, '').toUpperCase()}
            {item.dataAquisicao && ` · ${estoque ? 'Entrada' : 'Aquisição'} em ${format(new Date(item.dataAquisicao), 'dd/MM/yyyy', { locale: ptBR })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {etapa === 'publicada' && site?.slug && (
            <Button size="sm" variant="ghost" asChild className="gap-1.5 text-primary">
              <a href={`${SITE_URL}/seminovas/${site.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Ver no site</a>
            </Button>
          )}
          {etapa === 'fotos_tiradas' && (
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => gravar('em_aberto', 'Voltou para Em Aberto', 'publicacao_em_aberto')}>Voltar para Em Aberto</Button>
          )}
          {etapa === 'publicada' && (
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => gravar('fotos_tiradas', 'Anúncio retirado do site', 'publicacao_despublicada')}>Despublicar</Button>
          )}
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => gravar(etapa, etapa === 'publicada' ? 'Anúncio atualizado no site' : 'Salvo')}>
            Salvar
          </Button>
          {etapa === 'em_aberto' && (
            <Button size="sm" className="gap-1.5" disabled={ocupado || fotos.length === 0} title={fotos.length === 0 ? 'Envie as fotos antes' : undefined}
              onClick={() => gravar('fotos_tiradas', 'Movida para Fotos Tiradas', 'publicacao_fotos_tiradas')}>
              <Camera className="h-4 w-4" /> Fotos tiradas
            </Button>
          )}
          {etapa === 'fotos_tiradas' && (
            <Button size="sm" className="gap-1.5" disabled={ocupado || !dados || pendencias.length > 0} title={pendencias.length ? `Falta: ${pendencias.join(', ')}` : undefined}
              onClick={() => gravar('publicada', 'Publicada no site', 'publicacao_publicada')}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Publicar no site
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 pr-3">
          {/* Dados da Moto */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Dados da Moto
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
                    {moto.chassi && <InfoItem label="Chassi" value={moto.chassi} />}
                    {moto.renavam && <InfoItem label="RENAVAM" value={moto.renavam} />}
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
                  <div className="mt-auto rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <Destaque label="Preço" value={formatCurrency(moto.quanto_pede)} />
                      <Destaque label="Valor da FIPE" value={formatCurrency(moto.valor_fipe)} />
                      <Destaque label="Preço Ação" value={formatCurrency(precoAcao)} />
                    </div>
                  </div>
                  {dados?.preco ? (
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      No site: {dados.preco_de ? <><s>{formatCurrency(dados.preco_de)}</s> por </> : null}
                      <b className="text-foreground">{formatCurrency(dados.preco)}</b>
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {/* Anúncio no Site: fotos + descrição */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" /> Anúncio no Site
                <span className="text-xs font-normal text-muted-foreground">({fotos.length}/{FOTOS_MAX} fotos)</span>
                <Button size="sm" variant="outline" className="gap-1.5 ml-auto h-7" disabled={ocupado || fotos.length >= FOTOS_MAX} onClick={() => inputFotos.current?.click()}>
                  {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Adicionar fotos
                </Button>
                <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => enviarFotos(e.target.files)} />
              </CardTitle>
              <Separator className="mt-2" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              {fotos.length === 0 ? (
                <button type="button" onClick={() => inputFotos.current?.click()}
                  className="w-full border border-dashed border-border rounded-lg py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Upload className="h-5 w-5" /> Envie as fotos da moto (até {FOTOS_MAX}, no máximo 3 MB cada)
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {fotos.map((url, i) => (
                      <div
                        key={url}
                        draggable
                        onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => { e.preventDefault(); if (arrastando !== null) moverPara(arrastando, i); setArrastando(null); }}
                        onDragEnd={() => setArrastando(null)}
                        className={cn(
                          'relative rounded-md overflow-hidden border cursor-grab active:cursor-grabbing select-none',
                          i === 0 ? 'border-primary ring-2 ring-primary' : 'border-border',
                          arrastando === i && 'opacity-40',
                        )}
                      >
                        <img src={url} alt="" draggable={false} className="w-full aspect-[3/4] object-cover pointer-events-none" />
                        {i === 0 && <span className="absolute top-1 left-1 text-[10px] font-semibold rounded bg-primary text-primary-foreground px-1.5 py-0.5">CAPA</span>}
                        <span className="absolute top-1 right-1 text-[10px] rounded bg-black/55 text-white px-1">{i + 1}</span>
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 p-1">
                          <GripVertical className="h-3.5 w-3.5 text-white/80" />
                          {i > 0 && (
                            <button type="button" title="Usar como capa" onClick={() => moverPara(i, 0)} className="text-white"><Star className="h-3.5 w-3.5" /></button>
                          )}
                          <button type="button" title="Remover" onClick={() => setFotos((f) => f.filter((x) => x !== url))} className="text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Arraste para ordenar a galeria do site. A primeira é a capa; a estrela leva a foto para a capa.</p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Descrição do anúncio</Label>
                <Textarea rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Texto que aparece na página da moto no site" />
              </div>
              {etapa !== 'em_aberto' && dados && pendencias.length > 0 && (
                <p className="text-xs rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
                  {etapa === 'publicada' ? 'Fora do site até resolver' : 'Para publicar falta'}: <b>{pendencias.join(', ')}</b>.
                </p>
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
                    <span className="text-xs text-muted-foreground">Observações</span>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{h.observacoes}</p>
                  </div>
                ) : null)}
              />
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default PublicacaoDetalhe;
