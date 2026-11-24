// deno-lint-ignore-file no-explicit-any
// Manual em PDF no padrão dos manuais do Setor de Inteligência da 299 (mesmo layout, cores, fonte e logo).
// Página 16:9 (1456 x 818). Capa e "Cuidados e dicas" escuras; demais claras com rodapé.
// Tipos de página: cards, passos, comparativo, tela, tabela (ver ManualSpec e prompt.ts).
// Texto aceita **negrito**.
import { PDFDocument, PDFFont, PDFPage, PDFImage, rgb, setCharacterSpacing } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import { LOGO_299_PNG, DM_SANS_400, DM_SANS_500, DM_SANS_700 } from './manual_assets.ts';

// ---------------------------------------------------------------- tipos
export interface Nota { destaque?: string; texto: string }
export interface CampoTela {
  tipo: 'campo' | 'opcoes' | 'tabela' | 'texto' | 'resumo' | 'botao';
  rotulo?: string;
  valor?: string;
  opcoes?: string[];
  selecionada?: string;
  colunas?: string[];
  linhas?: string[][];
  marcador?: number;
  meia?: boolean;
}
export type Pagina =
  | { tipo: 'cards'; rotulo: string; titulo: string; fundo?: 'claro' | 'alternativo' | 'escuro'; cards: { icone?: string; titulo: string; texto: string }[]; nota?: Nota }
  | { tipo: 'passos'; rotulo: string; titulo: string; passos: { titulo: string; texto: string; tag?: string; cor?: string }[]; nota?: Nota }
  | { tipo: 'comparativo'; rotulo: string; titulo: string; lados: { nome: string; cor?: string; selo?: string; linhas: { campo: string; valor: string }[] }[]; nota?: Nota }
  | { tipo: 'tela'; rotulo: string; titulo: string; tela?: { titulo: string; caminho?: string; campos: CampoTela[] }; usar_imagem?: boolean; marcadores?: { numero: number; x: number; y: number }[]; legenda: { titulo: string; texto: string }[] }
  | { tipo: 'tabela'; rotulo: string; titulo: string; colunas: string[]; coluna_tag?: number; linhas: { celulas: string[]; cor?: string }[]; nota?: Nota };
export interface ManualSpec { titulo: string; area: string; subtitulo: string; chips?: string[]; paginas: Pagina[] }

// ---------------------------------------------------------------- medidas e cores (iguais ao HTML original)
const W = 1456, H = 818, M = 97, UTIL = W - 2 * M;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  escuro: hex('#232838'), claro: hex('#F1EFEA'), alt: hex('#EBE6E0'), branco: hex('#FFFFFF'),
  laranja: hex('#C8551E'), laranjaClaro: hex('#E99A5C'), titulo: hex('#232838'), tituloEscuro: hex('#F3F1EC'),
  corpo: hex('#5B5D66'), forte: hex('#2B2F3D'), rodape: hex('#9A968F'), borda: hex('#E4DFD6'), linha: hex('#EEEAE3'),
  cardEscuro: hex('#2D3244'), chip: hex('#2E3346'), chipTexto: hex('#E6E6EA'), subCapa: hex('#C9CBD3'),
  notaTexto: hex('#3A3D48'), notaEscura: hex('#D5D7DE'), thFundo: hex('#EBE6DF'), tdLinha: hex('#ECE7DF'), tdTexto: hex('#4F525C'),
  painel: hex('#F4F4F5'), campoBorda: hex('#DADADD'), cinzaTexto: hex('#777777'), botao: hex('#2D6E7E'), selecionado: hex('#E6E7EA'),
};
const TAG: Record<string, { bg: string; fg: string; ponto: string }> = {
  laranja: { bg: '#FBE3D4', fg: '#B5521D', ponto: '#C8551E' },
  azul: { bg: '#E3E9F6', fg: '#2F55A4', ponto: '#2F55A4' },
  verde: { bg: '#DDF1E3', fg: '#23824A', ponto: '#23824A' },
  roxo: { bg: '#EEE1F6', fg: '#7B3FA4', ponto: '#7B3FA4' },
  cinza: { bg: '#ECECEE', fg: '#4F525C', ponto: '#6B6E78' },
  vermelho: { bg: '#FBE0E0', fg: '#C62828', ponto: '#C62828' },
};
const tagCor = (c?: string) => TAG[String(c ?? '').toLowerCase()] ?? TAG.cinza;
const RODAPE = '299 Imports · Setor de Inteligência';

// ---------------------------------------------------------------- recursos
const bytes64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let cache: { logo: Uint8Array; f400: Uint8Array; f500: Uint8Array; f700: Uint8Array } | null = null;
const recursos = () => (cache ??= { logo: bytes64(LOGO_299_PNG), f400: bytes64(DM_SANS_400), f500: bytes64(DM_SANS_500), f700: bytes64(DM_SANS_700) });

interface Ctx { pdf: PDFDocument; n: PDFFont; m: PDFFont; b: PDFFont; logo: PDFImage; chars: Set<number> }

// Troca o que a fonte não desenha (emojis, símbolos raros).
const TROCA: Record<string, string> = { '✓': '', '✔': '', '✗': '', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '“': '"', '”': '"', '‘': "'", '’': "'" };
function limpar(ctx: Ctx, s: unknown): string {
  let out = '';
  for (const ch of String(s ?? '').replace(/\r/g, '')) {
    if (ch === '\n' || ctx.chars.has(ch.codePointAt(0)!)) out += ch;
    else if (ch in TROCA) out += TROCA[ch];
  }
  return out.replace(/[ \t]+/g, ' ');
}

// ---------------------------------------------------------------- texto
interface Run { t: string; b: boolean; cor?: any }
const runsDe = (s: string, prefixo?: Run): Run[] => {
  const out: Run[] = prefixo ? [prefixo] : [];
  s.split('**').forEach((p, i) => { if (p) out.push({ t: p, b: i % 2 === 1 }); });
  return out;
};
interface Peca { t: string; b: boolean; cor?: any; x: number }
interface Linha { pecas: Peca[]; w: number }

