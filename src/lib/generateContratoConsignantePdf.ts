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

export async function generateContratoConsignantePdf(data: ContratoConsignantePdfData): Promise<void> {
  const empresaNome = 'MMATOS COMERCIO DE VEÍCULOS E PEÇAS LTDA';
  const cnpj = '21.194.795/0001-96';
  const logoPath = '/logos/299-logo.jpg';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const marginBottom = 15;
  const fontSize = 9;
  const lineHeight = 4.5;
  let y = 15;

  const setNormal = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(fontSize); };
  const setBold = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(fontSize); };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = 15;
    }
  };

  const writeJustified = (text: string, startY: number) => {
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkPageBreak(lineHeight);
      doc.text(line, marginLeft, y, { maxWidth: contentWidth, align: 'justify' });
      y += lineHeight;
    }
  };

  // ===== LOGO =====
  try {
    const logoData = await loadImage(logoPath);
    const logoW = 25;
    const logoH = 14;
    doc.addImage(logoData, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoH);
    y += logoH + 6;
  } catch {
    y += 10;
  }

  // ===== TITLE =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUTORIZAÇÃO PARA PAGAMENTO DE INTERMEDIAÇÃO DE VENDA', pageWidth / 2, y, { align: 'center' });
  y += 7;

  // Horizontal line
  doc.setLineWidth(0.5);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 8;

  // ===== VENDEDOR =====
  setBold();
  doc.text('VENDEDOR', marginLeft, y);
  y += lineHeight + 1;
  setNormal();
  doc.text(`Nome: ${data.nomeConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefoneConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight + 4;

  // ===== OBJETO =====
  setBold();
  doc.text('OBJETO:', marginLeft, y);
  y += lineHeight + 1;
  setNormal();
  doc.text(`Marca: ${data.marcaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modeloMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.anoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Km: ${data.kmMoto}`, marginLeft, y); y += lineHeight + 4;

  // ===== ABATIMENTOS =====
  setBold();
  doc.text('ABATIMENTOS', marginLeft, y);
  y += lineHeight + 1;

  // Valor Total line
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
  y += 4;

  // ===== OBSERVAÇÕES =====
  setBold();
  doc.text('OBSERVAÇÕES', marginLeft, y);
  y += lineHeight + 1;
  setNormal();
  if (data.observacoesContrato) {
    const obsLines = doc.splitTextToSize(data.observacoesContrato, contentWidth);
    for (const line of obsLines) {
      checkPageBreak(lineHeight);
      doc.text(line, marginLeft, y);
      y += lineHeight;
    }
  } else {
    doc.text('-', marginLeft, y);
    y += lineHeight;
  }
  y += 6;

  // ===== LEGAL TEXT =====
  checkPageBreak(50);
  setNormal();
  doc.setFontSize(8.5);

  const para1 = 'AUTORIZAÇÃO PARA PAGAMENTO DE INTERMEDIAÇÃO DE VENDA DE MOTOCICLETA PREVIAMENTE RECEBIDO EM CONSIGNAÇÃO, QUE ENTRE SI CELEBRAM:';
  setBold(); doc.setFontSize(8.5);
  writeJustified(para1, y);
  y += 2;

  setNormal(); doc.setFontSize(8.5);
  const para2 = 'De um lado: neste documento citado "vendedor" e assina no campo abaixo "assinatura do cliente", dá-se por ciente as cláusulas do contrato de consignação, anteriormente firmado estender-se até a presente venda, a qual é feita livre e desembaraçada de qualquer ônus, restrições judiciais e/ou administrativas, inclusive multas e impostos, até a presente data.';
  writeJustified(para2, y);
  y += 2;

  const para3 = `E de outro lado ${empresaNome} CNPJ: ${cnpj}, 299 Imports, sediada na SCIA QD 15 Conjunto 03 Loja 06 parte a Brasília–DF, denominado simplesmente intermediador, tem justo contrato o que se segue:`;
  writeJustified(para3, y);
  y += 2;

  const para4 = `Venda de uma motocicleta citada neste documento no campo "item da proposta comercial", posta à venda neste estabelecimento comercial, por meio de consignação no valor ajustado de ${data.valorConsignacao}.`;
  writeJustified(para4, y);
  y += 2;

  // Paragraph with bold variables
  const para5pre = 'O acerto no valor ';
  const para5ValorRestante = data.valorRepasse;
  const para5mid1 = ' de já descontado a comissão recebida pela intermediação da venda será pago por meio de TED em até 7 dias úteis para o ';
  const para5Bancarios = data.dadosBancarios;
  const para5mid2 = ' em titularidade de ';
  const para5Titular = data.titularConta;
  const para5end = ' totalizando assim o valor ajustado, assim dando plena e geral quitação da quantia recebida, transferindo desde já, para o comprador a posse e domínio sobre o referido veículo, e a responder pela evicção, pondo o comprador a salvo de quaisquer contestações futuras.';
  
  // Build as single text for justified layout (bold inline not supported in jsPDF justify)
  const para5Full = `O acerto no valor ${data.valorRepasse} de já descontado a comissão recebida pela intermediação da venda será pago por meio de TED em até 7 dias úteis para o ${data.dadosBancarios} em titularidade de ${data.titularConta} totalizando assim o valor ajustado, assim dando plena e geral quitação da quantia recebida, transferindo desde já, para o comprador a posse e domínio sobre o referido veículo, e a responder pela evicção, pondo o comprador a salvo de quaisquer contestações futuras.`;
  writeJustified(para5Full, y);
  y += 2;

  writeJustified('Para maior clareza e validade do acima declarado, firmo o presente recibo conforme a lei em vigor.', y);
  y += 2;
  writeJustified('Por ser verdade assino o presente recibo.', y);
  y += 10;

  // ===== SIGNATURES =====
  checkPageBreak(45);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 60, y);
  y += lineHeight;
  setBold(); doc.setFontSize(fontSize);
  doc.text('Assinatura do cliente', marginLeft, y);
  y += lineHeight;
  setNormal();
  doc.text(data.nomeConsignante, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += lineHeight * 5;

  checkPageBreak(20);
  doc.line(marginLeft, y, marginLeft + 60, y);
  y += lineHeight;
  setNormal();
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(cnpj, marginLeft, y);
  y += lineHeight * 3;

  // ===== PAGE 2: Digital signature + LGPD =====
  doc.addPage();
  y = 20;
  setNormal(); doc.setFontSize(8.5);

  const digitalPara = 'Ao confirmar e assinar este documento por via digital, estamos em acordo de que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas de todos os envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o respectivo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º,§2.';
  writeJustified(digitalPara, y);
  y += 4;

  const lgpdPara = 'A Lei Geral de Proteção de Dados será obedecida, em todos os seus termos, pela CONTRATADA, obrigando-se ela a tratar os dados da CONTRATANTE que forem eventualmente coletados, conforme sua necessidade ou obrigatoriedade. Manter e utilizar medidas de segurança administrativas, técnicas e físicas apropriadas e suficientes para proteger a confidencialidade e integridade de todos os dados pessoais mantidos ou consultados/transmitidos eletronicamente, para garantir a proteção desses dados contra acesso não autorizado, destruição, uso, modificação, divulgação ou perda acidental ou indevida, conforme a Legislação vigente sobre Proteção de Dados Pessoais e as determinações de órgãos reguladores/fiscalizadores sobre a matéria, em especial a Lei 13.709/2018.';
  writeJustified(lgpdPara, y);
  y += 12;

  // Date centered
  setBold(); doc.setFontSize(fontSize);
  doc.text(`Brasília, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });

  const fileName = `AUTORIZACAO_PAGAMENTO_${data.nomeConsignante.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoConsignantePdfData };
