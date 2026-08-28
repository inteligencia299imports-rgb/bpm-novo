import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, ShieldQuestion } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ConsultaVeiculoResultado, IndicadorStatus } from '@/types/consultaVeicular';

const STATUS_LABEL: Record<IndicadorStatus, string> = {
  NADA_CONSTA: 'Nada Consta',
  REGULAR: 'Regular',
  PENDENCIA: 'Pendência',
  NAO_DISPONIVEL: 'Não Disponível',
  NAO_CONSULTADO: 'Não Consultado',
  INDETERMINADO: 'Indeterminado',
  ERRO_FONTE: 'Erro na Consulta',
};

const STATUS_CLASS: Record<IndicadorStatus, string> = {
  NADA_CONSTA: 'bg-success/15 text-success border-success/30',
  REGULAR: 'bg-success/15 text-success border-success/30',
  PENDENCIA: 'bg-destructive/15 text-destructive border-destructive/30',
  NAO_DISPONIVEL: 'bg-muted text-muted-foreground border-border',
  NAO_CONSULTADO: 'bg-muted text-muted-foreground border-border',
  INDETERMINADO: 'bg-warning/15 text-warning border-warning/30',
  ERRO_FONTE: 'bg-destructive/15 text-destructive border-destructive/30',
};

const IndicadorRow = ({ label, status, extra }: { label: string; status: IndicadorStatus; extra?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 py-1.5">
    <span className="text-sm font-medium">{label}</span>
    <div className="flex items-center gap-2 shrink-0">
      {extra}
      <Badge variant="outline" className={`text-[10px] ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</Badge>
    </div>
  </div>
);

const formatCurrency = (v: number | null | undefined) => v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
          // So mostra o que a fonte efetivamente consultou -- indicadores
          // NAO_CONSULTADO (fonte nao habilitada, ex: SENATRAN ainda nao
          // liberado) ficam escondidos em vez de poluir a tela com "Não
          // Consultado" pra tudo que ainda nao esta disponivel.
          const linhas: Array<{ label: string; status: IndicadorStatus; extra?: React.ReactNode }> = [
            { label: 'IPVA', status: indicadores.ipva.status, extra: formatCurrency(indicadores.ipva.valor) && <span className="text-xs text-muted-foreground">{formatCurrency(indicadores.ipva.valor)}</span> },
            { label: 'Licenciamento', status: indicadores.licenciamento.status, extra: indicadores.licenciamento.exercicio && <span className="text-xs text-muted-foreground">{indicadores.licenciamento.exercicio}</span> },
            { label: 'Detran', status: indicadores.detran.status, extra: formatCurrency(indicadores.detran.valor) && <span className="text-xs text-muted-foreground">{formatCurrency(indicadores.detran.valor)}</span> },
            { label: 'DER-DF', status: indicadores.der_df.status, extra: !!indicadores.der_df.quantidade && <span className="text-xs text-muted-foreground">{indicadores.der_df.quantidade}</span> },
            { label: 'DNIT', status: indicadores.dnit.status, extra: !!indicadores.dnit.quantidade && <span className="text-xs text-muted-foreground">{indicadores.dnit.quantidade}</span> },
            { label: 'PRF', status: indicadores.prf.status, extra: !!indicadores.prf.quantidade && <span className="text-xs text-muted-foreground">{indicadores.prf.quantidade}</span> },
            { label: 'Autocorp', status: indicadores.autocorp.status },
            { label: 'Gravame', status: indicadores.gravame.status, extra: indicadores.gravame.tipo && <span className="text-xs text-muted-foreground">{indicadores.gravame.tipo}</span> },
            { label: 'Restrições', status: indicadores.restricoes.status },
            { label: 'CPF', status: indicadores.cpf.status },
          ].filter((l) => l.status !== 'NAO_CONSULTADO');

          if (linhas.length === 0) {
            return <p className="text-sm text-muted-foreground italic py-2">Nenhum indicador disponível para consulta no momento.</p>;
          }
          return linhas.map((l) => <IndicadorRow key={l.label} label={l.label} status={l.status} extra={l.extra} />);
        })()}

        <Separator className="my-3" />

        {/* RENAVE */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            {renave.consultado ? (
              renave.apto_estoque ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : renave.apto_estoque === false ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-semibold">
              RENAVE — {!renave.consultado
                ? (renave.erro ? 'erro na consulta' : 'não consultado')
                : renave.apto_estoque === true
                  ? 'Apto para entrada em estoque'
                  : renave.apto_estoque === false
                    ? 'Não apto para entrada em estoque'
                    : 'Aptidão indeterminada'}
            </span>
          </div>
          {renave.erro && (
            <p className="text-xs text-destructive break-words">{renave.erro}</p>
          )}
          {renave.falha_comunicacao_detran && (
            <p className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Falha de comunicação com o Detran</p>
          )}
          {renave.motivos_nao_aptidao.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              {renave.motivos_nao_aptidao.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          {renave.debitos_detran.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {renave.debitos_detran.map((d, i) => (
                <div key={i}>{d.tipo}: {formatCurrency(d.valor) || '-'}{d.descricao ? ` — ${d.descricao}` : ''}</div>
              ))}
            </div>
          )}
        </div>

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