function quebrar(ctx: Ctx, runs: Run[], size: number, maxW: number, fonteN?: PDFFont): Linha[] {
  const fN = fonteN ?? ctx.n;
  const linhas: Linha[] = [];
  let atual: Linha = { pecas: [], w: 0 };
  let espacoPendente: Run | null = null;
  const fecha = () => { linhas.push(atual); atual = { pecas: [], w: 0 }; espacoPendente = null; };
  for (const r of runs) {
    const f = r.b ? ctx.b : fN;
    for (const tok of r.t.split(/(\n| +)/)) {
      if (!tok) continue;
      if (tok === '\n') { fecha(); continue; }
      if (/^ +$/.test(tok)) { if (atual.pecas.length) espacoPendente = r; continue; }
      const wTok = f.widthOfTextAtSize(tok, size);
      const wEsp = espacoPendente ? (espacoPendente.b ? ctx.b : fN).widthOfTextAtSize(' ', size) : 0;
      if (atual.pecas.length && atual.w + wEsp + wTok > maxW) fecha();
      const x = atual.w + (atual.pecas.length && espacoPendente ? wEsp : 0);
      atual.pecas.push({ t: tok, b: r.b, cor: r.cor, x });
      atual.w = x + wTok;
      espacoPendente = null;
    }
  }
  if (atual.pecas.length || !linhas.length) linhas.push(atual);
  return linhas;
}

interface ParaOpts { x: number; top: number; w: number; size: number; lh: number; cor: any; corB?: any; align?: 'left' | 'center' | 'right'; fonteN?: PDFFont; prefixo?: Run }
/** Desenha um parágrafo (com **negrito**) e devolve a altura. */
function para(ctx: Ctx, page: PDFPage | null, s: string, o: ParaOpts): number {
  const linhas = quebrar(ctx, runsDe(limpar(ctx, s), o.prefixo), o.size, o.w, o.fonteN);
  if (page) {
    linhas.forEach((l, i) => {
      const base = o.top + i * o.lh + (o.lh - o.size) / 2 + o.size * 0.8;
      const dx = o.align === 'center' ? (o.w - l.w) / 2 : o.align === 'right' ? o.w - l.w : 0;
      for (const p of l.pecas) {
        page.drawText(p.t, {
          x: o.x + dx + p.x, y: H - base, size: o.size, font: p.b ? ctx.b : (o.fonteN ?? ctx.n),
          color: p.cor ?? (p.b ? (o.corB ?? o.cor) : o.cor),
        });
      }
    });
  }
  return linhas.length * o.lh;
}
const altura = (ctx: Ctx, s: string, o: Omit<ParaOpts, 'x' | 'top' | 'cor'>) => para(ctx, null, s, { ...o, x: 0, top: 0, cor: C.corpo });

/** Texto em uma linha com espaçamento entre letras; devolve a largura. */
function espacado(page: PDFPage | null, s: string, x: number, base: number, size: number, f: PDFFont, cor: any, ls: number) {
  let cx = x;
  for (const ch of s) {
    if (page) page.drawText(ch, { x: cx, y: H - base, size, font: f, color: cor });
    cx += f.widthOfTextAtSize(ch, size) + ls * size;
  }
  return cx - x - ls * size;
}

/** Título com letras mais juntas (letter-spacing negativo, como no CSS original). */
function apertado(page: PDFPage, t: string, x: number, base: number, size: number, f: PDFFont, cor: any, ls: number) {
  page.pushOperators(setCharacterSpacing(ls * size));
  page.drawText(t, { x, y: H - base, size, font: f, color: cor });
  page.pushOperators(setCharacterSpacing(0));
}
const larguraTitulo = (t: string, size: number, f: PDFFont, ls: number) => f.widthOfTextAtSize(t, size) + ls * size * Math.max(0, [...t].length - 1);

// ---------------------------------------------------------------- formas (coordenadas a partir do topo)
function caixa(page: PDFPage, x: number, y: number, w: number, h: number, r: number, cor?: any, borda?: any, bw = 1) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const p = r
    ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
    : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  const o: any = { x: 0, y: H };
  if (cor) o.color = cor;
  if (borda) { o.borderColor = borda; o.borderWidth = bw; }
  if (!cor && !borda) return;
  page.drawSvgPath(p, o);
}
const circulo = (page: PDFPage, cx: number, cy: number, r: number, cor?: any, borda?: any, bw = 1.6) => {
  const o: any = { x: cx, y: H - cy, size: r };
  if (cor) o.color = cor;
  if (borda) { o.borderColor = borda; o.borderWidth = bw; }
  page.drawCircle(o);
};
const traco = (page: PDFPage, d: string, cor: any, bw = 1.6) => page.drawSvgPath(d, { x: 0, y: H, borderColor: cor, borderWidth: bw });

/** Círculo numerado (laranja, número branco). */
function numero(ctx: Ctx, page: PDFPage, n: string, cx: number, cy: number, r: number, size: number, anel = false) {
  if (anel) circulo(page, cx, cy, r + 3, C.branco);
  circulo(page, cx, cy, r, C.laranja);
  const w = ctx.b.widthOfTextAtSize(n, size);
  page.drawText(n, { x: cx - w / 2, y: H - (cy + size * 0.36), size, font: ctx.b, color: C.branco });
}

