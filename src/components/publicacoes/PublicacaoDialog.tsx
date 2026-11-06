import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Camera, ExternalLink, GripVertical, ImagePlus, Loader2, Star, Trash2, Upload } from 'lucide-react';
import { ETAPAS_PUBLICACAO, FOTOS_MAX, FOTO_MAX_BYTES, MARCAS_SITE, slugSite, type EtapaPublicacao } from '@/lib/siteMoto';

export interface ItemPublicacao {
  avaliacao: any;
  estoque: { status: string; preco_acao: number | null; loja_id: string | null; created_at: string } | null;
  site: any | null;
  etapa: EtapaPublicacao;
  lojaBpm: string | null;
  dataAquisicao: string;
}

interface Props {
  open: boolean;
  item: ItemPublicacao;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Linha da view site_motos_dados: a moto do BPM já traduzida para o site + o anúncio. */
interface DadosSite {
  marca: string | null;
  modelo: string | null;
  ano_fab: number | null;
  ano_modelo: number | null;
  km: number | null;
  cc: number | null;
  cor: string | null;
  estilo: string | null;
  loja: string | null;
  preco: number | null;
  preco_de: number | null;
  fipe: number | null;
  diferenciais: string[];
  pendencias: string[];
}

const SITE_URL = 'https://299imports.com.br';

const moeda = (v: number | null | undefined) =>
  v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—';
const simNao = (v: boolean | null | undefined) => (v === true ? 'Sim' : v === false ? 'Não' : '—');
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

const Info = ({ rotulo, valor, destaque }: { rotulo: string; valor: React.ReactNode; destaque?: boolean }) => (
  <div className="space-y-0.5">
    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
    <p className={cn('text-sm', destaque ? 'font-semibold text-foreground' : 'text-foreground')}>{valor || '—'}</p>
  </div>
);

const PublicacaoDialog: React.FC<Props> = ({ open, item, onOpenChange, onSaved }) => {
  const av = item.avaliacao;
  const s = item.site || {};
  const [dados, setDados] = useState<DadosSite | null>(null);
  const [descricao, setDescricao] = useState<string>(s.descricao ?? '');
  const [fotos, setFotos] = useState<string[]>(s.fotos ?? []);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (supabase as any).from('site_motos_dados').select('*').eq('avaliacao_id', av.id).maybeSingle()
      .then(({ data, error }: any) => {
        if (error) toast.error(`Erro ao carregar os dados da moto: ${error.message}`);
        else setDados(data);
      });
  }, [av.id]);

  // Fotos são conferidas aqui (estado local); o resto vem do BPM.
  const pendencias = [
    ...(dados?.pendencias ?? []).filter((p) => p !== 'Fotos'),
    ...(fotos.length === 0 ? ['Fotos'] : []),
  ];
  const foraDoSite = item.estoque && !['disponivel', 'servico'].includes(item.estoque.status);
  const marcaLabel = MARCAS_SITE.find((m) => m.value === dados?.marca)?.label || av.marca;

  const gravar = async (etapa: EtapaPublicacao, msg: string) => {
    setSalvando(true);
    const base = { avaliacao_id: av.id, descricao: descricao.trim() || null, fotos, etapa };
    // Endereço da página: fixado na 1ª publicação (não muda depois, para não quebrar links e Google).
    const slugBase = s.slug || (etapa === 'publicada' ? slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo) : null);
    let { error } = await (supabase as any).from('site_motos').upsert({ ...base, slug: slugBase }, { onConflict: 'avaliacao_id' });
    if (error?.code === '23505' && /slug/.test(error.message) && !s.slug) {
      // Já existe anúncio com o mesmo marca-modelo-ano: diferencia pela placa.
      ({ error } = await (supabase as any).from('site_motos')
        .upsert({ ...base, slug: slugSite(marcaLabel, dados?.modelo, dados?.ano_modelo, String(av.placa || '').replace(/-/g, '')) }, { onConflict: 'avaliacao_id' }));
    }
    setSalvando(false);
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success(msg);
    onSaved();
  };

  const enviarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const lista = Array.from(files);
    const grandes = lista.filter((f) => f.size > FOTO_MAX_BYTES);
    if (grandes.length) {
      toast.error(`Foto acima de 3 MB não é aceita: ${grandes.map((f) => `${f.name} (${mb(f.size)})`).join(', ')}`);
    }
    const vagas = FOTOS_MAX - fotos.length;
    const aceitas = lista.filter((f) => f.size <= FOTO_MAX_BYTES).slice(0, Math.max(0, vagas));
    if (lista.length - grandes.length > aceitas.length) {
      toast.error(`O anúncio aceita no máximo ${FOTOS_MAX} fotos.`);
    }
    if (!aceitas.length) {
      if (inputFotos.current) inputFotos.current.value = '';
      return;
    }
    setEnviando(true);
    const novas: string[] = [];
    try {
      for (const f of aceitas) {
        const blob = await paraWebp(f);
        const caminho = `${av.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
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
  const remover = (url: string) => setFotos((f) => f.filter((x) => x !== url));
  const etapaAtual = ETAPAS_PUBLICACAO.find((e) => e.value === item.etapa);
  const precoAcao = item.estoque?.preco_acao ? Number(item.estoque.preco_acao) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {[av.marca, av.modelo].filter(Boolean).join(' ').toUpperCase()}
            <span className="text-xs font-normal text-muted-foreground">{String(av.placa || '').replace(/-/g, '').toUpperCase()}</span>
            {etapaAtual && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: etapaAtual.hex }}>{etapaAtual.label}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {foraDoSite && (
          <p className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
            Moto com {item.estoque?.status === 'sinal' ? 'sinal' : 'status "' + item.estoque?.status + '"'}: mesmo publicada, não aparece no site enquanto não voltar a ficar disponível.
          </p>
        )}

        {/* Fotos */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fotos <span className="font-normal text-muted-foreground">({fotos.length}/{FOTOS_MAX})</span></h3>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={enviando || fotos.length >= FOTOS_MAX} onClick={() => inputFotos.current?.click()}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Adicionar fotos
            </Button>
            <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => enviarFotos(e.target.files)} />
          </div>
          {fotos.length === 0 ? (
            <button type="button" onClick={() => inputFotos.current?.click()}
              className="w-full border border-dashed border-border rounded-lg py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Upload className="h-5 w-5" /> Envie as fotos da moto (até {FOTOS_MAX}, no máximo 3 MB cada)
            </button>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] font-semibold rounded bg-primary text-primary-foreground px-1.5 py-0.5">CAPA</span>
                  )}
                  <span className="absolute top-1 right-1 text-[10px] rounded bg-black/55 text-white px-1">{i + 1}</span>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 p-1">
                    <GripVertical className="h-3.5 w-3.5 text-white/80" />
                    {i > 0 && (
                      <button type="button" title="Usar como capa" onClick={() => moverPara(i, 0)} className="text-white"><Star className="h-3.5 w-3.5" /></button>
                    )}
                    <button type="button" title="Remover" onClick={() => remover(url)} className="text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Arraste para ordenar a galeria do site. A primeira é a capa (listas e busca); a estrela leva a foto para a capa.</p>
        </section>

        {/* Descrição */}
        <section className="space-y-1">
          <Label className="text-sm font-semibold">Descrição do anúncio</Label>
          <Textarea rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Texto que aparece na página da moto no site" />
        </section>

        {/* Dados da moto (BPM) */}
        <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">Dados da moto</h3>
            <span className="text-[11px] text-muted-foreground">Vêm do BPM (avaliação e estoque). Para mudar, altere lá.</span>
          </div>
          {!dados ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Info rotulo="Marca" valor={av.marca} />
                <Info rotulo="Modelo no site" valor={dados.modelo} />
                <Info rotulo="Ano" valor={dados.ano_fab && dados.ano_modelo ? `${dados.ano_fab}/${dados.ano_modelo}` : null} />
                <Info rotulo="Km" valor={dados.km != null ? dados.km.toLocaleString('pt-BR') : null} />
                <Info rotulo="Cilindrada" valor={dados.cc ? `${dados.cc.toLocaleString('pt-BR')} cc` : null} />
                <Info rotulo="Categoria" valor={dados.estilo} />
                <Info rotulo="Cor" valor={dados.cor} />
                <Info rotulo="Loja no site" valor={dados.loja} />
                <Info rotulo="Manual" valor={simNao(av.tem_manual)} />
                <Info rotulo="Chave reserva" valor={simNao(av.tem_chave_reserva)} />
                <Info rotulo="Revisão em dia" valor={simNao(av.manutencao_vencida == null ? null : !av.manutencao_vencida)} />
                <Info rotulo="FIPE" valor={moeda(dados.fipe)} />
                <Info rotulo="Preço de tabela" valor={moeda(av.quanto_vende)} />
                <Info rotulo="Preço ação" valor={moeda(precoAcao)} />
                <Info rotulo="Preço no site" destaque
                  valor={dados.preco ? (dados.preco_de ? <><s className="text-muted-foreground font-normal mr-1">{moeda(dados.preco_de)}</s>{moeda(dados.preco)}</> : moeda(dados.preco)) : null} />
              </div>
            </>
          )}
        </section>

        {item.etapa !== 'em_aberto' && pendencias.length > 0 && (
          <p className="text-xs rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
            {item.etapa === 'publicada' ? 'Fora do site até resolver' : 'Para publicar falta'}: <b>{pendencias.join(', ')}</b>.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          {item.etapa === 'publicada' && s.slug && (
            <a href={`${SITE_URL}/seminovas/${s.slug}`} target="_blank" rel="noreferrer" className="mr-auto text-sm text-primary inline-flex items-center gap-1">
              <ExternalLink className="h-4 w-4" /> Ver no site
            </a>
          )}
          {item.etapa === 'fotos_tiradas' && (
            <Button variant="ghost" disabled={salvando} onClick={() => gravar('em_aberto', 'Voltou para Em Aberto')}>Voltar para Em Aberto</Button>
          )}
          {item.etapa === 'publicada' && (
            <Button variant="outline" disabled={salvando} onClick={() => gravar('fotos_tiradas', 'Anúncio retirado do site')}>Despublicar</Button>
          )}
          <Button variant="outline" disabled={salvando || enviando} onClick={() => gravar(item.etapa, item.etapa === 'publicada' ? 'Anúncio atualizado no site' : 'Salvo')}>
            Salvar
          </Button>
          {item.etapa === 'em_aberto' && (
            <Button className="gap-1.5" disabled={salvando || enviando || fotos.length === 0} title={fotos.length === 0 ? 'Envie as fotos antes' : undefined}
              onClick={() => gravar('fotos_tiradas', 'Movida para Fotos Tiradas')}>
              <Camera className="h-4 w-4" /> Fotos tiradas
            </Button>
          )}
          {item.etapa === 'fotos_tiradas' && (
            <Button className="gap-1.5" disabled={salvando || enviando || !dados || pendencias.length > 0} title={pendencias.length ? `Falta: ${pendencias.join(', ')}` : undefined}
              onClick={() => gravar('publicada', 'Publicada no site')}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Publicar no site
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PublicacaoDialog;
