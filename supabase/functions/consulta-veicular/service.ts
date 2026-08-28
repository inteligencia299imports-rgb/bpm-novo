import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadRenaveConfigFromEnv, consultarAptidaoRenave, pemPareceValido } from './providers/renave.ts';
import { consultarVeiculoSenatran } from './providers/senatranVeiculo.ts';
import { consultarInfracoesSenatran } from './providers/senatranInfracoes.ts';
import { normalizarResultado } from './normalizer.ts';
import { normalizarPlaca } from './validators.ts';
import type { ConsultaEntrada, ConsultaVeiculoResultado, RenaveAptidaoRaw } from './types.ts';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos -- evita chamadas duplicadas em sequencia.

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
  const configInvalido = renaveConfig && !(pemPareceValido(renaveConfig.certPem) && pemPareceValido(renaveConfig.keyPem));
  const renave: RenaveAptidaoRaw = renaveConfig && !configInvalido
    ? await consultarAptidaoRenave(entrada, renaveConfig)
    : {
        consultado: false,
        apto_estoque: null,
        motivos_nao_aptidao: [],
        falha_comunicacao_detran: false,
        debitos: [],
        erro: configInvalido
          ? {
              motivo: 'ERRO',
              codigo_http: 0,
              mensagem: 'RENAVE_CERT_PEM/RENAVE_KEY_PEM não parecem PEM válidos (quebras de linha ausentes) — reconfigure o secret com Get-Content -Raw',
            }
          : { motivo: 'NAO_CONFIGURADO', codigo_http: 0, mensagem: 'RENAVE não configurado (secrets ausentes)' },
      };

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
  // consulta estiver ligada a uma avaliacao.
  if (ctx.avaliacaoId && (resultado.veiculo.renavam || resultado.veiculo.chassi || resultado.veiculo.uf)) {
    await ctx.supabaseAdmin
      .from('avaliacoes')
      .update({
        renavam: resultado.veiculo.renavam,
        chassi: resultado.veiculo.chassi,
        uf: resultado.veiculo.uf,
      })
      .eq('id', ctx.avaliacaoId);
  }

  return { resultado, deCache: false };
}