/** Ícone pequeno dos cards (traço laranja, 20 px). */
function icone(ctx: Ctx, page: PDFPage, nome: string, x: number, y: number) {
  const c = C.laranja, s = 18, cx = x + 9, cy = y + 9;
  const n = String(nome ?? '').toLowerCase().trim();
  if (/^\d{1,2}$/.test(n)) {
    circulo(page, cx, cy, 9.5, undefined, c, 1.3);
    const w = ctx.n.widthOfTextAtSize(n, 12);
    page.drawText(n, { x: cx - w / 2, y: H - (cy + 4.3), size: 12, font: ctx.n, color: c });
    return;
  }
  switch (n) {
    case 'grade': caixa(page, x + 2, y + 2, 14, 14, 0, undefined, c, 1.4); traco(page, `M ${x + 2} ${y + 6.7} H ${x + 16} M ${x + 2} ${y + 11.3} H ${x + 16} M ${x + 6.7} ${y + 2} V ${y + 16} M ${x + 11.3} ${y + 2} V ${y + 16}`, c, 1); break;
    case 'lista': traco(page, `M ${x + 2} ${y + 4} H ${x + 16} M ${x + 2} ${y + 9} H ${x + 16} M ${x + 2} ${y + 14} H ${x + 16}`, c, 1.5); break;
    case 'bloqueio': circulo(page, cx, cy, 7.5, undefined, c, 1.4); traco(page, `M ${cx - 5.3} ${cy + 5.3} L ${cx + 5.3} ${cy - 5.3}`, c, 1.4); break;
    case 'relogio': circulo(page, cx, cy, 7.5, undefined, c, 1.4); traco(page, `M ${cx} ${cy - 4.5} V ${cy} H ${cx + 4}`, c, 1.4); break;
    case 'ciclo': traco(page, `M ${cx - 6.5} ${cy - 2} A 7 7 0 1 1 ${cx - 5} ${cy + 5}`, c, 1.4); traco(page, `M ${cx - 7} ${cy - 6.5} L ${cx - 6.5} ${cy - 1.8} L ${cx - 2} ${cy - 2.5}`, c, 1.4); break;
    case 'documento': caixa(page, x + 3, y + 1, 12, 16, 1.5, undefined, c, 1.4); traco(page, `M ${x + 6} ${y + 6} H ${x + 12} M ${x + 6} ${y + 9.5} H ${x + 12} M ${x + 6} ${y + 13} H ${x + 10}`, c, 1.1); break;
    case 'dinheiro': {
      circulo(page, cx, cy, 7.5, undefined, c, 1.4);
      const w = ctx.b.widthOfTextAtSize('$', 10); page.drawText('$', { x: cx - w / 2, y: H - (cy + 3.6), size: 10, font: ctx.b, color: c }); break;
    }
    case 'alerta': traco(page, `M ${cx} ${y + 1.5} L ${x + 17} ${y + 16} H ${x + 1} Z`, c, 1.4); traco(page, `M ${cx} ${y + 6.5} V ${y + 11} M ${cx} ${y + 13} V ${y + 13.8}`, c, 1.6); break;
    case 'check': traco(page, `M ${x + 2} ${cy} L ${x + 7} ${y + 14} L ${x + 16} ${y + 4}`, c, 1.8); break;
    case 'pessoa': circulo(page, cx, y + 5.5, 3.6, undefined, c, 1.4); traco(page, `M ${x + 2.5} ${y + 17} A 6.5 6.5 0 0 1 ${x + 15.5} ${y + 17}`, c, 1.4); break;
    case 'moto': circulo(page, x + 4, y + 13, 3.5, undefined, c, 1.3); circulo(page, x + 14.5, y + 13, 3.5, undefined, c, 1.3); traco(page, `M ${x + 4} ${y + 13} L ${x + 8} ${y + 6} H ${x + 12} L ${x + 14.5} ${y + 13} M ${x + 11} ${y + 6} L ${x + 12.5} ${y + 3.5}`, c, 1.3); break;
    case 'caminhao': caixa(page, x + 1, y + 4, 10, 9, 0, undefined, c, 1.3); traco(page, `M ${x + 11} ${y + 7} H ${x + 14.5} L ${x + 17} ${y + 10} V ${y + 13} H ${x + 11}`, c, 1.3); circulo(page, x + 5, y + 15, 2, undefined, c, 1.2); circulo(page, x + 14, y + 15, 2, undefined, c, 1.2); break;
    case 'troca': traco(page, `M ${x + 2} ${y + 6} H ${x + 15} M ${x + 11.5} ${y + 2.5} L ${x + 15} ${y + 6} L ${x + 11.5} ${y + 9.5} M ${x + 16} ${y + 12.5} H ${x + 3} M ${x + 6.5} ${y + 9} L ${x + 3} ${y + 12.5} L ${x + 6.5} ${y + 16}`, c, 1.4); break;
    default: circulo(page, cx, cy, 7.5, undefined, c, 1.4); circulo(page, cx, cy, 3.5, undefined, c, 1.4); // alvo
  }
  void s;
}

// ---------------------------------------------------------------- estrutura de página
type Fundo = 'claro' | 'alternativo' | 'escuro';
function novaPagina(ctx: Ctx, fundo: Fundo) {
  const page = ctx.pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: fundo === 'escuro' ? C.escuro : fundo === 'alternativo' ? C.alt : C.claro });
  if (fundo !== 'escuro') {
    const w = ctx.n.widthOfTextAtSize(RODAPE, 13);
    page.drawText(RODAPE, { x: W - M - w, y: H - 781, size: 13, font: ctx.n, color: C.rodape });
  }
  return page;
}
/** Rótulo (laranja, espaçado) + título da página. Devolve o topo do conteúdo. */
function cabecalho(ctx: Ctx, page: PDFPage, rotulo: string, titulo: string, escuro: boolean) {
  espacado(page, limpar(ctx, rotulo).toUpperCase(), M, 113, 17, ctx.b, escuro ? C.laranjaClaro : C.laranja, 0.22);
  let size = 44;
  const t = limpar(ctx, titulo);
  while (size > 30 && larguraTitulo(t, size, ctx.b, -0.02) > UTIL) size -= 2;
  apertado(page, t, M, 176, size, ctx.b, escuro ? C.tituloEscuro : C.titulo, -0.02);
  return 189;
}

