import type { ConsultaVeiculoResultado, IndicadorStatus } from '@/types/consultaVeicular';

const brl = (v: number | null | undefined) =>
  v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function statusTexto(status: IndicadorStatus): string {
  switch (status) {
    case 'NADA_CONSTA':
    case 'REGULAR':
      return 'NADA CONSTA';
    case 'PENDENCIA':
      return 'PENDÊNCIA';
    case 'INDETERMINADO':
      return 'INDETERMINADO';
    case 'ERRO_FONTE':
      return 'ERRO NA CONSULTA';
    case 'NAO_DISPONIVEL':
      return 'NÃO DISPONÍVEL';
    default:
      return 'NÃO CONSULTADO';
  }
}

// ✅ quando não há pendência; ⚠️ para pendência / erro / indeterminado / não consultado
const icone = (status: IndicadorStatus): '✅' | '⚠️' =>
  status === 'NADA_CONSTA' || status === 'REGULAR' ? '✅' : '⚠️';

/**
 * Converte o resultado estruturado da consulta SERPRO num único texto em
 * formato de lista ("RÓTULO - SITUAÇÃO"), pronto pra ser editado à mão.
 */
export function formatarResultadoConsulta(r: ConsultaVeiculoResultado): string {
  const linhas: string[] = [];
  const add = (label: string, detalhe: string | null, status: IndicadorStatus) => {
    const d = detalhe || statusTexto(status);
    linhas.push(`${icone(status)} ${label} - ${d}`);
  };

  const i = r.indicadores;
  add(i.ipva.exercicio ? `IPVA ${i.ipva.exercicio}` : 'IPVA', brl(i.ipva.valor), i.ipva.status);
  add(i.licenciamento.exercicio ? `LICENCIAMENTO ${i.licenciamento.exercicio}` : 'LICENCIAMENTO', null, i.licenciamento.status);
  add('DETRAN', brl(i.detran.valor), i.detran.status);
  add('DER-DF', i.der_df.quantidade ? `${i.der_df.quantidade} INFRAÇÃO(ÕES)` : null, i.der_df.status);
  add('DNIT', i.dnit.quantidade ? `${i.dnit.quantidade} INFRAÇÃO(ÕES)` : null, i.dnit.status);
  add('PRF', i.prf.quantidade ? `${i.prf.quantidade} INFRAÇÃO(ÕES)` : null, i.prf.status);
  add('GRAVAME', i.gravame.tipo ? `ATIVO - ${i.gravame.tipo}` : null, i.gravame.status);

  const rest = i.restricoes;
  const flagsRest = [
    rest.roubo_furto && 'ROUBO/FURTO',
    rest.renajud && 'RENAJUD (JUDICIAL)',
    rest.rff && 'RECEITA FEDERAL',
    rest.leilao && 'LEILÃO',
    rest.alarme && 'ALARME',
    rest.circulacao && 'RESTRIÇÃO DE CIRCULAÇÃO',
    rest.comunicacao_venda && 'COMUNICAÇÃO DE VENDA',
  ].filter(Boolean) as string[];
  add('RESTRIÇÕES', flagsRest.join(', ') || null, rest.status);

  // Aptidão RENAVE
  if (r.renave.consultado) {
    const ap = r.renave.apto_estoque;
    const txt = ap === true ? 'APTO PARA ENTRADA EM ESTOQUE'
      : ap === false ? 'NÃO APTO PARA ENTRADA EM ESTOQUE'
        : 'APTIDÃO INDETERMINADA';
    linhas.push('');
    linhas.push(`${ap === true ? '✅' : '⚠️'} RENAVE - ${txt}`);
    if (r.renave.motivos_nao_aptidao.length > 0) {
      linhas.push(`⚠️ MOTIVOS: ${r.renave.motivos_nao_aptidao.join('; ').toUpperCase()}`);
    }
    if (r.renave.falha_comunicacao_detran) {
      linhas.push('⚠️ FALHA DE COMUNICAÇÃO COM O DETRAN');
    }
  } else if (r.renave.erro) {
    linhas.push('');
    linhas.push(`⚠️ RENAVE - ERRO NA CONSULTA: ${r.renave.erro.toUpperCase()}`);
  }

  if (r.infracoes.length > 0) {
    linhas.push('');
    linhas.push(`INFRAÇÕES (${r.infracoes.length}):`);
    for (const inf of r.infracoes) {
      const desc = (inf.infracao_descricao || inf.codigo_infracao || 'INFRAÇÃO').toUpperCase();
      const orgao = (inf.orgao_autuador_descricao || inf.orgao_autuador_codigo || '').toUpperCase();
      const valor = inf.valor_integral_infracao != null ? ` - ${brl(inf.valor_integral_infracao)}` : '';
      linhas.push(`⚠️ ${desc}${orgao ? ` (${orgao})` : ''}${valor}`);
    }
  }

  return linhas.join('\n').toUpperCase();
}
