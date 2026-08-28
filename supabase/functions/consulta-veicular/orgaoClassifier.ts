import type { OrgaoAutuador } from './types.ts';

// Classificacao por codigo oficial do orgao autuador (SENATRAN/RENAINF).
// TODO: confirmar os codigos exatos contra o Swagger oficial quando o
// acesso ao Consulta Online SENATRAN for liberado -- estes sao os codigos
// de orgao mais comumente documentados publicamente, mas nao foram
// verificados contra o retorno real da API.
const CODIGO_ORGAO_MAP: Record<string, OrgaoAutuador> = {
  // PRF
  '2': 'PRF',
  // DNIT
  '4': 'DNIT',
};

// Fallback textual, usado apenas quando nao ha codigo oficial no retorno.
const DESCRICAO_ORGAO_MAP: Array<{ match: RegExp; orgao: OrgaoAutuador }> = [
  { match: /policia rodoviaria federal/i, orgao: 'PRF' },
  { match: /departamento nacional de infraestrutura de transportes/i, orgao: 'DNIT' },
  { match: /departamento de estradas de rodagem do distrito federal/i, orgao: 'DER_DF' },
  { match: /departamento de transito do distrito federal/i, orgao: 'DETRAN' },
  { match: /detran/i, orgao: 'DETRAN' },
  { match: /\bder[\s-]?df\b/i, orgao: 'DER_DF' },
  { match: /\bdnit\b/i, orgao: 'DNIT' },
  { match: /\bprf\b/i, orgao: 'PRF' },
];

/**
 * Classifica o orgao autuador de uma infracao RENAINF em
 * DETRAN | DER_DF | DNIT | PRF | OUTROS.
 *
 * Prioriza o codigo oficial do orgao (quando presente no retorno da API);
 * usa a descricao apenas como fallback textual.
 */
export function classificarOrgao(codigo?: string | null, descricao?: string | null): OrgaoAutuador {
  if (codigo && CODIGO_ORGAO_MAP[codigo]) {
    return CODIGO_ORGAO_MAP[codigo];
  }
  if (descricao) {
    for (const { match, orgao } of DESCRICAO_ORGAO_MAP) {
      if (match.test(descricao)) return orgao;
    }
  }
  return 'OUTROS';
}
