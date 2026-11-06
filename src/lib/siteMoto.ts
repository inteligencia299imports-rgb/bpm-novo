// Anúncio da moto no site 299imports.com.br (tabela site_motos, DB 299).
// Marca, modelo, km, anos, cc, cor, categoria, loja e preços vêm da moto no BPM (view site_motos_dados);
// aqui só ficam as etapas, as marcas que o site conhece (site-299: data/marcas.ts) e o endereço da página.

export type EtapaPublicacao = 'em_aberto' | 'fotos_tiradas' | 'publicada' | 'desativada';

export const ETAPAS_PUBLICACAO: { value: EtapaPublicacao; label: string; hex: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto', hex: '#0ea5e9' },
  { value: 'fotos_tiradas', label: 'Fotos Tiradas', hex: '#f59e0b' },
  { value: 'publicada', label: 'Publicadas', hex: '#16a34a' },
  // Tirada do site manualmente (botão Desativar). Vendida/retirada nem aparecem na aba.
  { value: 'desativada', label: 'Desativadas', hex: '#dc2626' },
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

/** Limites das fotos do anúncio (o bucket site-motos também barra acima de 3 MB). */
/** Endereço público do site (página da moto: ${SITE_URL}/seminovas/<slug>). */
export const SITE_URL = 'https://299imports.com.br';

export const FOTOS_MIN = 5;
export const FOTOS_MAX = 20;
export const FOTO_MAX_BYTES = 3 * 1024 * 1024;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Endereço da página no site: marca-modelo-ano (mesmo padrão do painel do site). */
export const slugSite = (...partes: (string | number | null | undefined)[]) =>
  semAcento(partes.filter((p) => p !== null && p !== undefined && String(p).trim() !== '').join(' '))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

