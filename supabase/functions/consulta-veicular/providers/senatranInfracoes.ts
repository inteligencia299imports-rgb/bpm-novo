import type { ConsultaEntrada, SenatranInfracoesRaw } from '../types.ts';

/**
 * SenatranInfractionProvider -- STUB (mesmo motivo de senatranVeiculo.ts).
 * So e chamado quando o veiculo (via SenatranVehicleProvider) indicar
 * "Indicador Multa Renainf" positivo -- ver service.ts.
 */
export async function consultarInfracoesSenatran(
  _entrada: ConsultaEntrada,
  _renavam: string | null,
): Promise<SenatranInfracoesRaw> {
  return {
    consultado: false,
    disponivel: false,
    infracoes: [],
    erro: { motivo: 'NAO_CONFIGURADO', codigo_http: 0, mensagem: 'Consulta Online SENATRAN não habilitada para este CNPJ' },
  };
}
