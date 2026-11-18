// Leitura de campos a partir do TEXTO de um documento (camada de texto do PDF ou OCR Tesseract
// feito no navegador — src/lib/ocrDocumento.ts). Substitui a leitura por IA quando o texto traz
// os campos com segurança; quando falta algo, as funções caem na IA como antes (pedido do
// usuário, 2026-11-18: "trocar pelo OCR, mais econômico, mantendo a mesma lógica").
//
// Regra de ouro (a mesma da IA): só devolve um valor quando ele foi lido com segurança — rótulo
// encontrado + formato válido (+ dígito verificador quando existe: CPF, CNPJ, RENAVAM). Nunca chuta.
// Os leitores nunca REJEITAM um documento: "não reconheci" vira null e a função usa a IA.
//
// Módulo puro (sem APIs do Deno) — testável no Node.

// ---------------------------------------------------------------- texto

/**
 * Texto da camada de texto de uma página de PDF (itens do pdf.js `getTextContent`) na ordem de
 * leitura: de cima para baixo, da esquerda para a direita. Nos PDFs do Detran/SERPRO os rótulos e
 * os valores ficam em blocos separados no arquivo — pela posição, o valor cai logo abaixo do rótulo.
 */
export function textoPosicional(itens: { str?: string; transform?: number[] }[]): string {
  const xs = itens
    .filter((it) => it.str && it.str.trim() && it.transform)
    .map((it) => ({ s: it.str!.trim(), x: it.transform![4], y: it.transform![5] }));
  xs.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));
  let out = '';
  let ultimoY: number | null = null;
  for (const it of xs) {
    if (ultimoY !== null) out += Math.abs(it.y - ultimoY) > 3 ? '\n' : '   ';
    out += it.s;
    ultimoY = it.y;
  }
  return out;
}

/** O texto do PDF traz dados (não só o modelo do formulário)? Senão é imagem: precisa de OCR. */
export function textoPdfUtil(texto: string): boolean {
  return (texto.match(/\d/g) || []).length >= 25 && /\d{9,}|\d{3}\.\d{3}\.\d{3}/.test(texto);
}

/** Maiúsculas sem acento, mantendo o MESMO comprimento do original (índices batem). */
export function normalizar(texto: string): string {
  let out = '';
  for (const ch of texto) {
    const base = ch.normalize('NFD')[0] ?? ch;
    const up = base.toUpperCase();
    out += up.length === 1 ? up : base;
    // caracteres fora do BMP ocupam 2 posições: completa para manter o alinhamento
    if (ch.length === 2) out += ' ';
  }
  return out;
}

/** Trecho do texto depois do primeiro rótulo encontrado (até `janela` caracteres). */
function aposRotulo(norm: string, rotulo: RegExp, janela: number): { ini: number; trecho: string } | null {
  const re = new RegExp(rotulo.source, rotulo.flags.includes('g') ? rotulo.flags : rotulo.flags + 'g');
  const m = re.exec(norm);
  if (!m) return null;
  const ini = m.index + m[0].length;
  return { ini, trecho: norm.slice(ini, ini + janela) };
}

