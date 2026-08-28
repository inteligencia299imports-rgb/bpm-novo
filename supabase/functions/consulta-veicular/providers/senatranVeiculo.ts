import type { ConsultaEntrada, SenatranVeiculoRaw } from '../types.ts';

/**
 * SenatranVehicleProvider -- STUB.
 *
 * O acesso do CNPJ ao Consulta Online SENATRAN (veiculo/RENAVAM) ainda nao
 * foi confirmado, e o Swagger oficial (so acessivel apos habilitacao, em
 * https://hom-pgcc.np.bsa.estaleiro.serpro.gov.br/manual/servicos_usuarios/)
 * nao foi consultado. Por isso este provider NUNCA faz uma chamada HTTP --
 * ele so declara a fonte como nao consultada.
 *
 * Quando o acesso for confirmado e o Swagger obtido, trocar a implementacao
 * por uma chamada real seguindo o mesmo padrao de providers/renave.ts,
 * mantendo esta mesma assinatura de funcao (nada mais no sistema precisa
 * mudar).
 */
export async function consultarVeiculoSenatran(_entrada: ConsultaEntrada): Promise<SenatranVeiculoRaw> {
  return {
    consultado: false,
    disponivel: false,
    erro: { motivo: 'NAO_CONFIGURADO', codigo_http: 0, mensagem: 'Consulta Online SENATRAN não habilitada para este CNPJ' },
  };
}