function nota(ctx: Ctx, page: PDFPage | null, n: Nota, top: number, escuro: boolean): number {
  const o = { w: UTIL - 56 - 4, size: 19, lh: 30.4 };
  const pre: Run | undefined = n.destaque ? { t: limpar(ctx, n.destaque) + ' ', b: true, cor: escuro ? C.laranjaClaro : C.laranja } : undefined;
  const h = para(ctx, null, n.texto, { ...o, x: 0, top: 0, cor: C.corpo, prefixo: pre }) + 48;
  if (page) {
    caixa(page, M, top, UTIL, h, 4, escuro ? C.cardEscuro : C.branco);
    page.drawRectangle({ x: M, y: H - top - h, width: 4, height: h, color: C.laranja });
    para(ctx, page, n.texto, { ...o, x: M + 4 + 28, top: top + 24, cor: escuro ? C.notaEscura : C.notaTexto, corB: escuro ? C.branco : C.forte, prefixo: pre });
  }
  return h;
}
/** Nota no rodapé da página: encostada em 780, ou logo abaixo do conteúdo se ele descer. */
function notaNoFim(ctx: Ctx, page: PDFPage, n: Nota | undefined, fimConteudo: number, escuro: boolean) {
  if (!n?.texto) return;
  const h = nota(ctx, null, n, 0, escuro);
  nota(ctx, page, n, Math.max(fimConteudo + 24, (escuro ? 780 : 758) - h), escuro);
}

// ---------------------------------------------------------------- capa
function capa(ctx: Ctx, s: ManualSpec) {
  const page = novaPagina(ctx, 'escuro');
  espacado(page, limpar(ctx, s.area).toUpperCase(), M, 113, 17, ctx.b, C.laranjaClaro, 0.22);
  const lw = 160, lh = lw * ctx.logo.height / ctx.logo.width;
  page.drawImage(ctx.logo, { x: W - M - lw, y: H - 80 - lh, width: lw, height: lh });

  let tit = limpar(ctx, s.titulo).trim();
  if (!/[.!?]$/.test(tit)) tit += '.';
  let size = 80;
  while (size > 56 && larguraTitulo(tit, size, ctx.b, -0.035) > 1150) size -= 4;
  const linhas = quebrar(ctx, [{ t: tit, b: true }], size, 1150);
  const lhT = size * 1.08;
  linhas.forEach((l, i) => {
    const base = 362 - (linhas.length - 1 - i) * lhT;
    apertado(page, l.pecas.map((p) => p.t).join(' '), M, base, size, ctx.b, C.tituloEscuro, -0.035);
  });
  para(ctx, page, s.subtitulo, { x: M, top: 410, w: 1000, size: 25, lh: 38.75, cor: C.subCapa, corB: C.branco });

  let x = M;
  for (const chip of (s.chips ?? []).slice(0, 6)) {
    const t = limpar(ctx, chip).trim();
    if (!t) continue;
    const w = ctx.n.widthOfTextAtSize(t, 19) + 44;
    if (x + w > W - M) break;
    caixa(page, x, 670, w, 53, 26.5, C.chip);
    page.drawText(t, { x: x + 22, y: H - 703, size: 19, font: ctx.n, color: C.chipTexto });
    x += w + 18;
  }
}

// ---------------------------------------------------------------- cards (visão geral, emissão, cuidados)
function paginaCards(ctx: Ctx, p: Extract<Pagina, { tipo: 'cards' }>) {
  const fundo: Fundo = p.fundo ?? 'claro';
  const escuro = fundo === 'escuro';
  const cards = (p.cards ?? []).slice(0, 6);
  const colunas = cards.length > 4 ? 3 : 2;
  const gap = 26, cw = (UTIL - gap * (colunas - 1)) / colunas;
  const notaH = p.nota?.texto ? nota(ctx, null, p.nota, 0, escuro) + 24 : 0;
  const topo = escuro ? 240 : 245;
  const limite = 780 - notaH;

  // Reduz a escala até caber.
  let k = 1, linhasH: number[] = [];
  const medida = (c: any, k: number) => {
    const temIcone = !escuro && !!c.icone;
    return 30 + (temIcone ? 34 : 0)
      + altura(ctx, c.titulo, { w: cw - 64, size: 25 * k, lh: 30 * k, fonteN: ctx.b }) + 12 * k
      + altura(ctx, c.texto, { w: cw - 64, size: 18.5 * k, lh: 31 * k }) + 28;
  };
  for (k of [1, 0.93, 0.86, 0.8, 0.74]) {
    linhasH = [];
    for (let i = 0; i < cards.length; i += colunas) {
      linhasH.push(Math.max(escuro ? 190 : 206, ...cards.slice(i, i + colunas).map((c) => medida(c, k))));
    }
    if (topo + linhasH.reduce((a, b) => a + b, 0) + gap * (linhasH.length - 1) <= limite) break;
  }

  const page = novaPagina(ctx, fundo);
  cabecalho(ctx, page, p.rotulo, p.titulo, escuro);
  let y = topo;
  linhasH.forEach((hL, li) => {
    cards.slice(li * colunas, li * colunas + colunas).forEach((c, ci) => {
      const x = M + ci * (cw + gap);
      caixa(page, x, y, cw, hL, 16, escuro ? C.cardEscuro : C.branco, escuro ? undefined : C.borda);
      let cy = y + 30;
      if (!escuro && c.icone) { icone(ctx, page, c.icone, x + 32, cy); cy += 34; }
      cy += para(ctx, page, c.titulo, { x: x + 32, top: cy, w: cw - 64, size: 25 * k, lh: 30 * k, cor: escuro ? C.tituloEscuro : C.titulo, fonteN: ctx.b });
      cy += 12 * k;
      para(ctx, page, c.texto, { x: x + 32, top: cy, w: cw - 64, size: 18.5 * k, lh: 31 * k, cor: escuro ? C.subCapa : C.corpo, corB: escuro ? C.branco : C.forte });
    });
    y += hL + gap;
  });
  notaNoFim(ctx, page, p.nota, y - gap, escuro);
}

