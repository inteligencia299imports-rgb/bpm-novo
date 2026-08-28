import { classificarOrgao } from './orgaoClassifier.ts';
import type {
  Infracao,
  IndicadorGravame,
  IndicadorIpva,
  IndicadorLicenciamento,
  IndicadorOrgao,
  IndicadorRestricoes,
  IndicadorSimples,
  IndicadorStatus,
  RenaveAptidaoRaw,
  SenatranInfracoesRaw,
  SenatranVeiculoRaw,
} from './types.ts';

/**
 * Implementa as regras dos indicadores da tela (spec §7-§15).
 *
 * Regra de ouro (§7): erro/timeout/falta de autorizacao/campo ausente/
 * servico nao contratado NUNCA vira NADA_CONSTA. NADA_CONSTA so aparece
 * quando a fonte foi efetivamente consultada e o retorno permite concluir
 * que a pendencia nao existe.
 */

function statusFonteNaoConsultada(erro: { motivo: 'NAO_CONFIGURADO' | 'ERRO' } | undefined): IndicadorStatus {
  if (!erro) return 'ERRO_FONTE';
  return erro.motivo === 'NAO_CONFIGURADO' ? 'NAO_CONSULTADO' : 'ERRO_FONTE';
}

// §9 IPVA -- nao existe campo direto garantido no catalogo publico do
// Consulta Online SENATRAN. So usar se o RENAVE trouxer um debito
// explicitamente tipado como IPVA.
export function resolverIpva(renave: RenaveAptidaoRaw): IndicadorIpva {
  if (!renave.consultado) {
    return { status: statusFonteNaoConsultada(renave.erro), descricao: renave.erro?.mensagem };
  }
  const ipva = renave.debitos.find((d) => d.tipo === 'IPVA');
  if (ipva) {
    return { status: 'PENDENCIA', valor: ipva.valor, descricao: ipva.descricao };
  }
  return { status: 'NAO_DISPONIVEL', descricao: 'IPVA não disponibilizado por esta fonte' };
}

// §8 Licenciamento -- usa CRLV Ano Exercicio + Data de Emissao do SENATRAN.
// Nunca inferir "PAGO" so por existir CRLV do ano corrente.
export function resolverLicenciamento(senatranVeiculo: SenatranVeiculoRaw): IndicadorLicenciamento {
  if (!senatranVeiculo.consultado) {
    return { status: statusFonteNaoConsultada(senatranVeiculo.erro), descricao: senatranVeiculo.erro?.mensagem };
  }
  if (senatranVeiculo.indicador_pendencia_emissao) {
    return { status: 'PENDENCIA', descricao: 'Pendência de emissão do CRLV' };
  }
  if (senatranVeiculo.crlv_ano_exercicio) {
    return {
      status: 'REGULAR',
      exercicio: senatranVeiculo.crlv_ano_exercicio,
      data_emissao_crlv: senatranVeiculo.crlv_data_emissao ?? null,
      descricao: `CRLV exercício ${senatranVeiculo.crlv_ano_exercicio} emitido`,
    };
  }
  return { status: 'NAO_DISPONIVEL', descricao: 'CRLV não informado por esta fonte' };
}

// §12 DETRAN -- prioriza o retorno do RENAVE/Aptidao.
export function resolverDetran(renave: RenaveAptidaoRaw): IndicadorOrgao {
  if (!renave.consultado) {
    return { status: statusFonteNaoConsultada(renave.erro), descricao: renave.erro?.mensagem };
  }
  if (renave.falha_comunicacao_detran) {
    // Nunca NADA_CONSTA nesse cenario (§12).
    return { status: 'INDETERMINADO', descricao: 'Falha de comunicação com o Detran' };
  }
  const temPendencia = renave.apto_estoque === false || renave.debitos.length > 0;
  if (temPendencia) {
    const valorTotal = renave.debitos.reduce((sum, d) => sum + (d.valor ?? 0), 0);
    return { status: 'PENDENCIA', valor: valorTotal || null, quantidade: renave.debitos.length };
  }
  return { status: 'NADA_CONSTA', valor: 0, quantidade: 0 };
}

