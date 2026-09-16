/**
 * Helpers for tipo_aquisicao classification.
 * repasse behaves like própria for all workflow purposes.
 * 'convertida' (moto de consignação que virou compra) NÃO existe mais como
 * transição — decisão de negócio: continua tratada como 'consignada' em tudo
 * (taxa fixa, KPIs de relatório, aprovação). O valor pode aparecer em
 * registros legados; tratamos como não-própria (mesmo comportamento de
 * 'consignada') se aparecer.
 */

/** Returns true if the tipo behaves like 'própria' (própria, repasse) */
export const isTipoPropria = (tipo: string | null | undefined): boolean =>
  !!tipo && ['propria', 'repasse'].includes(tipo);

/** Returns true if the tipo is 'consignada' (inclui o legado 'convertida') */
export const isTipoConsignada = (tipo: string | null | undefined): boolean =>
  tipo === 'consignada' || tipo === 'convertida';

/** All tipo_aquisicao values that behave like própria (for DB queries) */
export const TIPOS_PROPRIA = ['propria', 'repasse'];

/** All tipo_aquisicao values for NPS/listing queries */
export const TODOS_TIPOS_AQUISICAO = ['propria', 'consignada', 'repasse'];

/**
 * Empresas que só operam venda de moto nova (ex.: Ducati/FAG): não fazem compra
 * direta nem consignação de moto seminova.
 */
export const EMPRESAS_SO_MOTO_NOVA = new Set<string>([
  '30496c3b-721f-4795-98fd-2785d3821f3b', // FAG
]);

/** Empresa pode comprar moto seminova diretamente (interesse 'vender'). */
export const empresaCompraDireta = (empresaId?: string | null): boolean =>
  !empresaId || !EMPRESAS_SO_MOTO_NOVA.has(empresaId);

/** Empresa pode receber moto em consignação. */
export const empresaConsignaMoto = (empresaId?: string | null): boolean =>
  !empresaId || !EMPRESAS_SO_MOTO_NOVA.has(empresaId);

/** Label for display */
export const getTipoAquisicaoLabel = (tipo: string | null | undefined): string | null => {
  if (!tipo) return null;
  switch (tipo) {
    case 'propria': return 'Própria';
    case 'consignada': return 'Consignada';
    case 'convertida': return 'Convertida';
    case 'repasse': return 'Repasse';
    case '0km': return '0KM';
    case 'test_ride': return 'Test-Ride';
    default: return tipo;
  }
};

/** Badge color class for tipo_aquisicao */
export const getTipoAquisicaoBadgeClass = (tipo: string | null | undefined): string => {
  if (!tipo) return '';
  switch (tipo) {
    case 'consignada': return 'border-purple-500 text-purple-600';
    case 'convertida': return 'border-blue-800 text-blue-800';
    case 'repasse': return 'border-gray-500 text-gray-600';
    case 'ducati': return 'border-red-500 text-red-600';
    case '0km': return 'border-primary text-primary';
    case 'test_ride': return 'border-primary text-primary';
    default: return 'border-green-500 text-green-600'; // propria
  }
};
