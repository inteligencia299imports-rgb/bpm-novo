import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ConsultaVeiculoResultado, IndicadorStatus, IndicadorRestricoes } from '@/types/consultaVeicular';

// Emoji por status -- mesma linguagem visual do texto de consulta manual
// (§ ConsultaDetail "CONSULTA - PLACA/UF\n..."), só que gerado a partir do
// resultado estruturado em vez de digitado à mão.
const STATUS_EMOJI: Record<IndicadorStatus, string> = {
  NADA_CONSTA: '✅',
  REGULAR: '✅',
  PENDENCIA: '⚠️',
  NAO_DISPONIVEL: '⏳',
  NAO_CONSULTADO: '⏳',
  INDETERMINADO: '⚠️',
  ERRO_FONTE: '⚠️',
};

const STATUS_TEXTO: Record<IndicadorStatus, string> = {
  NADA_CONSTA: 'NADA CONSTA',
  REGULAR: 'REGULAR',
  PENDENCIA: 'PENDÊNCIA',
  NAO_DISPONIVEL: 'NÃO DISPONIBILIZADO',
  NAO_CONSULTADO: 'NÃO CONSULTADO',
  INDETERMINADO: 'INDETERMINADO',
  ERRO_FONTE: 'ERRO NA CONSULTA',
};

const RESTRICAO_LABEL: Record<keyof Omit<IndicadorRestricoes, 'status'>, string> = {
  roubo_furto: 'ROUBO/FURTO',
  renajud: 'RENAJUD',
  rff: 'RFF',
  leilao: 'LEILÃO',
  circulacao: 'RESTRIÇÃO DE CIRCULAÇÃO',
  alarme: 'ALARME',
  comunicacao_venda: 'COMUNICAÇÃO DE VENDA',
};

const formatCurrency = (v: number | null | undefined) => v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ListaLinha = ({ label, status, detalhe }: { label: string; status: IndicadorStatus; detalhe: string }) => (
  <p className="text-sm leading-relaxed">
    {STATUS_EMOJI[status]} {label} - {detalhe}
  </p>
);

interface Props {
  resultado: ConsultaVeiculoResultado;
}

