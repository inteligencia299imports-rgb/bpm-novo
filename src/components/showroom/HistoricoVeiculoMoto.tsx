import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Gauge, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';

// Histórico da Moto (mesmo trecho do card "Moto do Cliente" do ofc). Linha do tempo mantida por
// gatilhos no DB 299 (veiculos / veiculo_historico / veiculo_revisoes): km de cada O.S. da oficina e
// de cada avaliação do BPM, vendas 0km/seminova e as revisões previstas na finalização da O.S.
// A moto é achada pela própria avaliação (veiculo_historico tipo 'avaliacao', origem_id = avaliação).
// No card: revisões previstas + "+ Ver mais"; o pop-up traz a tabela Data | Nº OS | Situação | Cliente | Km.
// - Avaliação/venda: clicar na situação abre o atendimento do BPM numa nova guia (menos o atual).
// - O.S. (ofc): sem link; passar o mouse no número mostra o relato do cliente.

const TIPO_LABEL: Record<string, string> = {
  os: 'O.S. / Atendimento',
  avaliacao: 'Avaliação (BPM)',
  venda_0km: 'Venda 0km',
  venda_seminova: 'Venda seminova',
};

// Situação do atendimento da oficina (mesmos rótulos do ofc).
const STATUS_OFICINA_LABEL: Record<string, string> = {
  agendado: 'Em Aberto',
  em_execucao: 'Em Execução',
  pausado: 'Pausado',
  aguardando_peca: 'Aguardando Peça',
  lava_jato: 'Lava Jato',
  execucao_finalizada: 'Concluído',
  aguardando_entrega: 'Aguardando Entrega',
  entregue: 'Aguardando NF',
  fechada: 'Fechada',
  faturado: 'Faturado',
  em_aberto: 'Orçamento',
  pendente: 'Orçamento',
  orcamento: 'Orçamento',
  orcamento_aguardando_peca: 'Aguardando Peça',
  a_contatar: 'A Contatar',
  em_contato: 'Em Contato',
  orcamento_agendado: 'Agendado',
  aprovacao_desconto: 'Aprovação de Desconto',
  perdido: 'Perdido',
};
const statusOficinaLabel = (s: string) =>
  STATUS_OFICINA_LABEL[s] ?? s.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

// Número da O.S. no padrão do ofc (#XXXXX).
const fmtNumeroOs = (numero: string) => {
  const digitos = numero.replace(/\D/g, '');
  return digitos ? `#${digitos.padStart(5, '0')}` : `#${numero}`;
};

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const nomeCurto = (nome: string | null | undefined) => {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean).filter((p) => !PARTICULAS.has(p.toLowerCase()));
  if (partes.length <= 1) return partes[0] ?? (nome ?? '').trim();
  return `${partes[0]} ${partes[partes.length - 1]}`;
};

const fmtKm = (km: number) => `${km.toLocaleString('pt-BR')} km`;

interface Evento { id: string; ocorrido_em: string; tipo: string; km: number | null; cliente_id: string | null; origem_id: string }
interface AtendimentoDoEvento { numero: string | null; status: string; frota: boolean; relato: string | null }
interface Revisao { id: string; data_prevista: string; km_prevista: number }