// ---------------------------------------------------------------- passo a passo
function paginaPassos(ctx: Ctx, p: Extract<Pagina, { tipo: 'passos' }>) {
  const passos = (p.passos ?? []).slice(0, 7);
  const n = Math.max(1, passos.length);
  const seta = 36;
  const sw = Math.min(260, (UTIL - seta * (n - 1)) / n);
  const topo = 235;
  const notaH = p.nota?.texto ? nota(ctx, null, p.nota, 0, false) + 52 : 0;
  let k = 1, tituloH = 0, textoH = 0, hTotal = 0;
  for (k of [1, 0.93, 0.86, 0.8]) {
    tituloH = Math.max(52 * k, ...passos.map((s) => altura(ctx, s.titulo, { w: sw - 28, size: 20.5 * k, lh: 25.6 * k, fonteN: ctx.b })));
    textoH = Math.max(0, ...passos.map((s) => altura(ctx, s.texto, { w: sw - 28, size: 15 * k, lh: 23.25 * k })));
    hTotal = 20 + 50 + 14 + tituloH + 10 + textoH + (passos.some((s) => s.tag) ? 16 + 25 : 0) + 18;
    if (topo + hTotal <= 780 - notaH) break;
  }

  const page = novaPagina(ctx, 'alternativo');
  cabecalho(ctx, page, p.rotulo, p.titulo, false);
  passos.forEach((s, i) => {
    const x = M + i * (sw + seta);
    caixa(page, x, topo, sw, hTotal, 14, C.branco, C.borda);
    numero(ctx, page, String(i + 1), x + sw / 2, topo + 45, 25, 24);
    let y = topo + 84;
    const hT = altura(ctx, s.titulo, { w: sw - 28, size: 20.5 * k, lh: 25.6 * k, fonteN: ctx.b });
    para(ctx, page, s.titulo, { x: x + 14, top: y, w: sw - 28, size: 20.5 * k, lh: 25.6 * k, cor: C.titulo, fonteN: ctx.b, align: 'center' });
    y += Math.max(tituloH, hT) + 10;
    para(ctx, page, s.texto, { x: x + 14, top: y, w: sw - 28, size: 15 * k, lh: 23.25 * k, cor: C.corpo, corB: C.forte, align: 'center' });
    if (s.tag) {
      const t = limpar(ctx, s.tag).toUpperCase();
      const tw = espacado(null, t, 0, 0, 13, ctx.b, null, 0.06) + 22;
      const ty = topo + hTotal - 18 - 25;
      const cor = tagCor(s.cor);
      caixa(page, x + (sw - tw) / 2, ty, tw, 25, 6, hex(cor.bg));
      espacado(page, t, x + (sw - tw) / 2 + 11, ty + 17.3, 13, ctx.b, hex(cor.fg), 0.06);
    }
    if (i < passos.length - 1) {
      const aw = ctx.n.widthOfTextAtSize('→', 22);
      page.drawText('→', { x: x + sw + (seta - aw) / 2, y: H - (topo + hTotal / 2 + 7), size: 22, font: ctx.n, color: C.laranja });
    }
  });
  notaNoFim(ctx, page, p.nota, topo + hTotal, false);
}

// ---------------------------------------------------------------- comparativo (dois caminhos / lado a lado)
function paginaComparativo(ctx: Ctx, p: Extract<Pagina, { tipo: 'comparativo' }>) {
  const lados = (p.lados ?? []).slice(0, 2);
  const gap = 26, bw = (UTIL - gap) / 2, kw = 170, vw = bw - 64 - kw - 14;
  const topo = 240;
  const notaH = p.nota?.texto ? nota(ctx, null, p.nota, 0, false) + 24 : 0;
  let k = 1, hCaixa = 0;
  const linhaH = (l: any, k: number) => Math.max(
    altura(ctx, l.campo, { w: kw, size: 17.5 * k, lh: 26.25 * k, fonteN: ctx.b }),
    altura(ctx, l.valor, { w: vw, size: 17.5 * k, lh: 26.25 * k }),
  ) + 26 * k;
  for (k of [1, 0.92, 0.85, 0.78]) {
    hCaixa = Math.max(...lados.map((l) => 28 + 30 + 20 + (l.linhas ?? []).slice(0, 8).reduce((t, r) => t + linhaH(r, k), 0) + 28));
    if (topo + hCaixa <= 780 - notaH) break;
  }
  const page = novaPagina(ctx, 'claro');
  cabecalho(ctx, page, p.rotulo, p.titulo, false);
  lados.forEach((l, i) => {
    const x = M + i * (bw + gap);
    const cor = tagCor(l.cor ?? (i === 0 ? 'verde' : 'cinza'));
    caixa(page, x, topo, bw, hCaixa, 16, C.branco, C.borda);
    circulo(page, x + 32 + 6, topo + 28 + 15, 6, hex(cor.ponto));
    page.drawText(limpar(ctx, l.nome), { x: x + 32 + 24, y: H - (topo + 28 + 24), size: 25, font: ctx.b, color: C.titulo });
    if (l.selo) {
      const t = limpar(ctx, l.selo), tw = ctx.b.widthOfTextAtSize(t, 14) + 22;
      caixa(page, x + bw - 32 - tw, topo + 28 + 1, tw, 28, 6, hex(cor.bg));
      page.drawText(t, { x: x + bw - 32 - tw + 11, y: H - (topo + 28 + 19.5), size: 14, font: ctx.b, color: hex(cor.fg) });
    }
    let y = topo + 28 + 30 + 20;
    for (const r of (l.linhas ?? []).slice(0, 8)) {
      const h = linhaH(r, k);
      page.drawLine({ start: { x: x + 32, y: H - y }, end: { x: x + bw - 32, y: H - y }, thickness: 1, color: C.linha });
      para(ctx, page, r.campo, { x: x + 32, top: y + 13 * k, w: kw, size: 17.5 * k, lh: 26.25 * k, cor: C.forte, fonteN: ctx.b });
      para(ctx, page, r.valor, { x: x + 32 + kw + 14, top: y + 13 * k, w: vw, size: 17.5 * k, lh: 26.25 * k, cor: C.corpo, corB: C.forte });
      y += h;
    }
  });
  notaNoFim(ctx, page, p.nota, topo + hCaixa, false);
}

