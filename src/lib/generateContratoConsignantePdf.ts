import jsPDF from 'jspdf';

interface ContratoConsignantePdfData {
  nomeConsignante: string;
  telefoneConsignante: string;
  cpfCnpj: string;
  dadosBancarios: string;
  titularConta: string;
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

async function loadImage(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = path;
  });
}

function drawJustifiedText(doc: jsPDF, text: string, x: number, maxWidth: number, y: number, lineHeight: number, boldSegments?: string[]): number {
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth);

  for (let i = 0; i < lines.length; i++) {
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
        const isBold = boldSegments.some(seg => {
          const segWords = seg.split(/\s+/);
          return segWords.includes(w) || w === seg;
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

export async function generateContratoConsignantePdf(data: ContratoConsignantePdfData): Promise<void> {
  const empresaNome = 'MMATOS COMERCIO DE VEÍCULOS E PEÇAS LTDA';
  const cnpj = '21.194.795/0001-96';
  const logoPath = '/logos/299-logo.jpg';

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
  };

  const sectionHeader = (title: string) => {
    checkPageBreak(10);
    setBold();
    doc.text(title, marginLeft, y);
    y += lineHeight;
  };

  // ===== LOGO =====
  try {
    const logoData = await loadImage(logoPath);
    const img = new Image();
    img.src = logoData;
    const aspect = img.naturalWidth / img.naturalHeight;
    const logoWidth = 30;
    const logoHeight = logoWidth / aspect;
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 6;
  } catch {
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
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight + sectionGap;

  // ===== OBJETO =====
  sectionHeader('OBJETO:');
  setNormal();
  doc.text(`Marca: ${data.marcaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modeloMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.anoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Km: ${data.kmMoto}`, marginLeft, y); y += lineHeight + sectionGap;

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
    checkPageBreak(obsLines.length * lineHeight + 5);
    doc.text(obsLines, marginLeft, y);
    y += obsLines.length * lineHeight;
  } else {
    doc.text('-', marginLeft, y);
    y += lineHeight;
  }
  y += sectionGap;

  // ===== LEGAL TEXT =====
  checkPageBreak(50);
  setNormal();

  const para1 = 'AUTORIZAÇÃO PARA PAGAMENTO DE INTERMEDIAÇÃO DE VENDA DE MOTOCICLETA PREVIAMENTE RECEBIDO EM CONSIGNAÇÃO, QUE ENTRE SI CELEBRAM:';
  setBold();
  y = drawJustifiedText(doc, para1, marginLeft, contentWidth, y, lineHeight);
  y += 2;

  setNormal();
  const para2 = 'De um lado: neste documento citado "vendedor" e assina no campo abaixo "assinatura do cliente", dá-se por ciente as cláusulas do contrato de consignação, anteriormente firmado estender-se até a presente venda, a qual é feita livre e desembaraçada de qualquer ônus, restrições judiciais e/ou administrativas, inclusive multas e impostos, até a presente data.';
  y = drawJustifiedText(doc, para2, marginLeft, contentWidth, y, lineHeight);
  y += 2;

  const para3 = `E de outro lado ${empresaNome} CNPJ: ${cnpj}, 299 Imports, sediada na SCIA QD 15 Conjunto 03 Loja 06 parte a Brasília–DF, denominado simplesmente intermediador, tem justo contrato o que se segue:`;
  y = drawJustifiedText(doc, para3, marginLeft, contentWidth, y, lineHeight);
  y += 2;

  const para4pre = 'Venda de uma motocicleta citada neste documento no campo "item da proposta comercial", posta à venda neste estabelecimento comercial, por meio de consignação no valor ajustado de ';
  const para4post = '.';
  checkPageBreak(15);
  setNormal();
  const lines4pre = doc.splitTextToSize(para4pre + data.valorConsignacao + para4post, contentWidth);
  // Render with bold valorConsignacao
  y = drawJustifiedText(doc, para4pre + data.valorConsignacao + para4post, marginLeft, contentWidth, y, lineHeight, data.valorConsignacao.split(/\s+/));
  y += 2;

  // Paragraph with bold variables
  const para5 = `O acerto no valor ${data.valorRepasse} de já descontado a comissão recebida pela intermediação da venda será pago por meio de TED em até 7 dias úteis para o ${data.dadosBancarios} em titularidade de ${data.titularConta} totalizando assim o valor ajustado, assim dando plena e geral quitação da quantia recebida, transferindo desde já, para o comprador a posse e domínio sobre o referido veículo, e a responder pela evicção, pondo o comprador a salvo de quaisquer contestações futuras.`;
  const boldSegments = [
    ...data.valorRepasse.split(/\s+/),
    ...data.dadosBancarios.split(/\s+/),
    ...data.titularConta.split(/\s+/),
  ];
  checkPageBreak(30);
  y = drawJustifiedText(doc, para5, marginLeft, contentWidth, y, lineHeight, boldSegments);
  y += 2;

  y = drawJustifiedText(doc, 'Para maior clareza e validade do acima declarado, firmo o presente recibo conforme a lei em vigor.', marginLeft, contentWidth, y, lineHeight);
  y += 2;
  y = drawJustifiedText(doc, 'Por ser verdade assino o presente recibo.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // ===== SIGNATURES =====
  y += lineHeight * 5;
  checkPageBreak(70);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setBold();
  doc.text('Assinatura do cliente', marginLeft, y);
  y += lineHeight;
  setNormal();
  doc.text(data.nomeConsignante, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += lineHeight * 8;

  checkPageBreak(20);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(cnpj, marginLeft, y);
  y += sectionGap * 2;

  // ===== PAGE 2: Digital signature + LGPD =====
  doc.addPage();
  y = marginTop;
  setNormal();

  const digitalPara = 'Ao confirmar e assinar este documento por via digital, estamos em acordo de que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas de todos os envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o respectivo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º,§2.';
  y = drawJustifiedText(doc, digitalPara, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  const lgpdPara = 'A Lei Geral de Proteção de Dados será obedecida, em todos os seus termos, pela CONTRATADA, obrigando-se ela a tratar os dados da CONTRATANTE que forem eventualmente coletados, conforme sua necessidade ou obrigatoriedade. Manter e utilizar medidas de segurança administrativas, técnicas e físicas apropriadas e suficientes para proteger a confidencialidade e integridade de todos os dados pessoais mantidos ou consultados/transmitidos eletronicamente, para garantir a proteção desses dados contra acesso não autorizado, destruição, uso, modificação, divulgação ou perda acidental ou indevida, conforme a Legislação vigente sobre Proteção de Dados Pessoais e as determinações de órgãos reguladores/fiscalizadores sobre a matéria, em especial a Lei 13.709/2018.';
  y = drawJustifiedText(doc, lgpdPara, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap * 3;

  // Date centered
  setNormal();
  doc.text(`Brasília, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });

  const fileName = `AUTORIZACAO_PAGAMENTO_${data.nomeConsignante.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoConsignantePdfData };
