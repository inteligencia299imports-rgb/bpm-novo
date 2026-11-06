// Anúncio da moto no site 299imports.com.br (tabela site_motos, DB 299).
// As listas abaixo são cópia das do site (site-299: data/marcas.ts, data/catalogo.ts, data/motos.ts,
// data/grupo.ts LOJAS_MOTO) — o site filtra e exibe por esses valores exatos. Mudou lá, muda aqui.

export type EtapaPublicacao = 'em_aberto' | 'fotos_tiradas' | 'publicada';

export const ETAPAS_PUBLICACAO: { value: EtapaPublicacao; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#94a3b8' },
  { value: 'fotos_tiradas', label: 'Fotos Tiradas', hex: '#f59e0b' },
  { value: 'publicada', label: 'Publicadas', hex: '#16a34a' },
];

export const MARCAS_SITE = [
  { value: 'ducati', label: 'Ducati' },
  { value: 'bmw', label: 'BMW' },
  { value: 'kawasaki', label: 'Kawasaki' },
  { value: 'yamaha', label: 'Yamaha' },
  { value: 'honda', label: 'Honda' },
  { value: 'suzuki', label: 'Suzuki' },
  { value: 'triumph', label: 'Triumph' },
  { value: 'harley', label: 'Harley-Davidson' },
  { value: 'ktm', label: 'KTM' },
  { value: 'royal', label: 'Royal Enfield' },
];

export const CORES_SITE = ['Preto', 'Branco', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Laranja', 'Bege', 'Marrom', 'Fantasia'];
export const ESTILOS_SITE = ['Esportiva', 'Naked', 'Big Trail', 'Sport Touring', 'Custom', 'Café Racer', 'Scooter'];
export const SELOS_SITE = ['OFERTA', 'ABAIXO DA FIPE', 'REVISADA 299', 'ACEITA TROCA'];
export const CARACTERISTICAS_SITE = ['Único dono', 'Todas as revisões na concessionária', 'Garantia de fábrica', 'Ação especial'];
export const CAMBIOS_SITE = ['Manual', 'Automática'];

/** Lojas do site (valor gravado = o que o site mostra como "onde está"). */
export const LOJAS_SITE = [
  { value: 'Cidade do Automóvel', label: '299 Imports Cidade do Automóvel' },
  { value: 'Sudoeste', label: '299 Sudoeste' },
  { value: 'SIA Trecho 3', label: '299 Aventura / Ducati Brasília (SIA)' },
  { value: 'Ducati Florianópolis', label: 'Ducati Florianópolis' },
  { value: 'Ducati Porto Alegre', label: 'Ducati Porto Alegre' },
];

const LOJA_BPM_PARA_SITE: Record<string, string> = {
  '299i': 'Cidade do Automóvel',
  '299s': 'Sudoeste',
  Aventura: 'SIA Trecho 3',
  'Ducati BSB': 'SIA Trecho 3',
  '299f': 'Ducati Florianópolis',
  'Ducati FLN': 'Ducati Florianópolis',
  '299p': 'Ducati Porto Alegre',
  'Ducati POA': 'Ducati Porto Alegre',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const marcaSite = (nome?: string | null): string => {
  const n = semAcento(String(nome || '')).toUpperCase();
  if (!n) return '';
  if (n.startsWith('HARLEY')) return 'harley';
  if (n.startsWith('ROYAL')) return 'royal';
  return MARCAS_SITE.find((m) => semAcento(m.label).toUpperCase() === n)?.value ?? '';
};

export const corSite = (cor?: string | null): string => {
  const c = semAcento(String(cor || '')).toUpperCase().trim();
  if (!c) return '';
  const raiz = c.replace(/[AO]$/, '');
  return CORES_SITE.find((x) => semAcento(x).toUpperCase().replace(/[AO]$/, '') === raiz) ?? '';
};

export const lojaSite = (lojaBpm?: string | null) => LOJA_BPM_PARA_SITE[String(lojaBpm || '')] ?? '';

/** Endereço da página no site: marca-modelo-ano (mesmo padrão do painel do site). */
export const slugSite = (...partes: (string | number | null | undefined)[]) =>
  semAcento(partes.filter((p) => p !== null && p !== undefined && String(p).trim() !== '').join(' '))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');


export const numeroOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** O que falta para o anúncio poder ir ao ar (mesmos obrigatórios do cadastro do site). */
export const pendenciasPublicacao = (s: Record<string, any>): string[] => {
  const f: string[] = [];
  if (!s.marca) f.push('Marca');
  if (!s.modelo) f.push('Modelo');
  if (!s.ano_fab || !s.ano_modelo) f.push('Anos');
  if (s.km === null || s.km === undefined || s.km === '') f.push('Quilometragem');
  if (!s.cc) f.push('Cilindrada');
  if (!s.cor) f.push('Cor');
  if (!s.estilo) f.push('Estilo');
  if (!s.loja) f.push('Loja');
  if (!s.preco) f.push('Preço');
  if (!s.slug) f.push('Endereço da página');
  if (!s.imagem) f.push('Foto do card');
  return f;
};

/** Categoria da avaliação (CATEGORIAS_MOTO) -> estilo do site; sem equivalente direto fica vazio. */
export const estiloSite = (categoria?: string | null): string => {
  const c = semAcento(String(categoria || '')).toUpperCase().replace(/[^A-Z]/g, '');
  const mapa: Record<string, string> = {
    BIGTRAIL: 'Big Trail', CAFERACER: 'Café Racer', CUSTOM: 'Custom', ESPORTIVA: 'Esportiva',
    NAKED: 'Naked', SCOOTER: 'Scooter', SPORTTOURING: 'Sport Touring',
  };
  return mapa[c] ?? '';
};
