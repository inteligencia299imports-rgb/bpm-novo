// deno-lint-ignore-file no-explicit-any
// Excel e PDF das listas pedidas ao agente (a partir das linhas de uma consulta).
import * as XLSX from 'npm:xlsx@0.18.5';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

type Linha = Record<string, unknown>;

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Planilha .xlsx com cabeçalho e as linhas. */
export function gerarExcel(titulo: string, linhas: Linha[]): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : v]))));
  const cols = Object.keys(linhas[0] ?? {});
  ws['!cols'] = cols.map((c) => ({ wch: Math.min(50, Math.max(c.length, ...linhas.slice(0, 200).map((l) => texto(l[c]).length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Dados');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// Fonte padrão do PDF (WinAnsi): troca o que ela não desenha.
const seguro = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

/** PDF em paisagem, tabela simples com cabeçalho repetido em cada página. */
export async function gerarPdf(titulo: string, linhas: Linha[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [L, A] = [842, 595]; // A4 paisagem
  const margem = 28;
  const tam = 7.5;
  const alturaLinha = 12;
  const cols = Object.keys(linhas[0] ?? {});
  const util = L - margem * 2;
  // Largura de cada coluna proporcional ao conteúdo (com teto).
  const pesos = cols.map((c) => Math.min(40, Math.max(c.length, ...linhas.slice(0, 300).map((l) => texto(l[c]).length), 4)));
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const larguras = pesos.map((p) => (p / soma) * util);
  // Texto que passa da coluna é cortado com "..".
  const caber = (s: string, w: number, f = fonte) => {
    const inteiro = seguro(s);
    if (f.widthOfTextAtSize(inteiro, tam) <= w - 4) return inteiro;
    let t = inteiro;
    while (t && f.widthOfTextAtSize(`${t}..`, tam) > w - 4) t = t.slice(0, -1);
    return `${t}..`;
  };

  let pagina = pdf.addPage([L, A]);
  let y = A - margem;
  const cabecalho = (primeira: boolean) => {
    if (primeira) {
      pagina.drawText(seguro(titulo), { x: margem, y: y - 12, size: 13, font: negrito, color: rgb(0.1, 0.1, 0.1) });
      const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      pagina.drawText(seguro(`${linhas.length} registros · gerado em ${data} · Inteligência 299`), { x: margem, y: y - 26, size: 8, font: fonte, color: rgb(0.4, 0.4, 0.4) });
      y -= 40;
    }
    pagina.drawRectangle({ x: margem, y: y - alturaLinha + 3, width: util, height: alturaLinha, color: rgb(0.12, 0.16, 0.22) });
    let x = margem;
    cols.forEach((c, i) => {
      pagina.drawText(caber(c, larguras[i], negrito), { x: x + 2, y: y - 6, size: tam, font: negrito, color: rgb(1, 1, 1) });
      x += larguras[i];
    });
    y -= alturaLinha;
  };
  cabecalho(true);
  linhas.forEach((l, n) => {
    if (y < margem + alturaLinha) {
      pagina = pdf.addPage([L, A]);
      y = A - margem;
      cabecalho(false);
    }
    if (n % 2 === 1) pagina.drawRectangle({ x: margem, y: y - alturaLinha + 3, width: util, height: alturaLinha, color: rgb(0.95, 0.95, 0.95) });
    let x = margem;
    cols.forEach((c, i) => {
      pagina.drawText(caber(texto(l[c]), larguras[i]), { x: x + 2, y: y - 6, size: tam, font: fonte, color: rgb(0.1, 0.1, 0.1) });
      x += larguras[i];
    });
    y -= alturaLinha;
  });
  return await pdf.save();
}

/** Nome de arquivo seguro a partir do título. */
export const nomeArquivo = (titulo: string, ext: string) =>
  `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'dados'}.${ext}`;
