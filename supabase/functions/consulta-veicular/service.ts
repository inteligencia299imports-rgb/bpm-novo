import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadRenaveConfigFromEnv, consultarAptidaoRenave, pemPareceValido } from './providers/renave.ts';
import { consultarVeiculoSenatran } from './providers/senatranVeiculo.ts';
import { consultarInfracoesSenatran } from './providers/senatranInfracoes.ts';
import { normalizarResultado } from './normalizer.ts';
import { normalizarPlaca } from './validators.ts';
import type { ConsultaEntrada, ConsultaVeiculoResultado, RenaveAptidaoRaw } from './types.ts';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos -- evita chamadas duplicadas em sequencia.

// RENAVE_MOCK=true -> resposta simulada, pra exercitar a tela sem depender de
// dado de teste do SERPRO. Placa terminando em digito par = veiculo com
// pendencias; impar (ou letra) = apto.
function mockRenave(entrada: ConsultaEntrada): RenaveAptidaoRaw {
  const ultimo = entrada.placa.slice(-1);
  const comPendencia = /[02468]/.test(ultimo);
  if (!comPendencia) {
    return {
      consultado: true,
      apto_estoque: true,
      motivos_nao_aptidao: [],
      falha_comunicacao_detran: false,
      debitos: [],
      restricoes: [],
      diagnostico: {},
      veiculo: { renavam: entrada.renavam, chassi: null },
    };
  }
  return {
    consultado: true,
    apto_estoque: false,
    motivos_nao_aptidao: ['Consta roubo/furto', 'Débito com o Detran'],
    falha_comunicacao_detran: false,
    debitos: [
      { tipo: 'IPVA', valor: 1234.56, descricao: 'IPVA' },
      { tipo: 'MULTA', valor: 293.47, descricao: 'Multas' },
    ],
    boletos: [{ valor: 1528.03, vencimento: '2026-09-30', descricao: '00190000090123456789012345678901234567890123' }],
    restricoes: [{ codigo: '1', descricao: 'ALIENACAO FIDUCIARIA' }],
    diagnostico: { roubo_furto: true },
    veiculo: { renavam: entrada.renavam, chassi: null },
  };
}

export interface ConsultaContexto {
  avaliacaoId: string | null;
  usuarioId: string;
  supabaseAdmin: SupabaseClient;
}

export interface ConsultaServiceResult {
  resultado: ConsultaVeiculoResultado;
  deCache: boolean;
}

export async function executarConsulta(
  entradaBruta: ConsultaEntrada,
  ctx: ConsultaContexto,
): Promise<ConsultaServiceResult> {
  const entrada: ConsultaEntrada = { ...entradaBruta, placa: normalizarPlaca(entradaBruta.placa) };

  // §20 controle de custo: nao repete a chamada se ja existe uma consulta
  // recente pra mesma avaliacao.
  if (ctx.avaliacaoId) {
    const { data: recente } = await ctx.supabaseAdmin
      .from('consultas_veiculares')
      .select('resultado, created_at')
      .eq('avaliacao_id', ctx.avaliacaoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const resultadoRecente = recente?.resultado as ConsultaVeiculoResultado | undefined;
    // So usa o cache se pelo menos uma fonte respondeu com sucesso (OK) --
    // uma tentativa que so deu ERRO/NAO_CONFIGURADO em tudo nao deve travar
    // o usuario de tentar de novo pelo cooldown.
    const teveSucesso = resultadoRecente && Object.values(resultadoRecente.fontes).some((s) => s === 'OK');
    if (resultadoRecente && teveSucesso && Date.now() - new Date(recente!.created_at).getTime() < COOLDOWN_MS) {
      return { resultado: resultadoRecente, deCache: true };
    }
  }

  const inicio = Date.now();
  const consultaId = crypto.randomUUID();

  // 1) RENAVE / Aptidao
  const renaveConfig = loadRenaveConfigFromEnv();
  // So valida o formato do PEM se um certificado FOI configurado -- a
  // homologação (hom.renave.estaleiro.serpro.gov.br) responde sem certificado.
  const temCert = !!(renaveConfig?.certPem || renaveConfig?.keyPem);
  const certInvalido = temCert
    && !(pemPareceValido(renaveConfig!.certPem ?? '') && pemPareceValido(renaveConfig!.keyPem ?? ''));

  let renave: RenaveAptidaoRaw;
  if (Deno.env.get('RENAVE_MOCK') === 'true') {
    renave = mockRenave(entrada);
  } else if (renaveConfig && !certInvalido) {
    renave = await consultarAptidaoRenave(entrada, renaveConfig);
  } else {
    renave = {
      consultado: false,
      apto_estoque: null,
      motivos_nao_aptidao: [],
      falha_comunicacao_detran: false,
      debitos: [],
      restricoes: [],
      erro: certInvalido
        ? {
            motivo: 'ERRO',
            codigo_http: 0,
            mensagem: 'RENAVE_CERT_PEM/RENAVE_KEY_PEM não parecem PEM válidos (quebras de linha ausentes)',
          }
        : { motivo: 'NAO_CONFIGURADO', codigo_http: 0, mensagem: 'RENAVE não configurado (defina RENAVE_BASE_URL)' },
    };
  }

  // 2) SENATRAN / Veiculo (stub ate confirmar habilitacao + Swagger)
  const senatranVeiculo = await consultarVeiculoSenatran(entrada);

  // 3) SENATRAN / Infracoes -- so quando o indicador de multa Renainf for
  // positivo (§4). Como o veiculo e stub hoje, isso nunca dispara ainda.
  const senatranInfracoes = senatranVeiculo.consultado && senatranVeiculo.indicador_multa_renainf
    ? await consultarInfracoesSenatran(entrada, senatranVeiculo.renavam ?? entrada.renavam)
    : {
        consultado: false,
        disponivel: false,
        infracoes: [],
        erro: { motivo: 'NAO_CONFIGURADO' as const, codigo_http: 0, mensagem: 'Não solicitado (sem indicador de multa Renainf)' },
      };

  const resultado = normalizarResultado({ consultaId, entrada, renave, senatranVeiculo, senatranInfracoes });
  const tempoRespostaMs = Date.now() - inicio;

  // Auditoria (§19) -- log e append-only, sem certificado/senha/token.
  await ctx.supabaseAdmin.from('consultas_veiculares').insert({
    id: consultaId,
    avaliacao_id: ctx.avaliacaoId,
    usuario_id: ctx.usuarioId,
    placa: entrada.placa,
    uf: entrada.uf,
    renavam: resultado.veiculo.renavam,
    fontes_consultadas: resultado.fontes,
    tempo_resposta_ms: tempoRespostaMs,
    resultado,
  });

  // Reaproveita renavam/chassi/uf pra proximas consultas (§1), se a
  // consulta estiver ligada a uma avaliacao. So grava o que a consulta
  // realmente retornou -- nunca sobrescreve com null o que o usuario ja
  // tinha preenchido (ex.: consulta com erro nao deve apagar o chassi).
  if (ctx.avaliacaoId) {
    const patch: Record<string, string> = {};
    if (resultado.veiculo.renavam) patch.renavam = resultado.veiculo.renavam;
    if (resultado.veiculo.chassi) patch.chassi = resultado.veiculo.chassi;
    if (resultado.veiculo.uf) patch.uf = resultado.veiculo.uf;
    if (Object.keys(patch).length > 0) {
      await ctx.supabaseAdmin.from('avaliacoes').update(patch).eq('id', ctx.avaliacaoId);
    }
  }

  return { resultado, deCache: false };
}