// ---------------------------------------------------------------- tela (simulação da tela ou imagem enviada) + legenda
async function paginaTela(ctx: Ctx, p: Extract<Pagina, { tipo: 'tela' }>, imagem?: { bytes: Uint8Array; tipo: string }) {
  const page = novaPagina(ctx, 'claro');
  cabecalho(ctx, page, p.rotulo, p.titulo, false);
  const wx = M, wy = 232, ww = 842, wh = 430;
  caixa(page, wx, wy, ww, wh, 16, C.branco, C.borda);

  if (p.usar_imagem && imagem) {
    const img = /png/i.test(imagem.tipo) ? await ctx.pdf.embedPng(imagem.bytes) : await ctx.pdf.embedJpg(imagem.bytes);
    const maxW = ww - 28, maxH = wh - 28;
    const e = Math.min(maxW / img.width, maxH / img.height);
    const iw = img.width * e, ih = img.height * e, ix = wx + (ww - iw) / 2, iy = wy + (wh - ih) / 2;
    page.drawImage(img, { x: ix, y: H - iy - ih, width: iw, height: ih });
    caixa(page, ix, iy, iw, ih, 0, undefined, C.borda);
    for (const mk of (p.marcadores ?? []).slice(0, 9)) {
      const mx = ix + Math.min(100, Math.max(0, Number(mk.x))) / 100 * iw;
      const my = iy + Math.min(100, Math.max(0, Number(mk.y))) / 100 * ih;
      numero(ctx, page, String(mk.numero), mx, my, 13, 13, true);
    }
  } else if (p.tela) {
    desenharTela(ctx, page, p.tela, wx + 70, wy + 14, ww - 140, wh - 28);
  }

  // Legenda à direita.
  const lx = 978, lwid = W - M - lx;
  const itens = (p.legenda ?? []).slice(0, 7);
  let k = 1, gap = 26;
  const hItem = (it: any, k: number) => 24 * k + 4 + altura(ctx, it.texto, { w: lwid - 52, size: 16.5 * k, lh: 25.6 * k });
  for (k of [1, 0.92, 0.85, 0.78]) {
    gap = 26 * k;
    if (232 + itens.reduce((t, it) => t + Math.max(36, hItem(it, k)) + gap, 0) <= 780) break;
  }
  let y = 232;
  itens.forEach((it, i) => {
    numero(ctx, page, String(i + 1), lx + 18, y + 18, 18, 17);
    page.drawText(limpar(ctx, it.titulo), { x: lx + 52, y: H - (y + 19 * k), size: 19 * k, font: ctx.b, color: C.titulo });
    const hp = para(ctx, page, it.texto, { x: lx + 52, top: y + 24 * k + 4, w: lwid - 52, size: 16.5 * k, lh: 25.6 * k, cor: C.corpo, corB: C.forte });
    y += Math.max(36, 24 * k + 4 + hp) + gap;
  });
}

/** Simulação simples da tela do sistema (painel cinza com campos e marcadores numerados). */
function desenharTela(ctx: Ctx, page: PDFPage, tela: { titulo: string; caminho?: string; campos: CampoTela[] }, x: number, y: number, w: number, h: number) {
  caixa(page, x, y, w, h, 6, C.painel);
  const px = x + 22, pw = w - 44, fim = y + h - 16;
  let cy = y + 18;
  page.drawText(limpar(ctx, tela.titulo), { x: px, y: H - (cy + 13), size: 15, font: ctx.b, color: hex('#333333') });
  cy += 20;
  if (tela.caminho) { page.drawText(limpar(ctx, tela.caminho), { x: px, y: H - (cy + 9), size: 11, font: ctx.n, color: C.cinzaTexto }); cy += 22; } else cy += 6;
  const marca = (n: number | undefined, my: number, mx = x) => { if (n) numero(ctx, page, String(n), mx, my, 13, 13, true); };

  const campos = (tela.campos ?? []).slice(0, 10);
  let botao: CampoTela | undefined;
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    if (c.tipo === 'botao') { botao = c; continue; }
    // Dois campos "meia" seguidos ficam lado a lado.
    const par = c.meia && campos[i + 1]?.meia && campos[i + 1].tipo !== 'botao' ? [c, campos[++i]] : [c];
    const colW = par.length === 2 ? (pw - 14) / 2 : pw;
    let hLinha = 0;
    par.forEach((cc, j) => {
      const cx = px + j * (colW + 14);
      const hh = campoTela(ctx, page, cc, cx, cy, colW, fim, true);
      if (cy + hh > fim) return;
      campoTela(ctx, page, cc, cx, cy, colW, fim, false);
      marca(cc.marcador, cy + 8, j === 0 ? x : cx - 22 + 0);
      hLinha = Math.max(hLinha, hh);
    });
    if (!hLinha) break;
    cy += hLinha + 4;
  }
  if (botao) {
    const t = limpar(ctx, botao.valor ?? botao.rotulo ?? 'Confirmar');
    const bw = ctx.b.widthOfTextAtSize(t, 12) + 28;
    const bx = x + w - 22 - bw, by = y + h - 16 - 32;
    caixa(page, bx, by, bw, 32, 6, C.botao);
    page.drawText(t, { x: bx + 14, y: H - (by + 20.5), size: 12, font: ctx.b, color: C.branco });
    marca(botao.marcador, by + 16, bx + bw + 24);
  }
}

