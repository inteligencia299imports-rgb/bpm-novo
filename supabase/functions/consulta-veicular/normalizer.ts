import {
  finalizarStatusRestricoes,
  resolverAutocorp,
  resolverCpf,
  resolverDetran,
  resolverGravame,
  resolverIpva,
  resolverLicenciamento,
  resolverOrgaosInfracao,
  resolverRestricoes,
} from './indicatorResolver.ts';
import type {
  ConsultaEntrada,
  ConsultaVeiculoResultado,
  RenaveAptidaoRaw,
  SenatranInfracoesRaw,
  SenatranVeiculoRaw,
} from './types.ts';

function fonteStatus(consultado: boolean, erro?: { motivo: 'NAO_CONFIGURADO' | 'ERRO' }): 'OK' | 'ERRO' | 'NAO_CONFIGURADO' {
  if (consultado) return 'OK';
  return erro?.motivo === 'NAO_CONFIGURADO' ? 'NAO_CONFIGURADO' : 'ERRO';
}

export function normalizarResultado(params: {
  consultaId: string;
  entrada: ConsultaEntrada;
  renave: RenaveAptidaoRaw;
  senatranVeiculo: SenatranVeiculoRaw;
  senatranInfracoes: SenatranInfracoesRaw;
}): ConsultaVeiculoResultado {
  const { consultaId, entrada, renave, senatranVeiculo, senatranInfracoes } = params;

  const { der_df, dnit, prf } = resolverOrgaosInfracao(senatranInfracoes);
  const restricoes = finalizarStatusRestricoes(resolverRestricoes(senatranVeiculo, renave));

  return {
    consulta_id: consultaId,
    consultado_em: new Date().toISOString(),
    veiculo: {
      placa: entrada.placa,
      uf: senatranVeiculo.uf_jurisdicao ?? entrada.uf,
      renavam: senatranVeiculo.renavam ?? renave.veiculo?.renavam ?? entrada.renavam ?? null,
      chassi: senatranVeiculo.chassi ?? renave.veiculo?.chassi ?? null,
      marca_modelo: senatranVeiculo.marca_modelo ?? renave.veiculo?.marca_modelo ?? null,
      ano_fabricacao: senatranVeiculo.ano_fabricacao ?? renave.veiculo?.ano_fabricacao ?? null,
      ano_modelo: senatranVeiculo.ano_modelo ?? renave.veiculo?.ano_modelo ?? null,
    },
    renave: {
      consultado: renave.consultado,
      apto_estoque: renave.apto_estoque,
      motivos_nao_aptidao: renave.motivos_nao_aptidao,
      debitos_detran: renave.debitos.map((d) => ({
        tipo: (d.tipo === 'IPVA' || d.tipo === 'LICENCIAMENTO' || d.tipo === 'MULTA' ? d.tipo : 'OUTRO') as
          | 'IPVA'
          | 'LICENCIAMENTO'
          | 'MULTA'
          | 'OUTRO',
        valor: d.valor,
        descricao: d.descricao,
      })),
      falha_comunicacao_detran: renave.falha_comunicacao_detran,
      erro: renave.erro?.mensagem ?? null,
    },
    indicadores: {
      ipva: resolverIpva(renave),
      licenciamento: resolverLicenciamento(senatranVeiculo),
      detran: resolverDetran(renave),
      der_df,
      dnit,
      prf,
      autocorp: resolverAutocorp(),
      gravame: resolverGravame(senatranVeiculo, renave),
      restricoes,
      cpf: resolverCpf(),
    },
    infracoes: senatranInfracoes.infracoes,
    fontes: {
      consulta_online_senatran_veiculo: fonteStatus(senatranVeiculo.consultado, senatranVeiculo.erro),
      consulta_online_senatran_infracoes: fonteStatus(senatranInfracoes.consultado, senatranInfracoes.erro),
      renave_aptidao: fonteStatus(renave.consultado, renave.erro),
    },
  };
}