export function HistoricoVeiculoMoto({ avaliacaoId, atendimentoAtualId }: { avaliacaoId: string; atendimentoAtualId?: string }) {
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [osPorEvento, setOsPorEvento] = useState<Map<string, AtendimentoDoEvento>>(new Map());
  // Atendimento do BPM por trás de cada avaliação/venda (origem_id → atendimentos_motos.id).
  const [atendimentoBpm, setAtendimentoBpm] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      const { data: h } = await supabase
        .from('veiculo_historico' as any)
        .select('veiculo_id')
        .eq('tipo', 'avaliacao')
        .eq('origem_id', avaliacaoId)
        .maybeSingle();
      const vid = (h as any)?.veiculo_id ?? null;
      if (!vid) {
        if (ativo) { setVeiculoId(null); setLoading(false); }
        return;
      }
      const [{ data: ev }, { data: rv }] = await Promise.all([
        supabase.from('veiculo_historico' as any)
          .select('id, ocorrido_em, tipo, km, cliente_id, origem_id')
          .eq('veiculo_id', vid)
          .order('ocorrido_em', { ascending: false }),
        supabase.from('veiculo_revisoes' as any)
          .select('id, data_prevista, km_prevista')
          .eq('veiculo_id', vid)
          .order('created_at', { ascending: false }),
      ]);
      const evs = ((ev as any[]) ?? []) as Evento[];
      const ids = (tipo: string) => evs.filter((e) => e.tipo === tipo).map((e) => e.origem_id);

      const idsCliente = [...new Set(evs.map((e) => e.cliente_id).filter(Boolean))] as string[];
      const [cs, os, avs, n0km, semis] = await Promise.all([
        idsCliente.length ? supabase.from('clientes_fornecedores' as any).select('id, nome_razao_social').in('id', idsCliente) : null,
        ids('os').length ? supabase.from('atendimento_servicos' as any)
          .select('id, numero_os, numero_venda_balcao, status, tipo_cliente, relato_cliente').in('id', ids('os')) : null,
        ids('avaliacao').length ? supabase.from('avaliacoes' as any).select('id, atendimento_id').in('id', ids('avaliacao')) : null,
        ids('venda_0km').length ? supabase.from('estoque_motos_novas' as any).select('id, atendimento_venda_id').in('id', ids('venda_0km')) : null,
        ids('venda_seminova').length ? supabase.from('estoque_motos' as any).select('id, atendimento_venda_id').in('id', ids('venda_seminova')) : null,
      ]);

      const nomes = new Map<string, string>();
      (((cs as any)?.data as any[]) ?? []).forEach((c) => nomes.set(c.id, nomeCurto(c.nome_razao_social)));
      const ats = new Map<string, AtendimentoDoEvento>();
      (((os as any)?.data as any[]) ?? []).forEach((a) => ats.set(a.id, {
        numero: a.numero_os ? fmtNumeroOs(a.numero_os) : a.numero_venda_balcao ?? null,
        status: a.status,
        frota: a.tipo_cliente === 'frota_interna',
        relato: a.relato_cliente ?? null,
      }));
      const bpm = new Map<string, string>();
      (((avs as any)?.data as any[]) ?? []).forEach((a) => { if (a.atendimento_id) bpm.set(a.id, a.atendimento_id); });
      [n0km, semis].forEach((r) => (((r as any)?.data as any[]) ?? []).forEach((m) => {
        if (m.atendimento_venda_id) bpm.set(m.id, m.atendimento_venda_id);
      }));

      if (!ativo) return;
      setVeiculoId(vid);
      setEventos(evs);
      setRevisoes(((rv as any[]) ?? []) as Revisao[]);
      setClientes(nomes);
      setOsPorEvento(ats);
      setAtendimentoBpm(bpm);
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [avaliacaoId]);

  if (loading) {
    return (
      <div className="flex items-center text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Carregando histórico…
      </div>
    );
  }
  if (!veiculoId) return null;

  const kmAtual = eventos.reduce<number | null>((m, e) => (e.km != null && (m == null || e.km > m) ? e.km : m), null);
  // Registro do km atual (o mais recente com o maior km) — destacado em laranja na tabela.
  const idKmAtual = kmAtual == null ? null : eventos.find((e) => e.km === kmAtual)?.id ?? null;

  const abrirAtendimentoBpm = (id: string) => {
    window.open(`/?tab=showroom&atendimento=${id}`, '_blank', 'noopener');
  };

  const botaoVerMais = (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:opacity-80"
      onClick={() => setAberto(true)}
    >
      <Plus className="h-3.5 w-3.5" /> Ver mais
    </button>
  );

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Histórico da Moto</h3>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Revisões previstas</span>
        {revisoes.length > 0 ? (
          revisoes.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs border-b border-border last:border-0 py-1">
              <span>{format(parseISO(r.data_prevista), 'dd/MM/yyyy')} ou {fmtKm(Number(r.km_prevista))}</span>
              {i === 0 && botaoVerMais}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs py-1">
            <span>-</span>
            {botaoVerMais}
          </div>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> Histórico da Moto</DialogTitle>
            <DialogDescription>{kmAtual != null ? `Atual ${fmtKm(kmAtual)}` : 'Sem km informado'}</DialogDescription>
          </DialogHeader>
          {/* Cabeçalho congelado: a tabela rola dentro da área de altura máxima, sem barra visível. */}
          <div className="relative max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TooltipProvider delayDuration={150}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))] [&_th]:bg-white">
                  <tr className="text-muted-foreground">
                    <th className="py-2.5 px-3 font-medium text-left whitespace-nowrap">Data</th>
                    <th className="py-2.5 px-3 font-medium text-left whitespace-nowrap">Nº OS</th>
                    <th className="py-2.5 px-3 font-medium text-left whitespace-nowrap">Situação</th>
                    <th className="py-2.5 px-3 font-medium text-left whitespace-nowrap">Cliente</th>
                    <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Km</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum registro.</td></tr>
                  )}
                  {eventos.map((e) => {
                    const os = e.tipo === 'os' ? osPorEvento.get(e.origem_id) : undefined;
                    const situacao = os
                      ? `${statusOficinaLabel(os.status)}${os.frota ? ' · Frota Interna' : ''}`
                      : (TIPO_LABEL[e.tipo] ?? e.tipo);
                    const atBpm = e.tipo !== 'os' ? atendimentoBpm.get(e.origem_id) : undefined;
                    const linkBpm = atBpm && atBpm !== atendimentoAtualId ? atBpm : null;
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 px-3 whitespace-nowrap">{format(parseISO(e.ocorrido_em), 'dd/MM/yyyy')}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {os ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{os.numero ?? 'Orçamento'}</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Relato do cliente</p>
                                <p className="text-xs whitespace-pre-wrap">{os.relato?.trim() || 'Sem relato informado.'}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {linkBpm ? (
                            <button
                              type="button"
                              className="text-left text-primary hover:opacity-80"
                              onClick={() => abrirAtendimentoBpm(linkBpm)}
                              title="Abrir atendimento (nova guia)"
                            >
                              {situacao}
                            </button>
                          ) : situacao}
                        </td>
                        <td className="py-2.5 px-3">{(e.cliente_id && clientes.get(e.cliente_id)) || '—'}</td>
                        <td className={'py-2.5 px-3 text-right whitespace-nowrap font-medium' + (e.id === idKmAtual ? ' text-primary' : '')}>
                          {e.km != null ? fmtKm(e.km) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