/** Desenha (ou mede, com medir = true) um campo da tela; devolve a altura. */
function campoTela(ctx: Ctx, page: PDFPage, c: CampoTela, x: number, y: number, w: number, _fim: number, medir: boolean): number {
  const cor = hex('#333333');
  let cy = y;
  const rot = c.rotulo && c.tipo !== 'resumo' && c.tipo !== 'texto' ? limpar(ctx, c.rotulo) : '';
  if (rot) { if (!medir) page.drawText(rot, { x, y: H - (cy + 9), size: 10.5, font: ctx.n, color: hex('#555555') }); cy += 15; }
  switch (c.tipo) {
    case 'opcoes': {
      let ox = x;
      for (const o of (c.opcoes ?? []).slice(0, 5)) {
        const t = limpar(ctx, o), sel = c.selecionada && o === c.selecionada;
        const f = sel ? ctx.b : ctx.n, tw = f.widthOfTextAtSize(t, 11) + 20;
        if (!medir) {
          caixa(page, ox, cy, tw, 26, 6, sel ? C.selecionado : C.branco, C.campoBorda);
          page.drawText(t, { x: ox + 10, y: H - (cy + 16.8), size: 11, font: f, color: cor });
        }
        ox += tw + 6;
      }
      cy += 26 + 10;
      break;
    }
    case 'tabela': {
      const cols = (c.colunas ?? []).slice(0, 6), linhas = (c.linhas ?? []).slice(0, 5);
      const hT = 12 + 18 + linhas.length * 22;
      if (!medir) {
        caixa(page, x, cy, w, hT, 8, C.branco, hex('#E2E2E5'));
        const cw = (w - 20) / Math.max(1, cols.length);
        // Primeira coluna mais larga (descrição).
        const larg = cols.map((_, i) => (cols.length > 2 ? (i === 0 ? cw * 2 : cw * (cols.length - 2) / (cols.length - 1)) : cw));
        let tx = x + 10;
        cols.forEach((col, i) => { page.drawText(limpar(ctx, col).toUpperCase().slice(0, 30), { x: tx, y: H - (cy + 18), size: 9.5, font: ctx.n, color: hex('#888888') }); tx += larg[i]; });
        page.drawLine({ start: { x: x + 10, y: H - (cy + 24) }, end: { x: x + w - 10, y: H - (cy + 24) }, thickness: 0.8, color: hex('#EEEEEE') });
        linhas.forEach((l, r) => {
          let lx = x + 10;
          const ly = cy + 30 + r * 22;
          cols.forEach((_, i) => {
            let t = limpar(ctx, l[i] ?? '');
            while (t && ctx.n.widthOfTextAtSize(t, 11) > larg[i] - 8) t = t.slice(0, -1);
            page.drawText(t, { x: lx, y: H - (ly + 12), size: 11, font: ctx.n, color: cor });
            lx += larg[i];
          });
          if (r < linhas.length - 1) page.drawLine({ start: { x: x + 10, y: H - (ly + 19) }, end: { x: x + w - 10, y: H - (ly + 19) }, thickness: 0.6, color: hex('#F2F2F2') });
        });
      }
      cy += hT + 10;
      break;
    }
    case 'texto': {
      const hP = para(ctx, medir ? null : page, c.valor ?? c.rotulo ?? '', { x, top: cy, w, size: 11, lh: 15, cor: C.cinzaTexto });
      cy += hP + 8;
      break;
    }
    case 'resumo': {
      if (!medir) {
        page.drawText(limpar(ctx, c.rotulo ?? ''), { x, y: H - (cy + 11), size: 12, font: ctx.n, color: C.cinzaTexto });
        const v = limpar(ctx, c.valor ?? ''), vw = ctx.b.widthOfTextAtSize(v, 12.5);
        page.drawText(v, { x: x + w - vw, y: H - (cy + 11), size: 12.5, font: ctx.b, color: cor });
      }
      cy += 22;
      break;
    }
    default: { // campo
      if (!medir) {
        caixa(page, x, cy, w, 30, 6, C.branco, C.campoBorda);
        let t = limpar(ctx, c.valor ?? '');
        while (t && ctx.n.widthOfTextAtSize(t, 12) > w - 22) t = t.slice(0, -1);
        page.drawText(t, { x: x + 10, y: H - (cy + 19.5), size: 12, font: ctx.n, color: cor });
      }
      cy += 30 + 10;
    }
  }
  return cy - y;
}

