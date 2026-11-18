// OCR de documentos no navegador (Tesseract.js) — substitui a leitura por IA nas funções
// extrair-dados-* (pedido do usuário, 2026-11-18: mais econômico, mesma lógica).
//
// Devolve o TEXTO do documento; quem lê os campos e confere com o cadastro continua sendo a Edge
// Function (supabase/functions/_shared/ocr-documentos.ts). Quando o texto não basta, a função usa
// a IA como antes — por isso qualquer falha aqui só devolve null (nunca trava o anexo).
//
//   - PDF com camada de texto (CRLV-e, ATPV-e, Cartão CNPJ): texto direto, sem OCR (instantâneo).
//   - PDF-imagem (CNH Digital) e fotos: OCR Tesseract em português, no próprio navegador.
import { textoPdfUtil, textoPosicional } from '../../supabase/functions/_shared/ocr-documentos';

const TEMPO_MAXIMO_MS = 60_000;
const MAX_PAGINAS = 2;

type WorkerTesseract = { recognize: (img: any, opts?: any) => Promise<{ data: { text: string } }> };
let workerPromise: Promise<WorkerTesseract> | null = null;

/** Um worker só por aba (o modelo de português é baixado uma vez e fica em cache no navegador). */
function workerOcr(): Promise<WorkerTesseract> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('por') as unknown as Promise<WorkerTesseract>)
      .catch((e) => {
        workerPromise = null;
        throw e;
      });
  }
  return workerPromise;
}

async function ocrImagem(img: Blob | HTMLCanvasElement): Promise<string> {
  const worker = await workerOcr();
  const { data } = await worker.recognize(img, { rotateAuto: true });
  return data.text || '';
}

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

async function textoDoPdf(bytes: ArrayBuffer): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const paginas = Math.min(doc.numPages, MAX_PAGINAS);

  // 1) camada de texto
  let texto = '';
  for (let p = 1; p <= paginas; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    texto += textoPosicional(tc.items as { str?: string; transform?: number[] }[]) + '\n';
  }
  if (textoPdfUtil(texto)) return texto;

  // 2) PDF-imagem: renderiza a página em alta resolução e passa no OCR
  let ocr = '';
  for (let p = 1; p <= paginas; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    ocr += (await ocrImagem(canvas)) + '\n';
  }
  return `${texto}\n${ocr}`;
}

async function lerTexto(url: string): Promise<string | null> {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  const ehPdf = /\.pdf(\?|$)/i.test(url) || blob.type === 'application/pdf';
  const texto = ehPdf ? await textoDoPdf(await blob.arrayBuffer()) : await ocrImagem(blob);
  return texto.trim() ? texto.slice(0, 30_000) : null;
}

/**
 * Texto do documento anexado (PDF ou imagem) para as funções extrair-dados-*.
 * null = não deu para ler (a função usa a IA).
 */
export async function lerTextoDocumento(url: string): Promise<string | null> {
  try {
    return await Promise.race([
      lerTexto(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TEMPO_MAXIMO_MS)),
    ]);
  } catch (e) {
    console.warn('OCR do documento falhou (a conferência usa a IA):', e);
    return null;
  }
}
