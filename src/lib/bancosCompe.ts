/** Bancos brasileiros por código COMPE (número tradicional do banco). */
export interface BancoCompe {
  codigo: string; // 3 dígitos
  nome: string;
}

export const BANCOS_COMPE: BancoCompe[] = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '003', nome: 'Banco da Amazônia' },
  { codigo: '004', nome: 'Banco do Nordeste' },
  { codigo: '021', nome: 'Banestes' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '037', nome: 'Banpará' },
  { codigo: '041', nome: 'Banrisul' },
  { codigo: '047', nome: 'Banco do Estado de Sergipe (Banese)' },
  { codigo: '070', nome: 'BRB - Banco de Brasília' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '079', nome: 'PicPay' },
  { codigo: '084', nome: 'Uniprime' },
  { codigo: '104', nome: 'Caixa Econômica Federal' },
  { codigo: '136', nome: 'Unicred' },
  { codigo: '197', nome: 'Stone' },
  { codigo: '208', nome: 'BTG Pactual' },
  { codigo: '212', nome: 'Banco Original' },
  { codigo: '218', nome: 'Banco BS2' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '246', nome: 'Banco ABC Brasil' },
  { codigo: '260', nome: 'Nubank (Nu Pagamentos)' },
  { codigo: '290', nome: 'PagBank (PagSeguro)' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'Banco C6' },
  { codigo: '341', nome: 'Itaú Unibanco' },
  { codigo: '364', nome: 'Efí (Gerencianet)' },
  { codigo: '380', nome: 'PicPay Bank' },
  { codigo: '389', nome: 'Banco Mercantil do Brasil' },
  { codigo: '422', nome: 'Banco Safra' },
  { codigo: '473', nome: 'Banco Caixa Geral - Brasil' },
  { codigo: '604', nome: 'Banco Industrial do Brasil' },
  { codigo: '623', nome: 'Banco Pan' },
  { codigo: '626', nome: 'Banco C6 Consignado (Ficsa)' },
  { codigo: '630', nome: 'Banco Smartbank' },
  { codigo: '633', nome: 'Banco Rendimento' },
  { codigo: '637', nome: 'Banco Sofisa' },
  { codigo: '652', nome: 'Itaú Unibanco Holding' },
  { codigo: '654', nome: 'Banco Digimais' },
  { codigo: '655', nome: 'Banco BV (Votorantim)' },
  { codigo: '707', nome: 'Banco Daycoval' },
  { codigo: '739', nome: 'Banco Cetelem' },
  { codigo: '743', nome: 'Banco Semear' },
  { codigo: '745', nome: 'Citibank' },
  { codigo: '746', nome: 'Banco Modal' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
];

export const rotuloBanco = (b: BancoCompe) => `${b.codigo} - ${b.nome}`;

/** Aceita "341", "341 - Itaú...", ou o nome; devolve o rótulo padrão se encontrar. */
export const normalizarBanco = (v: string | null | undefined): string => {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const codigo = raw.match(/^\d{1,3}/)?.[0]?.padStart(3, '0');
  const byCodigo = codigo && BANCOS_COMPE.find((b) => b.codigo === codigo);
  if (byCodigo) return rotuloBanco(byCodigo);
  const byNome = BANCOS_COMPE.find((b) => b.nome.toUpperCase() === raw.toUpperCase());
  if (byNome) return rotuloBanco(byNome);
  return raw;
};