// ---------------------------------------------------------------- tabela (etapa por etapa), com continuação
function paginaTabela(ctx: Ctx, p: Extract<Pagina, { tipo: 'tabela' }>) {
  const cols = (p.colunas ?? []).slice(0, 6).map((c) => limpar(ctx, c));
  if (!cols.length) return;
  const tagIdx = typeof p.coluna_tag === 'number' ? p.coluna_tag : -1;
  const linhas = (p.linhas ?? []).slice(0, 60);
  // Larguras: 1ª coluna e coluna de tag pelo conteúdo; o resto dividido pelo tamanho médio do texto.
  const txt = (l: any, i: number) => limpar(ctx, l.celulas?.[i] ?? '').replace(/\*\*/g, '');
  const larg: number[] = cols.map(() => 0);
  const fixas = new Set<number>();
  cols.forEach((c, i) => {
    if (i === tagIdx) {
      larg[i] = Math.max(ctx.b.widthOfTextAtSize(c, 18), ...linhas.map((l) => ctx.b.widthOfTextAtSize(txt(l, i), 13.5) + 20)) + 40;
      fixas.add(i);
    } else if (i === 0 && cols.length > 2) {
      larg[i] = Math.min(300, Math.max(ctx.b.widthOfTextAtSize(c, 18), ...linhas.map((l) => ctx.b.widthOfTextAtSize(txt(l, i), 16.5))) + 40);
      fixas.add(i);
    }
  });
  const livres = cols.map((_, i) => i).filter((i) => !fixas.has(i));
  const sobra = UTIL - larg.reduce((a, b) => a + b, 0);
  const pesos = livres.map((i) => Math.max(12, cols[i].length, linhas.reduce((t, l) => t + txt(l, i).length, 0) / Math.max(1, linhas.length)));
  const somaP = pesos.reduce((a, b) => a + b, 0) || 1;
  livres.forEach((i, j) => { larg[i] = Math.max(160, sobra * pesos[j] / somaP); });
  const ajuste = UTIL / larg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < larg.length; i++) larg[i] *= ajuste;

  const thH = 18 * 1.3 + 40;
  const cel = (s: string, i: number) => i === tagIdx ? 31 : altura(ctx, s, { w: larg[i] - 36, size: 16.5, lh: 25.6, fonteN: i === 0 ? ctx.b : undefined });
  const alturaLinha = (l: any) => Math.max(...cols.map((_, i) => cel(limpar(ctx, l.celulas?.[i] ?? ''), i))) + 30;
  const notaH = p.nota?.texto ? nota(ctx, null, p.nota, 0, false) + 24 : 0;

  let i = 0, pagina = 0;
  while (i < linhas.length || pagina === 0) {
    const page = novaPagina(ctx, 'claro');
    cabecalho(ctx, page, p.rotulo, pagina ? `${p.titulo} (continuação)` : p.titulo, false);
    const topo = 240;
    const resto = linhas.slice(i);
    const limiteBase = 760;
    // Quanto cabe nesta página.
    let h = thH, fim = i;
    for (const l of resto) {
      const hl = alturaLinha(l);
      const ultima = fim === linhas.length - 1;
      if (topo + h + hl > (ultima ? limiteBase - notaH : limiteBase) && fim > i) break;
      h += hl; fim++;
    }
    caixa(page, M, topo, UTIL, h, 4, C.branco, C.borda);
    caixa(page, M + 0.5, topo + 0.5, UTIL - 1, thH, 3.5, C.thFundo);
    page.drawRectangle({ x: M + 0.5, y: H - (topo + thH), width: UTIL - 1, height: 4, color: C.thFundo });
    let x = M;
    cols.forEach((c, ci) => {
      page.drawText(c, { x: x + 18, y: H - (topo + 20 + 17), size: 18, font: ctx.b, color: C.titulo });
      x += larg[ci];
    });
    let y = topo + thH;
    for (const l of linhas.slice(i, fim)) {
      const hl = alturaLinha(l);
      page.drawLine({ start: { x: M, y: H - y }, end: { x: M + UTIL, y: H - y }, thickness: 1, color: C.tdLinha });
      let cx = M;
      cols.forEach((_, ci) => {
        const v = limpar(ctx, l.celulas?.[ci] ?? '');
        if (ci === tagIdx && v) {
          const cor = tagCor(l.cor), tw = ctx.b.widthOfTextAtSize(v.replace(/\*\*/g, ''), 13.5) + 20;
          caixa(page, cx + 18, y + 15, tw, 31, 6, hex(cor.bg));
          page.drawText(v.replace(/\*\*/g, ''), { x: cx + 28, y: H - (y + 15 + 20.5), size: 13.5, font: ctx.b, color: hex(cor.fg) });
        } else {
          para(ctx, page, v, { x: cx + 18, top: y + 15, w: larg[ci] - 36, size: 16.5, lh: 25.6, cor: ci === 0 ? C.titulo : C.tdTexto, corB: ci === 0 ? C.titulo : C.forte, fonteN: ci === 0 ? ctx.b : undefined });
        }
        cx += larg[ci];
      });
      y += hl;
    }
    // Divisórias verticais.
    let vx = M;
    for (let ci = 0; ci < cols.length - 1; ci++) {
      vx += larg[ci];
      page.drawLine({ start: { x: vx, y: H - topo }, end: { x: vx, y: H - (topo + h) }, thickness: 1, color: C.tdLinha });
    }
    i = fim;
    pagina++;
    if (i >= linhas.length) { notaNoFim(ctx, page, p.nota, topo + h, false); break; }
  }
}

// ---------------------------------------------------------------- montagem
export async function gerarManual(spec: ManualSpec, imagem?: { bytes: Uint8Array; tipo: string }): Promise<Uint8Array> {
  const r = recursos();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const n = await pdf.embedFont(r.f400, { subset: true });
  const m = await pdf.embedFont(r.f500, { subset: true });
  const b = await pdf.embedFont(r.f700, { subset: true });
  const logo = await pdf.embedPng(r.logo);
  const chars = new Set<number>([...n.getCharacterSet(), ...b.getCharacterSet()]);
  const ctx: Ctx = { pdf, n, m, b, logo, chars };

  const titulo = limpar(ctx, spec.titulo).replace(/\.$/, '');
  pdf.setTitle(`Manual - ${titulo}`);
  pdf.setAuthor(RODAPE);
  pdf.setCreator('Cérebro 299');
  pdf.setProducer('Cérebro 299');
  pdf.setLanguage('pt-BR');

  capa(ctx, spec);
  for (const p of (spec.paginas ?? []).slice(0, 14)) {
    switch (p?.tipo) {
      case 'cards': paginaCards(ctx, p); break;
      case 'passos': paginaPassos(ctx, p); break;
      case 'comparativo': paginaComparativo(ctx, p); break;
      case 'tela': await paginaTela(ctx, p, imagem); break;
      case 'tabela': paginaTabela(ctx, p); break;
    }
  }
  return await pdf.save();
}

/** Nome do arquivo no padrão dos manuais: "MANUAL - TITULO.pdf". */
export const nomeManual = (titulo: string) =>
  `MANUAL - ${String(titulo).replace(/\.$/, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().toUpperCase().slice(0, 80)}.pdf`;