const ConsultaVeicularResultado: React.FC<Props> = ({ resultado }) => {
  const { indicadores, renave, veiculo, infracoes, fontes } = resultado;

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>Consulta Veicular — {veiculo.placa}{veiculo.uf ? `/${veiculo.uf}` : ''}</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {format(new Date(resultado.consultado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {(() => {
          const orgaoDetalhe = (ind: { status: IndicadorStatus; quantidade?: number; valor?: number | null }) => {
            if (ind.status === 'PENDENCIA') {
              const qtd = ind.quantidade ?? 0;
              const valorTxt = ind.valor ? ` - ${formatCurrency(ind.valor)}` : '';
              return `${qtd} INFRAÇÃO${qtd === 1 ? '' : 'ÕES'}${valorTxt}`;
            }
            return STATUS_TEXTO[ind.status];
          };

          const ativosRestricoes = (Object.keys(RESTRICAO_LABEL) as Array<keyof typeof RESTRICAO_LABEL>)
            .filter((k) => indicadores.restricoes[k])
            .map((k) => RESTRICAO_LABEL[k]);

          const linhas: Array<{ label: string; status: IndicadorStatus; detalhe: string }> = [
            {
              label: 'IPVA',
              status: indicadores.ipva.status,
              detalhe: indicadores.ipva.valor != null ? formatCurrency(indicadores.ipva.valor)! : STATUS_TEXTO[indicadores.ipva.status],
            },
            {
              label: 'Licenciamento',
              status: indicadores.licenciamento.status,
              detalhe: indicadores.licenciamento.status === 'REGULAR' && indicadores.licenciamento.exercicio
                ? `CRLV ${indicadores.licenciamento.exercicio} EMITIDO`
                : STATUS_TEXTO[indicadores.licenciamento.status],
            },
            {
              label: 'Detran',
              status: indicadores.detran.status,
              detalhe: indicadores.detran.valor ? formatCurrency(indicadores.detran.valor)! : STATUS_TEXTO[indicadores.detran.status],
            },
            { label: 'DER-DF', status: indicadores.der_df.status, detalhe: orgaoDetalhe(indicadores.der_df) },
            { label: 'DNIT', status: indicadores.dnit.status, detalhe: orgaoDetalhe(indicadores.dnit) },
            { label: 'PRF', status: indicadores.prf.status, detalhe: orgaoDetalhe(indicadores.prf) },
            {
              label: 'Autocorp',
              status: indicadores.autocorp.status,
              detalhe: indicadores.autocorp.descricao?.toUpperCase() || STATUS_TEXTO[indicadores.autocorp.status],
            },
            {
              label: 'Gravame',
              status: indicadores.gravame.status,
              detalhe: indicadores.gravame.status === 'PENDENCIA' && indicadores.gravame.tipo
                ? `ATIVO - ${indicadores.gravame.tipo.toUpperCase()}`
                : STATUS_TEXTO[indicadores.gravame.status],
            },
            {
              label: 'Restrições',
              status: indicadores.restricoes.status,
              detalhe: indicadores.restricoes.status === 'PENDENCIA' && ativosRestricoes.length > 0
                ? ativosRestricoes.join(' / ')
                : STATUS_TEXTO[indicadores.restricoes.status],
            },
            { label: 'CPF', status: indicadores.cpf.status, detalhe: STATUS_TEXTO[indicadores.cpf.status] },
          ];

          return (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground mb-1">LISTAGEM</p>
              {linhas.map((l) => <ListaLinha key={l.label} label={l.label.toUpperCase()} status={l.status} detalhe={l.detalhe} />)}
            </div>
          );
        })()}

        <Separator className="my-3" />

        {/* RENAVE */}
        {(() => {
          const renaveEmoji = !renave.consultado ? '⏳' : renave.apto_estoque === true ? '✅' : renave.apto_estoque === false ? '❌' : '⚠️';
          const renaveTexto = !renave.consultado
            ? (renave.erro ? 'ERRO NA CONSULTA' : 'NÃO CONSULTADO')
            : renave.apto_estoque === true
              ? 'APTO PARA ENTRADA EM ESTOQUE'
              : renave.apto_estoque === false
                ? 'NÃO APTO PARA ENTRADA EM ESTOQUE'
                : 'APTIDÃO INDETERMINADA';

          return (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground mb-1">RESUMO</p>
              <p className="text-sm leading-relaxed">{renaveEmoji} RENAVE - {renaveTexto}</p>
              {renave.erro && <p className="text-sm leading-relaxed break-words">⚠️ ERRO: {renave.erro.toUpperCase()}</p>}
              {renave.falha_comunicacao_detran && (
                <p className="text-sm leading-relaxed">⚠️ FALHA DE COMUNICAÇÃO COM O DETRAN</p>
              )}
              {renave.motivos_nao_aptidao.length > 0 && (
                <p className="text-sm leading-relaxed">❌ MOTIVOS: {renave.motivos_nao_aptidao.join('; ').toUpperCase()}</p>
              )}
            </div>
          );
        })()}

        {/* Infrações */}
        {infracoes.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Infrações</span>
              {infracoes.map((inf, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 text-xs space-y-0.5">
                  <p className="font-medium">{inf.infracao_descricao || inf.codigo_infracao || 'Infração'}</p>
                  <p className="text-muted-foreground">
                    {inf.orgao_autuador_descricao || inf.orgao_autuador_codigo}
                    {inf.data_infracao ? ` · ${inf.data_infracao}` : ''}
                    {inf.valor_integral_infracao != null ? ` · ${formatCurrency(inf.valor_integral_infracao)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Status por fonte */}
        <Separator className="my-3" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {Object.entries(fontes).map(([fonte, status]) => (
            <span key={fonte}>{fonte.replace(/_/g, ' ')}: <strong className={status === 'OK' ? 'text-success' : status === 'ERRO' ? 'text-destructive' : ''}>{status}</strong></span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConsultaVeicularResultado;
