/**
 * Helpers for tipo_aquisicao classification.
 * repasse behaves like própria for all workflow purposes.
 */

/** Returns true if the tipo behaves like 'própria' (própria, convertida, repasse) */
export const isTipoPropria = (tipo: string | null | undefined): boolean =>
  !!tipo && ['propria', 'convertida', 'repasse'].includes(tipo);

/** Returns true if the tipo is 'consignada' */
export const isTipoConsignada = (tipo: string | null | undefined): boolean =>
  tipo === 'consignada';

/** All tipo_aquisicao values that behave like própria (for DB queries) */
export const TIPOS_PROPRIA = ['propria', 'convertida', 'repasse'];

/** All tipo_aquisicao values for NPS/listing queries */
export const TODOS_TIPOS_AQUISICAO = ['propria', 'consignada', 'repasse'];

/** Label for display */
export const getTipoAquisicaoLabel = (tipo: string | null | undefined): string | null => {
  if (!tipo) return null;
  switch (tipo) {
    case 'propria': return 'Própria';
    case 'consignada': return 'Consignada';
    case 'convertida': return 'Convertida';
    case 'repasse': return 'Repasse';
    case '0km': return '0KM';
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
    default: return 'border-green-500 text-green-600'; // propria
  }
};
