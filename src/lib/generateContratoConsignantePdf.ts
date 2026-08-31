import jsPDF from 'jspdf';
import { formatCpfCnpjPdf, formatKmPdf, bancoClienteLinhas, type BancoClientePdf } from './contratoPdfUtils';

interface ContratoConsignantePdfData {
  loja?: string | null;
  nomeConsignante: string;
  telefoneConsignante: string;
  cpfCnpj: string;
  dadosBancarios: string;
  titularConta: string;
  /** Dados bancários estruturados do cadastro (vendedor) — saem no trecho do pagamento, igual ao contrato de compra. */
  bancoCliente?: BancoClientePdf | null;
  marcaMoto: string;
  modeloMoto: string;
  anoFabMod: string;
  placaMoto: string;
  kmMoto: string;
  valorConsignacao: string;
  totalAbatimentos: string;
  valorRepasse: string;
  abatimentosList: { descricao: string; valor: string }[];
  observacoesContrato: string;
  dataContrato: string;
}

async function loadImage(path: string): Promise<{ data: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL('image/png'), width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = path;
  });
}

function drawJustifiedText(
  doc: jsPDF,
  text: string,
  x: number,
  maxWidth: number,
  startY: number,
  lineHeight: number,
  boldSegments?: string[],
  pageBreakCheck?: (currentY: number, needed: number) => number,
): number {
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth);
  let y = startY;

  for (let i = 0; i < lines.length; i++) {
    if (pageBreakCheck) {
      y = pageBreakCheck(y, lineHeight);
    }
    const line: string = lines[i];
    const isLastLine = i === lines.length - 1;

    if (!boldSegments || boldSegments.length === 0) {
      if (isLastLine || !line.trim()) {
        doc.text(line, x, y);
      } else {
        const words = line.split(/\s+/);
        if (words.length <= 1) {
          doc.text(line, x, y);
        } else {
          const wordsWidth = words.reduce((sum: number, w: string) => sum + doc.getTextWidth(w), 0);
          const totalSpaceWidth = maxWidth - wordsWidth;
          const spaceWidth = totalSpaceWidth / (words.length - 1);
          let currentX = x;
          for (let j = 0; j < words.length; j++) {
            doc.text(words[j], currentX, y);
            currentX += doc.getTextWidth(words[j]) + spaceWidth;
          }
        }
      }
    } else {
      const words = line.split(/\s+/);
      let spaceWidth: number;
      if (isLastLine || words.length <= 1) {
        doc.setFont('helvetica', 'normal');
        spaceWidth = doc.getTextWidth(' ');
      } else {
        let totalWordsW = 0;
        for (const w of words) {
          const isBold = boldSegments.some(seg => w.includes(seg) || seg.split(/\s+/).includes(w));
          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          totalWordsW += doc.getTextWidth(w);
        }
        spaceWidth = (maxWidth - totalWordsW) / (words.length - 1);
      }

      let currentX = x;
      for (const w of words) {
        const cleanW = w.replace(/[.,;:!?]+$/g, '');
        const isBold = boldSegments.some(seg => {
          const segWords = seg.split(/\s+/);
          return segWords.includes(w) || segWords.includes(cleanW) || w === seg || cleanW === seg;
        });
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(w, currentX, y);
        currentX += doc.getTextWidth(w) + spaceWidth;
      }
      doc.setFont('helvetica', 'normal');
    }
    y += lineHeight;
  }
  return y;
}

interface CidadeOverride {
  empresaNome: string;
  cnpj: string;
  enderecoSede: string;
  cidadeAssinatura: string;
}

const CIDADE_OVERRIDES: { match: (l: string) => boolean; data: CidadeOverride }[] = [
  {
    match: (l) => l.includes('POA') || l.includes('299P'),
    data: {
      empresaNome: 'INTERCONTINENTAL MOTORSPORT LTDA',
      cnpj: '05.564.902/0002-55',
      enderecoSede: 'Rua Pereira Franco, 283 A, bairro São João, CEP: 90240-520, Porto Alegre–RS',
      cidadeAssinatura: 'Porto Alegre',
    },
  },
  {
    match: (l) => l.includes('FLN') || l.includes('299F'),
    data: {
      empresaNome: 'INTERCONTINENTAL MOTORSPORT LTDA',
      cnpj: '05.564.902/0001-74',
      enderecoSede: 'R. São Bento, 125 A, bairro Jardim Capoeiras, CEP: 88090-725, Florianópolis–SC',
      cidadeAssinatura: 'Florianópolis',
    },
  },
];

const getCidadeOverride = (loja?: string | null): CidadeOverride | null => {
  const l = (loja || '').toUpperCase();
  return CIDADE_OVERRIDES.find(o => o.match(l))?.data || null;
};

