import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Search, User, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { BPM_PROJETO_ID } from '@/lib/projeto';
import { firstLastName } from '@/lib/utils';
import type { ConsultaVeiculoResultado } from '@/types/consultaVeicular';

export interface ConsultaManualResultado {
  tipo: 'manual';
  texto: string;
  consultado_em?: string;
}

export type ConsultaResultado = ConsultaVeiculoResultado | ConsultaManualResultado;

export interface ConsultaRow {
  id: string;
  created_at: string;
  usuario_id: string | null;
  usuario_nome: string;
  placa: string | null;
  resultado: ConsultaResultado & { texto?: string };
}

interface Props {
  avaliacaoId: string;
  /** muda pra forçar recarregar a lista depois de uma nova consulta */
  refreshKey?: number;
  onOpen: (row: ConsultaRow, ehUltima: boolean) => void;
}

function isManual(r: ConsultaResultado): r is ConsultaManualResultado {
  return (r as ConsultaManualResultado)?.tipo === 'manual';
}

// sem ícones na lista; título azul (sistema) quando a moto está apta,
// vermelho quando inapta / indeterminada / erro; neutro na consulta manual.
const semIcone = (s: string) => s.replace(/^(?:✅|⚠️|⚠|❓|\s)+/u, '').trim();

function resumo(r: ConsultaResultado & { texto?: string }): { texto: string; cor: string } {
  if (isManual(r)) {
    const linha = (r.texto || '').split('\n').find((l) => l.trim()) || r.texto;
    return { texto: semIcone(linha).trim(), cor: 'text-foreground' };
  }

  const erro = !!r?.renave?.erro || Object.values(r?.fontes ?? {}).every((s) => s !== 'OK');
  const apto = r?.renave?.apto_estoque;
  const cor = !erro && apto === true ? 'text-primary' : 'text-destructive';

  if (erro) return { texto: 'ERRO NA CONSULTA', cor };
  if (apto === true) return { texto: 'APTO PARA ENTRADA EM ESTOQUE', cor };
  if (apto === false) return { texto: 'NÃO APTO PARA ENTRADA EM ESTOQUE', cor };
  return { texto: 'APTIDÃO INDETERMINADA', cor };
}

const ConsultasVeicularesList: React.FC<Props> = ({ avaliacaoId, refreshKey, onOpen }) => {
  const [rows, setRows] = useState<ConsultaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('consultas_veiculares')
        .select('id, created_at, usuario_id, placa, resultado')
        .eq('avaliacao_id', avaliacaoId)
        .order('created_at', { ascending: false });
      if (cancel) return;
      const lista = (data || []) as unknown as Array<Omit<ConsultaRow, 'usuario_nome'>>;
      const ids = [...new Set(lista.map((r) => r.usuario_id).filter(Boolean))] as string[];
      let nomes: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', ids).eq('projeto_id', BPM_PROJETO_ID);
        nomes = Object.fromEntries((roles || []).map((r) => [r.user_id, firstLastName(r.nome)]));
      }
      if (cancel) return;
      setRows(lista.map((r) => ({ ...r, usuario_nome: (r.usuario_id && nomes[r.usuario_id]) || 'Usuário' })));
      setLoading(false);
    };
    fetch();
    return () => { cancel = true; };
  }, [avaliacaoId, refreshKey]);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" /> Consultas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground italic">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhuma consulta realizada.</p>
        ) : (
          <div>
            {rows.map((row, idx) => {
              const { texto, cor } = resumo(row.resultado);
              const manual = isManual(row.resultado);
              return (
                <React.Fragment key={row.id}>
                  {idx > 0 && <Separator className="my-3" />}
                  <button
                    type="button"
                    onClick={() => onOpen(row, idx === 0)}
                    className="w-full text-left space-y-1 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${cor} uppercase line-clamp-2`}>
                        {texto}
                      </p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(row.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {row.usuario_nome}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {manual ? 'Manual' : 'SERPRO'}
                      </span>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConsultasVeicularesList;
