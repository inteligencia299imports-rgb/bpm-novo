import React from 'react';
import { cn } from '@/lib/utils';
import type { EtapaVenda, EtapaVendaKey } from '@/lib/etapasVenda';

interface Props {
  etapas: EtapaVenda[];
  /** Etapa cuja tela está aberta abaixo da barra. */
  selecionada: EtapaVendaKey;
  onSelect: (key: EtapaVendaKey) => void;
  /** Etapas que não abrem (ficam só como indicador), com o motivo. */
  bloqueadas?: Map<EtapaVendaKey, string>;
  loading?: boolean;
}

const PONTA = 14; // largura da ponta/encaixe da seta, em px
const LINHA = 5; // espessura da linha de status à esquerda, em px
const ESPACO = 8; // espaço horizontal entre uma seta e a próxima, em px
const COR_CONCLUIDA = '#169d53';
const COR_PENDENTE = '#9CA3AF';
// Fundo da seta: desbloqueada (pode abrir) branca, bloqueada cinza.
const FUNDO_DESBLOQUEADA = '#FFFFFF';
const FUNDO_BLOQUEADA = '#E5E7EB';
// Filtro SVG que arredonda os cantos das setas (clip-path não tem cantos arredondados).
const FILTRO_ARREDONDAR = 'etapas-venda-arredondar';

const textoDias = (d: number) => `${d} ${d === 1 ? 'dia' : 'dias'}`;

const clipSeta = (primeira: boolean) =>
  primeira
    ? `polygon(0 0, calc(100% - ${PONTA}px) 0, 100% 50%, calc(100% - ${PONTA}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${PONTA}px) 0, 100% 50%, calc(100% - ${PONTA}px) 100%, 0 100%, ${PONTA}px 50%)`;

/**
 * Barra de etapas da venda em setas encaixadas (desbloqueada branca, bloqueada cinza), com sombra e cantos
 * levemente arredondados. A linha à esquerda de cada seta indica o status:
 * verde = concluída, cinza = pendente. Abaixo do nome, nas concluídas, os dias
 * da marcação da venda até a conclusão.
 */
const EtapasVendaBar: React.FC<Props> = ({ etapas, selecionada, onSelect, bloqueadas, loading }) => (
  // py-2: a barra rola na horizontal e sem esse respiro a sombra seria cortada.
  <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 py-2">
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id={FILTRO_ARREDONDAR}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="desfocado" />
          <feColorMatrix in="desfocado" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="forma" />
          <feComposite in="SourceGraphic" in2="forma" operator="atop" />
        </filter>
      </defs>
    </svg>
    <div className={cn('flex min-w-max md:min-w-0 w-full', loading && 'opacity-60 animate-pulse')}>
      {etapas.map((e, i) => {
        const clip = clipSeta(i === 0);
        const ativa = e.key === selecionada;
        const motivoBloqueio = bloqueadas?.get(e.key);
        const bloqueada = !!motivoBloqueio;
        const corLinha = e.concluida ? COR_CONCLUIDA : COR_PENDENTE;
        return (
          // Sombra e arredondamento ficam em camadas por fora do botão: o
          // clip-path do botão cortaria a sombra se ela estivesse nele.
          <div
            key={e.key}
            className="flex-1 min-w-[104px] md:min-w-0"
            style={{
              marginLeft: i === 0 ? 0 : -(PONTA - ESPACO),
              filter: ativa
                ? 'drop-shadow(0 3px 6px rgba(15, 23, 42, 0.22))'
                : 'drop-shadow(0 1px 3px rgba(15, 23, 42, 0.16))',
            }}
          >
            <div style={{ filter: `url(#${FILTRO_ARREDONDAR})` }}>
              <button
                type="button"
                disabled={bloqueada}
                onClick={bloqueada ? undefined : () => onSelect(e.key)}
                title={[
                  `${e.label} — ${e.concluida ? 'concluída' : 'pendente'}`,
                  e.dias != null && `concluída ${textoDias(e.dias)} após a venda`,
                  motivoBloqueio,
                ].filter(Boolean).join(' · ')}
                className={cn('relative block w-full h-12', bloqueada && 'cursor-default')}
                style={{ clipPath: clip, backgroundColor: bloqueada ? FUNDO_BLOQUEADA : FUNDO_DESBLOQUEADA }}
              >
                {/* Linha de status na borda esquerda: traço com o dobro da espessura
                    centrado na borda (o clip-path corta a metade de fora) e pontas
                    redondas, para a dobra do encaixe ficar arredondada. */}
                <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                  {i === 0 ? (
                    <line x1="0" y1="0" x2="0" y2="100%" stroke={corLinha} strokeWidth={LINHA * 2} strokeLinecap="round" />
                  ) : (
                    <>
                      <line x1="0" y1="0" x2={PONTA} y2="50%" stroke={corLinha} strokeWidth={LINHA * 2} strokeLinecap="round" />
                      <line x1={PONTA} y1="50%" x2="0" y2="100%" stroke={corLinha} strokeWidth={LINHA * 2} strokeLinecap="round" />
                    </>
                  )}
                </svg>
                <span
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center text-center leading-tight text-[11px]',
                    ativa ? 'font-bold text-primary' : 'font-semibold text-foreground',
                    bloqueada && 'text-muted-foreground',
                  )}
                  style={{ paddingLeft: i === 0 ? LINHA + 8 : PONTA + LINHA + 2, paddingRight: PONTA + 2 }}
                >
                  <span>{e.label}</span>
                  {e.dias != null && (
                    <span className="text-[10px] font-normal text-muted-foreground">{textoDias(e.dias)}</span>
                  )}
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default EtapasVendaBar;
