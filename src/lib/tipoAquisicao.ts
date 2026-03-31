/**
 * Helpers for tipo_aquisicao classification.
 * test-ride and repasse behave like própria for all workflow purposes.
 */

/** Returns true if the tipo behaves like 'própria' (própria, convertida, test-ride, repasse) */
export const isTipoPropria = (tipo: string | null | undefined): boolean =>
  !!tipo && ['propria', 'convertida', 'test-ride', 'repasse'].includes(tipo);

/** Returns true if the tipo is 'consignada' */
export const isTipoConsignada = (tipo: string | null | undefined): boolean =>
  tipo === 'consignada';

/** All tipo_aquisicao values that behave like própria (for DB queries) */
export const TIPOS_PROPRIA = ['propria', 'convertida', 'test-ride', 'repasse'];

/** All tipo_aquisicao values for NPS/listing queries */
export const TODOS_TIPOS_AQUISICAO = ['propria', 'consignada', 'test-ride', 'repasse'];

/** Label for display */
export const getTipoAquisicaoLabel = (tipo: string | null | undefined): string | null => {
  if (!tipo) return null;
  switch (tipo) {
    case 'propria': return 'Própria';
    case 'consignada': return 'Consignada';
    case 'convertida': return 'Convertida';
    case 'test-ride': return 'Test-Ride';
    case 'repasse': return 'Repasse';
    default: return tipo;
  }
};

/** Badge color class for tipo_aquisicao */
export const getTipoAquisicaoBadgeClass = (tipo: string | null | undefined): string => {
  if (!tipo) return '';
  switch (tipo) {
    case 'consignada': return 'border-purple-500 text-purple-600';
    case 'convertida': return 'border-blue-800 text-blue-800';
    case 'test-ride': return 'border-orange-500 text-orange-600';
    case 'repasse': return 'border-gray-500 text-gray-600';
    default: return 'border-green-500 text-green-600'; // propria
  }
};