export async function generateContratoConsignantePdf(
  data: ContratoConsignantePdfData,
  modo: 'download' | 'view' = 'download',
): Promise<void> {
  const override = getCidadeOverride(data.loja);
  const isDucati = (data.loja || '').toUpperCase().includes('DUCATI');
  const empresaNome = override?.empresaNome || 'MMATOS COMERCIO DE VEÍCULOS E PEÇAS LTDA';
  const cnpj = override?.cnpj || '21.194.795/0001-96';
  const nomeFantasiaSuffix = override && isDucati ? '' : ', 299 Imports';
  const enderecoSede = override?.enderecoSede || 'SCIA QD 15 Conjunto 03 Loja 06 parte a Brasília–DF';
  const cidadeAssinatura = override?.cidadeAssinatura || 'Brasília';
  const logoPath = override && isDucati ? '/logos/ducati-logo.png' : '/logos/299-logo.jpg';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginTop = 10;
  const marginBottom = 10;
  const marginLeft = 10;
  const marginRight = 10;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const fontSize = 9;
  const lineHeight = 4;
  const sectionGap = lineHeight;
  let y = marginTop;

  const setNormal = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(fontSize); };
  const setBold = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(fontSize); };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
    return y;
  };

  const lineCheckPageBreak = (currentY: number, needed: number): number => {
    if (currentY + needed > pageHeight - marginBottom) {
      doc.addPage();
      return marginTop;
    }
    return currentY;
  };

  const sectionHeader = (title: string) => {
    checkPageBreak(10);
    setBold();
    doc.text(title, marginLeft, y);
    y += lineHeight;
  };

  // ===== LOGO =====
  try {
    const logo = await loadImage(logoPath);
    const aspect = logo.width / logo.height;
    const logoWidth = 30;
    const logoHeight = logoWidth / aspect;
    doc.addImage(logo.data, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 10;
  } catch (e) {
    console.error('Erro ao carregar logo:', e);
    y += 10;
  }

  // ===== TITLE =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('AUTORIZAÇÃO PARA PAGAMENTO DE INTERMEDIAÇÃO DE VENDA', pageWidth / 2, y, { align: 'center', maxWidth: contentWidth });
  y += 7;

  // Line separator
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += sectionGap * 2;

  // ===== VENDEDOR =====
  sectionHeader('VENDEDOR');
  setNormal();
  doc.text(`Nome: ${data.nomeConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefoneConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${formatCpfCnpjPdf(data.cpfCnpj)}`, marginLeft, y); y += lineHeight + sectionGap;

  // ===== OBJETO =====
  sectionHeader('OBJETO:');
  setNormal();
  doc.text(`Marca: ${data.marcaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modeloMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.anoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Km: ${formatKmPdf(data.kmMoto)}`, marginLeft, y); y += lineHeight + sectionGap;

  // ===== ABATIMENTOS =====
  sectionHeader('ABATIMENTOS');
  setNormal();

  // Valor Total line with bold label
  setBold();
  doc.text('Valor Total: ', marginLeft, y);
  const vtWidth = doc.getTextWidth('Valor Total: ');
  setNormal();
  doc.text(`${data.totalAbatimentos} , sendo:`, marginLeft + vtWidth, y);
  y += lineHeight + 2;

  // List abatimentos
  for (const item of data.abatimentosList) {
    checkPageBreak(lineHeight);
    setNormal();
    doc.text(`${item.descricao}: ${item.valor}`, marginLeft, y);
    y += lineHeight;
  }

  if (data.abatimentosList.length === 0) {
    setNormal();
    doc.text('Nenhum abatimento.', marginLeft, y);
    y += lineHeight;
  }
  y += sectionGap;

  // ===== OBSERVAÇÕES =====
  sectionHeader('OBSERVAÇÕES');
  setNormal();
  if (data.observacoesContrato) {
    const obsLines = doc.splitTextToSize(data.observacoesContrato, contentWidth);
    for (const ln of obsLines) {
      y = lineCheckPageBreak(y, lineHeight);
      doc.text(ln, marginLeft, y);
      y += lineHeight;
    }
  } else {
    doc.text('-', marginLeft, y);
    y += lineHeight;
  }
  y += sectionGap;

  // ===== DADOS BANCÁRIOS PARA REPASSE (igual contrato de compra) =====
  {
    const bancoLinhas = bancoClienteLinhas(data.bancoCliente);
    checkPageBreak(lineHeight * (bancoLinhas.length + 2));
    setBold();
    doc.text('Dados bancários do VENDEDOR para repasse:', marginLeft, y);
    y += lineHeight;
    setNormal();
    if (bancoLinhas.length === 0) {
      doc.text('Não informados.', marginLeft, y);
      y += lineHeight;
    } else {
      for (const ln of bancoLinhas) {
        y = lineCheckPageBreak(y, lineHeight);
        doc.text(ln, marginLeft, y);
        y += lineHeight;
      }
    }
    y += sectionGap;
  }

  // ===== LEGAL TEXT =====
  checkPageBreak(lineHeight);
  setNormal();

  const para1 = 'AUTORIZAÇÃO PARA PAGAMENTO DE INTERMEDIAÇÃO DE VENDA DE MOTOCICLETA PREVIAMENTE RECEBIDO EM CONSIGNAÇÃO, QUE ENTRE SI CELEBRAM:';
  setBold();
  y = drawJustifiedText(doc, para1, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += 2;

  setNormal();
  const para2 = 'De um lado: neste documento citado "vendedor" e assina no campo abaixo "assinatura do cliente", dá-se por ciente as cláusulas do contrato de consignação, anteriormente firmado estender-se até a presente venda, a qual é feita livre e desembaraçada de qualquer ônus, restrições judiciais e/ou administrativas, inclusive multas e impostos, até a presente data.';
  y = drawJustifiedText(doc, para2, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += 2;

  const para3 = `E de outro lado ${empresaNome} CNPJ: ${cnpj}${nomeFantasiaSuffix}, sediada na ${enderecoSede}, denominado simplesmente intermediador, tem justo contrato o que se segue:`;
  y = drawJustifiedText(doc, para3, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += 2;

  const para4pre = 'Venda de uma motocicleta citada neste documento no campo "item da proposta comercial", posta à venda neste estabelecimento comercial, por meio de consignação no valor ajustado de ';
  const para4post = '.';
  checkPageBreak(lineHeight);
  setNormal();
  // Render with bold valorConsignacao
  y = drawJustifiedText(
    doc,
    para4pre + data.valorConsignacao + para4post,
    marginLeft,
    contentWidth,
    y,
    lineHeight,
    data.valorConsignacao.split(/\s+/),
    lineCheckPageBreak,
  );
  y += 2;

  // Paragraph with bold variables
  const para5 = `O acerto no valor ${data.valorRepasse} de já descontado a comissão recebida pela intermediação da venda será pago por meio de TED em até 7 dias úteis para o ${data.dadosBancarios} em titularidade de ${data.titularConta} totalizando assim o valor ajustado, assim dando plena e geral quitação da quantia recebida, transferindo desde já, para o comprador a posse e domínio sobre o referido veículo, e a responder pela evicção, pondo o comprador a salvo de quaisquer contestações futuras.`;
  const boldSegments = [
    ...data.valorRepasse.split(/\s+/),
    ...data.dadosBancarios.split(/\s+/),
    ...data.titularConta.split(/\s+/),
  ];
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, para5, marginLeft, contentWidth, y, lineHeight, boldSegments, lineCheckPageBreak);
  y += 2;

  y = drawJustifiedText(
    doc,
    'Para maior clareza e validade do acima declarado, firmo o presente recibo conforme a lei em vigor.',
    marginLeft,
    contentWidth,
    y,
    lineHeight,
    undefined,
    lineCheckPageBreak,
  );
  y += 2;
  y = drawJustifiedText(doc, 'Por ser verdade assino o presente recibo.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);

  // ===== SIGNATURES =====
  const clientSigBlockHeight = lineHeight * 5 + lineHeight * 4; // gap + signature lines
  checkPageBreak(clientSigBlockHeight);
  y += lineHeight * 5;
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setBold();
  doc.text('Assinatura do cliente', marginLeft, y);
  y += lineHeight;
  setNormal();
  doc.text(data.nomeConsignante, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${formatCpfCnpjPdf(data.cpfCnpj)}`, marginLeft, y);
  y += lineHeight * 5;

  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(cnpj, marginLeft, y);
  y += lineHeight * 2;

  // ===== Digital signature + LGPD (same page, after company signature) =====
  const digitalPara = 'Ao confirmar e assinar este documento por via digital, estamos em acordo de que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas de todos os envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o respectivo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º,§2.';
  const lgpdPara = 'A Lei Geral de Proteção de Dados será obedecida, em todos os seus termos, pela CONTRATADA, obrigando-se ela a tratar os dados da CONTRATANTE que forem eventualmente coletados, conforme sua necessidade ou obrigatoriedade. Manter e utilizar medidas de segurança administrativas, técnicas e físicas apropriadas e suficientes para proteger a confidencialidade e integridade de todos os dados pessoais mantidos ou consultados/transmitidos eletronicamente, para garantir a proteção desses dados contra acesso não autorizado, destruição, uso, modificação, divulgação ou perda acidental ou indevida, conforme a Legislação vigente sobre Proteção de Dados Pessoais e as determinações de órgãos reguladores/fiscalizadores sobre a matéria, em especial a Lei 13.709/2018.';
  checkPageBreak(lineHeight);
  setNormal();
  y = drawJustifiedText(doc, digitalPara, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  y = drawJustifiedText(doc, lgpdPara, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap * 3;

  // Date centered
  setNormal();
  doc.text(`${cidadeAssinatura}, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });

  const fileName = `AUTORIZACAO_PAGAMENTO_${data.nomeConsignante.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  if (modo === 'view') {
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  } else {
    doc.save(fileName);
  }
}

export { type ContratoConsignantePdfData };