/** Todas as ocorrências de um rótulo (para tentar a próxima quando a primeira não tem valor). */
function todosAposRotulo(norm: string, rotulo: RegExp, janela: number): { ini: number; trecho: string }[] {
  const re = new RegExp(rotulo.source, rotulo.flags.includes('g') ? rotulo.flags : rotulo.flags + 'g');
  const out: { ini: number; trecho: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const ini = m.index + m[0].length;
    out.push({ ini, trecho: norm.slice(ini, ini + janela) });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const soDig = (v: string) => v.replace(/\D/g, '');

// ---------------------------------------------------------------- validadores

export function cpfValido(v: string): boolean {
  const d = soDig(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
    const dv = ((s * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

export function cnpjValido(v: string): boolean {
  const d = soDig(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** RENAVAM: 11 dígitos (os antigos de 9 recebem zeros à esquerda) com dígito verificador. */
export function renavamNormalizado(v: string): string | null {
  let d = soDig(v);
  if (d.length === 9) d = '00' + d;
  if (d.length !== 11) return null;
  const base = d.slice(0, 10).split('').reverse();
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const s = base.reduce((acc, c, i) => acc + Number(c) * pesos[i], 0);
  let dv = 11 - (s % 11);
  if (dv >= 10) dv = 0;
  return dv === Number(d[10]) ? d : null;
}

/** Chassi (VIN): 17 caracteres sem I, O, Q — no OCR esses viram 1/0/0. */
function chassiDe(tok: string): string | null {
  const t = tok.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 17) return null;
  const c = t.replace(/O/g, '0').replace(/Q/g, '0').replace(/I/g, '1');
  // precisa ter letra e número (evita pegar sequência só de dígitos) e os 4 últimos numéricos
  if (!/[A-Z]/.test(c) || !/\d{4}$/.test(c)) return null;
  return c;
}

/** Placa antiga (LLLNNNN) ou Mercosul (LLLNLNN). Corrige O/0 e I/1 pela posição. */
function placaDe(tok: string): string | null {
  const t = tok.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 7) return null;
  const letra = (c: string) => (c === '0' ? 'O' : c === '1' ? 'I' : c);
  const num = (c: string) => (c === 'O' ? '0' : c === 'I' ? '1' : c);
  // 5º caractere: dígito (placa antiga) ou letra (Mercosul) — fica como veio.
  const placa = letra(t[0]) + letra(t[1]) + letra(t[2]) + num(t[3]) + t[4] + num(t[5]) + num(t[6]);
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa) ? placa : null;
}

/** "DD/MM/AAAA" válida -> "AAAA-MM-DD". */
function dataIso(dd: string, mm: string, aaaa: string): string | null {
  const d = Number(dd), m = Number(mm), a = Number(aaaa);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${aaaa}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

const RE_DATA = /\b(\d{2})\s?[/.\-]\s?(\d{2})\s?[/.\-]\s?(\d{4})\b/;

// ---------------------------------------------------------------- identificadores do veículo

function lerPlaca(norm: string): string | null {
  // "PLACA" (não "PLACA ANTERIOR"); valor na mesma linha ou nas seguintes
  for (const r of todosAposRotulo(norm, /\bPLACA\b(?!\s*ANTERIOR)/, 120)) {
    for (const tok of r.trecho.split(/[\s|:;,]+/)) {
      const p = placaDe(tok);
      if (p) return p;
    }
  }
  return null;
}

function lerChassi(norm: string): string | null {
  for (const r of todosAposRotulo(norm, /\bCHASSI\b/, 260)) {
    for (const tok of r.trecho.split(/[\s|:;,/*]+/)) {
      const c = chassiDe(tok);
      if (c) return c;
    }
  }
  // OCR de foto às vezes perde o rótulo: aceita um chassi só se for o ÚNICO candidato do texto.
  const candidatos = new Set(norm.split(/[\s|:;,/*]+/).map(chassiDe).filter((c): c is string => !!c));
  return candidatos.size === 1 ? [...candidatos][0] : null;
}

function lerRenavam(norm: string): string | null {
  for (const r of todosAposRotulo(norm, /RENAVAM/, 160)) {
    for (const m of r.trecho.matchAll(/\b\d{9,11}\b/g)) {
      const v = renavamNormalizado(m[0]);
      if (v) return v;
    }
  }
  return null;
}

function lerNumeroCrv(norm: string): string | null {
  for (const r of todosAposRotulo(norm, /N(?:UMERO|º|O\.?)\s*(?:DO\s*)?CRV\b/, 160)) {
    const m = /\b\d{12}\b/.exec(r.trecho);
    if (m) return m[0];
  }
  return null;
}

function lerCodigoSegurancaCrv(norm: string): string | null {
  for (const r of todosAposRotulo(norm, /CODIGO\s*DE\s*SEGURANCA/, 160)) {
    const m = /\b\d{11}\b/.exec(r.trecho);
    if (m) return m[0];
  }
  return null;
}

/** Nº do CRV (12 dígitos) e código de segurança do CRV/CLA (11 dígitos) — PDFs da SERPRO (RENAVE). */
export function lerCodigosCrv(texto: string): { numero_crv: string | null; codigo_seguranca_crv: string | null } {
  const norm = normalizar(texto || '');
  return { numero_crv: lerNumeroCrv(norm), codigo_seguranca_crv: lerCodigoSegurancaCrv(norm) };
}

// ---------------------------------------------------------------- CRLV

export interface CrlvLido {
  eh_crlv: boolean;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  numero_crv: string | null;
  codigo_seguranca_crv: string | null;
  tipo_crv: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  marca_documento: string | null;
  modelo_documento: string | null;
}

export function lerCrlv(texto: string): CrlvLido | null {
  const norm = normalizar(texto || '');
  if (!/CERTIFICADO\s*DE\s*REGISTRO\s*E\s*LICENCIAMENTO/.test(norm)) return null;

  let ano_fabricacao: string | null = null;
  let ano_modelo: string | null = null;
  const anos = aposRotulo(norm, /ANO\s*(?:DE\s*)?FABRICACAO/, 120);
  if (anos) {
    const ys = [...anos.trecho.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((m) => m[1]);
    if (ys.length >= 2 && Math.abs(Number(ys[1]) - Number(ys[0])) <= 1) {
      ano_fabricacao = ys[0];
      ano_modelo = ys[1];
    }
  }

  let marca_documento: string | null = null;
  let modelo_documento: string | null = null;
  const mm = aposRotulo(norm, /MARCA\s*\/\s*MODELO/, 200);
  if (mm) {
    const orig = texto.slice(mm.ini, mm.ini + 200);
    const m = /\b([A-Z]{2,})\s*\/\s*([A-Z0-9][A-Z0-9 .\-]{1,30}?)\s*(?:\n|$|\s{2,})/.exec(orig.toUpperCase());
    if (m && !/MODELO|VERSAO|VERSÃO/.test(m[0])) {
      marca_documento = m[1].trim();
      modelo_documento = m[2].trim();
    }
  }

  return {
    eh_crlv: true,
    placa: lerPlaca(norm),
    chassi: lerChassi(norm),
    renavam: lerRenavam(norm),
    numero_crv: lerNumeroCrv(norm),
    codigo_seguranca_crv: lerCodigoSegurancaCrv(norm),
    // Só o CRLV-e é identificável pelo texto; a cor do papel (AZUL/VERDE/BRANCO) não.
    tipo_crv: /LICENCIAMENTO\s*DE\s*VEICULO\s*[-–‐]\s*DIGITAL/.test(norm) ? 'DIGITAL' : null,
    ano_fabricacao,
    ano_modelo,
    marca_documento,
    modelo_documento,
  };
}

// ---------------------------------------------------------------- ATPV-e / procuração

export interface DocVeiculoLido {
  eh_documento_esperado: boolean;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  numero_crv: string | null;
  codigo_seguranca_crv: string | null;
  data_assinatura_vendedor: string | null;
}

export function lerDocVeiculo(texto: string, tipo: 'atpv' | 'procuracao'): DocVeiculoLido | null {
  const norm = normalizar(texto || '');
  const reconhecido = tipo === 'atpv'
    ? /AUTORIZACAO\s*PARA\s*TRANSFERENCIA\s*DE\s*PROPRIEDADE/.test(norm)
    : /PROCURACAO|OUTORGANTE|OUTORGAD[OA]/.test(norm);
  if (!reconhecido) return null;

  let data_assinatura_vendedor: string | null = null;
  if (tipo === 'atpv') {
    // Só a "DATA DECLARADA DA VENDA" preenchida (o valor vem antes do próximo rótulo). A data do
    // selo de assinatura digital fica para a IA (precisa saber de quem é a assinatura).
    const r = aposRotulo(norm, /DATA\s*DECLARADA\s*DA\s*VENDA/, 80);
    if (r) {
      const ate = r.trecho.search(/NUMERO|CODIGO|DATA|ASSINATURA|HODOMETRO|IDENTIFICACAO/);
      const m = RE_DATA.exec(ate >= 0 ? r.trecho.slice(0, ate) : r.trecho);
      if (m) {
        const iso = dataIso(m[1], m[2], m[3]);
        if (iso && new Date(iso).getTime() <= Date.now() + 86400e3) data_assinatura_vendedor = iso;
      }
    }
  }

  return {
    eh_documento_esperado: true,
    placa: lerPlaca(norm),
    chassi: lerChassi(norm),
    renavam: lerRenavam(norm),
    numero_crv: tipo === 'atpv' ? lerNumeroCrv(norm) : null,
    codigo_seguranca_crv: tipo === 'atpv' ? lerCodigoSegurancaCrv(norm) : null,
    data_assinatura_vendedor,
  };
}

// ---------------------------------------------------------------- CNH / RG

export interface IdentidadeLida {
  tipo_detectado: 'cnh' | 'rg';
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
}

/** Linha de nome: só letras/espaços, 2+ palavras; tira datas e lixo de OCR nas pontas. */
function nomeDaLinha(linha: string): string | null {
  const semData = linha.replace(/\d{1,2}\s?[/.\-]\s?\d{1,2}\s?[/.\-]\s?\d{2,4}.*$/, '');
  const m = /([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’]+(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’]*){1,8})/.exec(semData.toUpperCase());
  if (!m) return null;
  const nome = m[1].replace(/\s+/g, ' ').trim();
  const palavras = nome.split(' ');
  if (palavras.length < 2 || nome.length < 6) return null;
  if (/HABILITACAO|HABILITAÇÃO|SOBRENOME|FILIACAO|FILIAÇÃO|NASCIMENTO|REPUBLICA|REPÚBLICA|CARTEIRA|IDENTIDADE|BRASIL|NAME|SURNAME/.test(nome)) return null;
  return nome;
}

export function lerIdentidade(texto: string): IdentidadeLida | null {
  const original = texto || '';
  const norm = normalizar(original);
  const ehCnh = /CARTEIRA\s*NACIONAL\s*DE\s*HABILITACAO|DRIVER\s*LICEN[SC]E|PERMISO\s*DE\s*CONDUC/.test(norm);
  const ehRg = !ehCnh && /CARTEIRA\s*DE\s*IDENTIDADE|REGISTRO\s*GERAL|CEDULA\s*DE\s*IDENTIDADE|IDENTITY\s*CARD/.test(norm);
  if (!ehCnh && !ehRg) return null;

  // Nome: linha seguinte ao rótulo "NOME" (não "NOME SOCIAL"/"NOME DO PAI|MAE").
  let nome: string | null = null;
  for (const r of todosAposRotulo(norm, /(?<![A-Z])NOME\b(?:\s*E\s*SOBRENOME)?(?!\s*(?:SOCIAL|DO\s*PAI|DA\s*MAE|DO\s*TITULAR\s*SOCIAL))/, 160)) {
    const linhasOrig = original.slice(r.ini, r.ini + 160).split('\n');
    // a própria linha do rótulo (resto) e as duas seguintes
    for (const l of linhasOrig.slice(0, 3)) {
      const n = nomeDaLinha(l.replace(/1[ºª°]?\s*HABILITA[CÇ][AÃ]O/i, ''));
      if (n) { nome = n; break; }
    }
    if (nome) break;
  }

  // CPF: só no formato 000.000.000-00 com dígito verificador (o Nº de registro da CNH também tem
  // 11 dígitos, mas sem pontuação — assim não há confusão).
  let cpf: string | null = null;
  for (const m of norm.matchAll(/\b(\d{3})\s?\.\s?(\d{3})\s?\.\s?(\d{3})\s?[-–]\s?(\d{2})\b/g)) {
    const d = m[1] + m[2] + m[3] + m[4];
    if (cpfValido(d)) { cpf = d; break; }
  }

  let data_nascimento: string | null = null;
  const nasc = aposRotulo(norm, /NASCIMENTO/, 90);
  if (nasc) {
    const m = RE_DATA.exec(nasc.trecho);
    if (m) {
      const iso = dataIso(m[1], m[2], m[3]);
      if (iso) {
        const idade = (Date.now() - new Date(iso).getTime()) / (365.25 * 86400e3);
        if (idade >= 0 && idade <= 120) data_nascimento = iso;
      }
    }
  }

  let rg: string | null = null;
  const rotuloRg = ehCnh ? /DOC\.?\s*(?:DE\s*)?IDENTIDADE/ : /REGISTRO\s*GERAL|\bRG\b/;
  const r = aposRotulo(norm, rotuloRg, 120);
  if (r) {
    const linhasOrig = original.slice(r.ini, r.ini + 120).split('\n').slice(0, 3);
    for (const l of linhasOrig) {
      const m = /([A-Z]{0,2}\d[\d.\-xX]{3,15})(?:\s+([A-Z]{2,6})(?:\s*[/\- ]\s*([A-Z]{2}))?)?/.exec(l.toUpperCase());
      if (m && soDig(m[1]).length >= 5) {
        rg = [m[1], m[2], m[3]].filter(Boolean).join(' ').trim();
        break;
      }
    }
  }

  return { tipo_detectado: ehCnh ? 'cnh' : 'rg', nome, cpf, rg, data_nascimento };
}

// ---------------------------------------------------------------- Cartão CNPJ

export interface CartaoCnpjLido {
  cnpj: string | null;
  razao_social: string | null;
}

export function lerCartaoCnpj(texto: string): CartaoCnpjLido | null {
  const original = texto || '';
  const norm = normalizar(original);
  if (!/COMPROVANTE\s*DE\s*INSCRICAO/.test(norm) || !/CADASTRO\s*NACIONAL\s*DA\s*PESSOA\s*JURIDICA|SITUACAO\s*CADASTRAL/.test(norm)) return null;
  let cnpj: string | null = null;
  for (const m of norm.matchAll(/\b\d{2}\s?\.\s?\d{3}\s?\.\s?\d{3}\s?\/\s?\d{4}\s?[-–]\s?\d{2}\b/g)) {
    if (cnpjValido(m[0])) { cnpj = soDig(m[0]); break; }
  }
  let razao_social: string | null = null;
  const r = aposRotulo(norm, /NOME\s*EMPRESARIAL/, 200);
  if (r) {
    for (const l of original.slice(r.ini, r.ini + 200).split('\n').slice(0, 3)) {
      const t = l.replace(/DATA DE (?:ABERTURA|CONSTITUI[CÇ][AÃ]O)/i, '').replace(/\d{2}\/\d{2}\/\d{4}.*$/, '').trim();
      if (t.length >= 3 && /[A-Za-z]{3}/.test(t)) { razao_social = t.replace(/\s{2,}/g, ' '); break; }
    }
  }
  return { cnpj, razao_social };
}