// §13 DER-DF / DNIT / PRF -- a partir das infracoes RENAINF, classificadas
// por orgao autuador.
export function resolverOrgaosInfracao(
  senatranInfracoes: SenatranInfracoesRaw,
): { der_df: IndicadorOrgao; dnit: IndicadorOrgao; prf: IndicadorOrgao; classificadas: Record<string, Infracao[]> } {
  const vazio = (): IndicadorOrgao => ({ status: statusFonteNaoConsultada(senatranInfracoes.erro), descricao: senatranInfracoes.erro?.mensagem });

  if (!senatranInfracoes.consultado) {
    return { der_df: vazio(), dnit: vazio(), prf: vazio(), classificadas: {} };
  }

  const classificadas: Record<string, Infracao[]> = { DETRAN: [], DER_DF: [], DNIT: [], PRF: [], OUTROS: [] };
  for (const inf of senatranInfracoes.infracoes) {
    const orgao = classificarOrgao(inf.orgao_autuador_codigo, inf.orgao_autuador_descricao);
    classificadas[orgao].push(inf);
  }

  const resolverPorOrgao = (lista: Infracao[]): IndicadorOrgao => {
    // "Exigivel" conforme indicador_exigibilidade -- ate confirmarmos o
    // dominio exato desse campo no Swagger, qualquer infracao presente na
    // lista e tratada como exigivel (a API so deve retornar a infracao se
    // ela for relevante para o veiculo consultado).
    if (lista.length === 0) return { status: 'NADA_CONSTA', quantidade: 0, valor: 0 };
    const valorTotal = lista.reduce((sum, i) => sum + (i.valor_integral_infracao ?? 0), 0);
    return { status: 'PENDENCIA', quantidade: lista.length, valor: valorTotal };
  };

  return {
    der_df: resolverPorOrgao(classificadas.DER_DF),
    dnit: resolverPorOrgao(classificadas.DNIT),
    prf: resolverPorOrgao(classificadas.PRF),
    classificadas,
  };
}

// §14 AUTOCORP -- nao faz parte das fontes oficiais desta integracao.
export function resolverAutocorp(): IndicadorSimples {
  return { status: 'NAO_CONSULTADO', descricao: 'Fonte externa não integrada' };
}

// §10 Gravame -- restricoes do RENAVAM que representam alienacao
// fiduciaria/arrendamento etc. Catalogo de codigos ainda pendente de
// confirmacao contra o Swagger oficial (TODO abaixo).
const CODIGOS_GRAVAME: Record<string, string> = {
  // TODO: preencher com os codigos oficiais de restricao do RENAVAM
  // (alienacao fiduciaria, arrendamento, ...) assim que confirmados.
};

export function resolverGravame(senatranVeiculo: SenatranVeiculoRaw): IndicadorGravame {
  if (!senatranVeiculo.consultado) {
    return { status: statusFonteNaoConsultada(senatranVeiculo.erro), descricao: senatranVeiculo.erro?.mensagem };
  }
  const restricoesGravame = (senatranVeiculo.restricoes ?? []).filter((r) => CODIGOS_GRAVAME[r.codigo]);
  if (restricoesGravame.length === 0) {
    return { status: 'NADA_CONSTA' };
  }
  const primeira = restricoesGravame[0];
  return {
    status: 'PENDENCIA',
    tipo: CODIGOS_GRAVAME[primeira.codigo],
    codigo: primeira.codigo,
    descricao: primeira.descricao,
    restricoes: restricoesGravame,
  };
}

// §11 Restricoes gerais -- consolida os indicadores do SENATRAN, mantendo
// a origem de cada um.
export function resolverRestricoes(senatranVeiculo: SenatranVeiculoRaw): IndicadorRestricoes {
  if (!senatranVeiculo.consultado) {
    return {
      status: statusFonteNaoConsultada(senatranVeiculo.erro),
      renajud: false,
      rff: false,
      roubo_furto: false,
      leilao: false,
      circulacao: false,
      alarme: false,
      comunicacao_venda: false,
    };
  }
  return {
    status: 'NADA_CONSTA', // recalculado abaixo se algum indicador for true
    renajud: !!senatranVeiculo.indicador_restricao_renajud,
    rff: !!senatranVeiculo.indicador_restricao_rfb,
    roubo_furto: !!senatranVeiculo.indicador_roubo_furto,
    leilao: !!senatranVeiculo.indicador_leilao,
    circulacao: !!senatranVeiculo.indicador_circulacao,
    alarme: !!senatranVeiculo.indicador_alarme,
    comunicacao_venda: !!senatranVeiculo.indicador_comunicacao_venda,
  };
}

export function finalizarStatusRestricoes(r: IndicadorRestricoes): IndicadorRestricoes {
  if (r.status !== 'NADA_CONSTA') return r; // ja veio NAO_CONSULTADO/ERRO_FONTE
  const temAlguma = r.renajud || r.rff || r.roubo_furto || r.leilao || r.circulacao || r.alarme || r.comunicacao_venda;
  return { ...r, status: temAlguma ? 'PENDENCIA' : 'NADA_CONSTA' };
}

// §15 CPF -- finalidade nao definida, nao implementado.
export function resolverCpf(): IndicadorSimples {
  return { status: 'NAO_CONSULTADO' };
}
