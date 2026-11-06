import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Camera, ExternalLink, ImagePlus, Loader2, Star, Trash2, Upload } from 'lucide-react';
import {
  CAMBIOS_SITE, CARACTERISTICAS_SITE, CORES_SITE, ESTILOS_SITE, ETAPAS_PUBLICACAO, LOJAS_SITE, MARCAS_SITE, SELOS_SITE,
  corSite, estiloSite, lojaSite, marcaSite, pendenciasPublicacao, slugSite, type EtapaPublicacao,
} from '@/lib/siteMoto';

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

const SITE_URL = 'https://299imports.com.br';

const moedaTexto = (v: number | null | undefined) =>
  v ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const moedaDigitada = (s: string) => {
  const d = s.replace(/\D/g, '');
  return d ? (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
};
const moedaNumero = (s: string): number | null => {
  const d = s.replace(/\D/g, '');
  return d ? parseInt(d, 10) / 100 : null;
};
const inteiro = (v: unknown): number | null => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? parseInt(d, 10) : null;
};
const decimal = (v: string): number | null => {
  const t = v.replace(/\./g, '').replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const linhas = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

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

const alternar = (lista: string[], set: (v: string[]) => void, v: string) =>
  set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

const Campo = ({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) => (
  <div className={cn('space-y-1', className)}>
    <Label className="text-xs text-muted-foreground">{rotulo}</Label>
    {children}
  </div>
);
const Escolha = ({ valor, set, opcoes, placeholder }: { valor: string; set: (v: string) => void; opcoes: { value: string; label: string }[]; placeholder: string }) => (
  <Select value={valor || undefined} onValueChange={set}>
    <SelectTrigger className="h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>{opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
  </Select>
);
const op = (l: string[]) => l.map((v) => ({ value: v, label: v }));
const Chips = ({ lista, set, opcoes }: { lista: string[]; set: (v: string[]) => void; opcoes: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {opcoes.map((o) => (
      <button key={o} type="button" onClick={() => alternar(lista, set, o)}
        className={cn('text-xs rounded-full border px-3 py-1', lista.includes(o) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border')}>
        {o}
      </button>
    ))}
  </div>
);


const PublicacaoDialog: React.FC<Props> = ({ open, item, onOpenChange, onSaved }) => {
  const av = item.avaliacao;
  const s = item.site || {};
  const marcaInicial = s.marca ?? marcaSite(av.marca);
  const modeloInicial = s.modelo ?? (av.modelo || '');
  const anoModeloInicial = s.ano_modelo ?? inteiro(av.ano_modelo);

  const [marca, setMarca] = useState<string>(marcaInicial || '');
  const [modelo, setModelo] = useState<string>(modeloInicial);
  const [anoFab, setAnoFab] = useState<string>(String(s.ano_fab ?? inteiro(av.ano_fabricacao) ?? ''));
  const [anoModelo, setAnoModelo] = useState<string>(String(anoModeloInicial ?? ''));
  const [km, setKm] = useState<string>(String(s.km ?? inteiro(av.km) ?? ''));
  const [cc, setCc] = useState<string>(String(s.cc ?? inteiro(av.cilindrada) ?? ''));
  const [cor, setCor] = useState<string>(s.cor ?? corSite(av.cor));
  const [estilo, setEstilo] = useState<string>(s.estilo ?? estiloSite(av.categoria));
  const [loja, setLoja] = useState<string>(s.loja ?? lojaSite(item.lojaBpm));
  const [preco, setPreco] = useState<string>(moedaTexto(s.preco ?? item.estoque?.preco_acao));
  const [precoDe, setPrecoDe] = useState<string>(moedaTexto(s.preco_de));
  const [fipe, setFipe] = useState<string>(moedaTexto(s.fipe ?? av.valor_fipe));
  const [mercadoMin, setMercadoMin] = useState<string>(moedaTexto(s.mercado_min ?? av.menor_valor));
  const [mercadoMax, setMercadoMax] = useState<string>(moedaTexto(s.mercado_max ?? av.maior_valor));
  const [slug, setSlug] = useState<string>(s.slug ?? '');
  const [slugTocado, setSlugTocado] = useState<boolean>(!!s.slug);
  const [selos, setSelos] = useState<string[]>(s.selos ?? []);
  const [caracteristicas, setCaracteristicas] = useState<string[]>(s.caracteristicas ?? []);
  const [destaque, setDestaque] = useState<boolean>(!!s.destaque);
  const [imagem, setImagem] = useState<string>(s.imagem ?? '');
  const [fotos, setFotos] = useState<string[]>(s.fotos ?? []);
  const [potencia, setPotencia] = useState<string>(s.potencia_cv != null ? String(s.potencia_cv).replace('.', ',') : '');
  const [torque, setTorque] = useState<string>(s.torque_kgfm != null ? String(s.torque_kgfm).replace('.', ',') : '');
  const [peso, setPeso] = useState<string>(s.peso_kg != null ? String(s.peso_kg).replace('.', ',') : '');
  const [cambio, setCambio] = useState<string>(s.cambio ?? 'Manual');
  const [descricao, setDescricao] = useState<string>(s.descricao ?? '');
  const [diferenciais, setDiferenciais] = useState<string>((s.diferenciais ?? []).join('\n'));
  const [acessorios, setAcessorios] = useState<string>((s.acessorios ?? []).join('\n'));
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);

  const marcaLabel = MARCAS_SITE.find((m) => m.value === marca)?.label || '';
  // Endereço sugerido acompanha marca/modelo/ano até alguém editar à mão.
  const slugEfetivo = slugTocado ? slug : slugSite(marcaLabel, modelo, inteiro(anoModelo));

  const linha = useMemo(() => ({
    avaliacao_id: av.id,
    marca: marca || null,
    modelo: modelo.trim() || null,
    ano_fab: inteiro(anoFab),
    ano_modelo: inteiro(anoModelo),
    km: inteiro(km),
    cc: inteiro(cc),
    cor: cor || null,
    estilo: estilo || null,
    loja: loja || null,
    preco: moedaNumero(preco),
    preco_de: moedaNumero(precoDe),
    fipe: moedaNumero(fipe),
    mercado_min: moedaNumero(mercadoMin),
    mercado_max: moedaNumero(mercadoMax),
    slug: slugEfetivo || null,
    selos,
    caracteristicas,
    destaque,
    imagem: imagem || fotos[0] || '',
    fotos,
    potencia_cv: decimal(potencia),
    torque_kgfm: decimal(torque),
    peso_kg: decimal(peso),
    cambio: cambio || null,
    descricao: descricao.trim() || null,
    diferenciais: linhas(diferenciais),
    acessorios: linhas(acessorios),
  }), [av.id, marca, modelo, anoFab, anoModelo, km, cc, cor, estilo, loja, preco, precoDe, fipe, mercadoMin, mercadoMax,
    slugEfetivo, selos, caracteristicas, destaque, imagem, fotos, potencia, torque, peso, cambio, descricao, diferenciais, acessorios]);

  const pendencias = pendenciasPublicacao(linha);
  const foraDoSite = item.estoque && !['disponivel', 'servico'].includes(item.estoque.status);

  const gravar = async (etapa: EtapaPublicacao, msg: string) => {
    setSalvando(true);
    const { error } = await (supabase as any).from('site_motos').upsert({ ...linha, etapa }, { onConflict: 'avaliacao_id' });
    setSalvando(false);
    if (error) {
      toast.error(error.code === '23505' && /slug/.test(error.message)
        ? 'Já existe outro anúncio com este endereço de página. Ajuste o endereço.'
        : `Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success(msg);
    onSaved();
  };

  const enviarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    const novas: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const blob = await paraWebp(f);
        const caminho = `${av.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const { error } = await supabase.storage.from('site-motos').upload(caminho, blob, { contentType: 'image/webp', upsert: false });
        if (error) throw error;
        novas.push(supabase.storage.from('site-motos').getPublicUrl(caminho).data.publicUrl);
      }
    } catch (e: any) {
      toast.error(`Erro ao enviar foto: ${e?.message || e}`);
    }
    if (novas.length) {
      setFotos((f) => [...f, ...novas]);
      if (!imagem) setImagem(novas[0]);
    }
    setEnviando(false);
    if (inputFotos.current) inputFotos.current.value = '';
  };

  const mover = (i: number, d: number) => setFotos((f) => {
    const j = i + d;
    if (j < 0 || j >= f.length) return f;
    const n = [...f];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const remover = (url: string) => {
    setFotos((f) => f.filter((x) => x !== url));
    if (imagem === url) setImagem('');
  };
  const etapaAtual = ETAPAS_PUBLICACAO.find((e) => e.value === item.etapa);

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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Fotos</h3>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={enviando} onClick={() => inputFotos.current?.click()}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Adicionar fotos
            </Button>
            <input ref={inputFotos} type="file" accept="image/*" multiple className="hidden" onChange={(e) => enviarFotos(e.target.files)} />
          </div>
          {fotos.length === 0 ? (
            <button type="button" onClick={() => inputFotos.current?.click()}
              className="w-full border border-dashed border-border rounded-lg py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Upload className="h-5 w-5" /> Envie as fotos da moto (a ordem aqui é a ordem da galeria no site)
            </button>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {fotos.map((url, i) => (
                <div key={url} className={cn('relative rounded-md overflow-hidden border', (imagem || fotos[0]) === url ? 'border-primary ring-2 ring-primary' : 'border-border')}>
                  <img src={url} alt="" className="w-full aspect-[3/4] object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 p-1">
                    <button type="button" title="Mover para a esquerda" onClick={() => mover(i, -1)} className="text-white"><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Usar como foto do card" onClick={() => setImagem(url)} className="text-white"><Star className={cn('h-3.5 w-3.5', (imagem || fotos[0]) === url && 'fill-yellow-400 text-yellow-400')} /></button>
                    <button type="button" title="Remover" onClick={() => remover(url)} className="text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Mover para a direita" onClick={() => mover(i, 1)} className="text-white"><ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">A estrela marca a foto do card (listas e busca do site); sem marcação, vale a primeira.</p>
        </section>

        {/* Identificação */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Identificação</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo rotulo="Marca"><Escolha valor={marca} set={setMarca} opcoes={MARCAS_SITE} placeholder="Marca" /></Campo>
            <Campo rotulo="Modelo e versão" className="col-span-1 sm:col-span-3"><Input className="h-9" value={modelo} onChange={(e) => setModelo(e.target.value)} /></Campo>
            <Campo rotulo="Ano de fabricação"><Input className="h-9" inputMode="numeric" value={anoFab} onChange={(e) => setAnoFab(e.target.value)} /></Campo>
            <Campo rotulo="Ano do modelo"><Input className="h-9" inputMode="numeric" value={anoModelo} onChange={(e) => setAnoModelo(e.target.value)} /></Campo>
            <Campo rotulo="Quilometragem"><Input className="h-9" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
            <Campo rotulo="Cilindrada (cc)"><Input className="h-9" inputMode="numeric" value={cc} onChange={(e) => setCc(e.target.value)} /></Campo>
            <Campo rotulo="Cor"><Escolha valor={cor} set={setCor} opcoes={op(CORES_SITE)} placeholder="Cor" /></Campo>
            <Campo rotulo="Estilo"><Escolha valor={estilo} set={setEstilo} opcoes={op(ESTILOS_SITE)} placeholder="Estilo" /></Campo>
            <Campo rotulo="Loja" className="col-span-2"><Escolha valor={loja} set={setLoja} opcoes={LOJAS_SITE} placeholder="Loja" /></Campo>
            <Campo rotulo="Endereço da página" className="col-span-2 sm:col-span-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="shrink-0">299imports.com.br/seminovas/</span>
                <Input className="h-9" value={slugEfetivo} onChange={(e) => { setSlugTocado(true); setSlug(slugSite(e.target.value)); }} />
              </div>
            </Campo>
          </div>
        </section>

        {/* Preço */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Preço</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Campo rotulo="Preço"><Input className="h-9" inputMode="numeric" value={preco} onChange={(e) => setPreco(moedaDigitada(e.target.value))} /></Campo>
            <Campo rotulo="Preço anterior (de)"><Input className="h-9" inputMode="numeric" value={precoDe} onChange={(e) => setPrecoDe(moedaDigitada(e.target.value))} /></Campo>
            <Campo rotulo="Tabela FIPE"><Input className="h-9" inputMode="numeric" value={fipe} onChange={(e) => setFipe(moedaDigitada(e.target.value))} /></Campo>
            <Campo rotulo="Mercado: menor"><Input className="h-9" inputMode="numeric" value={mercadoMin} onChange={(e) => setMercadoMin(moedaDigitada(e.target.value))} /></Campo>
            <Campo rotulo="Mercado: maior"><Input className="h-9" inputMode="numeric" value={mercadoMax} onChange={(e) => setMercadoMax(moedaDigitada(e.target.value))} /></Campo>
          </div>
        </section>

        {/* Selos e destaques */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Selos e destaques</h3>
          <Chips lista={selos} set={setSelos} opcoes={SELOS_SITE} />
          <Chips lista={caracteristicas} set={setCaracteristicas} opcoes={CARACTERISTICAS_SITE} />
          <label className="flex items-center gap-2 text-sm"><Switch checked={destaque} onCheckedChange={setDestaque} /> Destaque no topo das seminovas</label>
        </section>

        {/* Ficha técnica */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Ficha técnica e descrição</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo rotulo="Potência (cv)"><Input className="h-9" inputMode="decimal" value={potencia} onChange={(e) => setPotencia(e.target.value)} /></Campo>
            <Campo rotulo="Torque (kgfm)"><Input className="h-9" inputMode="decimal" value={torque} onChange={(e) => setTorque(e.target.value)} /></Campo>
            <Campo rotulo="Peso (kg)"><Input className="h-9" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Campo>
            <Campo rotulo="Câmbio"><Escolha valor={cambio} set={setCambio} opcoes={op(CAMBIOS_SITE)} placeholder="Câmbio" /></Campo>
          </div>
          <Campo rotulo="Descrição"><Textarea rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Diferenciais (um por linha)"><Textarea rows={4} value={diferenciais} onChange={(e) => setDiferenciais(e.target.value)} /></Campo>
            <Campo rotulo="Acessórios (um por linha)"><Textarea rows={4} value={acessorios} onChange={(e) => setAcessorios(e.target.value)} /></Campo>
          </div>
        </section>

        {item.etapa === 'fotos_tiradas' && pendencias.length > 0 && (
          <p className="text-xs text-muted-foreground">Para publicar falta: <b>{pendencias.join(', ')}</b>.</p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          {item.etapa === 'publicada' && linha.slug && (
            <a href={`${SITE_URL}/seminovas/${linha.slug}`} target="_blank" rel="noreferrer" className="mr-auto text-sm text-primary inline-flex items-center gap-1">
              <ExternalLink className="h-4 w-4" /> Ver no site
            </a>
          )}
          {item.etapa === 'fotos_tiradas' && (
            <Button variant="ghost" disabled={salvando} onClick={() => gravar('em_aberto', 'Voltou para Em Aberto')}>Voltar para Em Aberto</Button>
          )}
          {item.etapa === 'publicada' && (
            <Button variant="outline" disabled={salvando} onClick={() => gravar('fotos_tiradas', 'Anúncio retirado do site')}>Despublicar</Button>
          )}
          <Button variant="outline" disabled={salvando} onClick={() => gravar(item.etapa, item.etapa === 'publicada' ? 'Anúncio atualizado no site' : 'Salvo')}>
            Salvar
          </Button>
          {item.etapa === 'em_aberto' && (
            <Button className="gap-1.5" disabled={salvando || fotos.length === 0} title={fotos.length === 0 ? 'Envie as fotos antes' : undefined}
              onClick={() => gravar('fotos_tiradas', 'Movida para Fotos Tiradas')}>
              <Camera className="h-4 w-4" /> Fotos tiradas
            </Button>
          )}
          {item.etapa === 'fotos_tiradas' && (
            <Button className="gap-1.5" disabled={salvando || pendencias.length > 0} title={pendencias.length ? `Falta: ${pendencias.join(', ')}` : undefined}
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
