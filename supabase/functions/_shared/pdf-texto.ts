// Texto da camada de texto de um PDF (sem OCR e sem IA) — para os PDFs gerados pela SERPRO/Detran
// (ATPV-e, CRLV-e, código de segurança do CRV), que trazem os dados como texto.
import { getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import { textoPosicional } from './ocr-documentos.ts';

export async function textoDoPdf(bytes: Uint8Array, maxPaginas = 3): Promise<string> {
  const doc = await getDocumentProxy(bytes);
  let texto = '';
  for (let p = 1; p <= Math.min(doc.numPages, maxPaginas); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    texto += textoPosicional(tc.items as { str?: string; transform?: number[] }[]) + '\n';
  }
  return texto;
}

export function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
