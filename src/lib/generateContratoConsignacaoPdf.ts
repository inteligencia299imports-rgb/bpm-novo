import jsPDF from 'jspdf';

interface ContratoConsignacaoPdfData {
  // Client
  nomeCliente: string;
  telefone: string;
  cpfCnpj: string;
  email: string;
  endereco: string;
  cep: string;

  // Moto
  marca: string;
  modelo: string;
  anoFabMod: string;
  placa: string;
  km: string;
  valorQuitacao: string;
  valorNegociado: string;

  // Observações
  observacoes: string;

  // Valor de fechamento
  valorFechamento: string;

  // Data
  dataContrato: string;

  // Variant
  comPercentual5: boolean;
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

export async function generateContratoConsignacaoPdf(data: ContratoConsignacaoPdfData): Promise<void> {
  const empresaNome = 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA';
  const cnpj = '21.194.795/0001-96';
  const logoPath = '/logos/299-logo.jpg';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
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

  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > 297 - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const sectionHeader = (title: string) => {
    checkPageBreak(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.text(title, marginLeft, y);
    y += lineHeight;
  };

  // Logo
  try {
    const logoData = await loadImage(logoPath);
    const img = new Image();
    img.src = logoPath;
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const aspect = naturalW / naturalH;
    const logoWidth = 30;
    const logoHeight = logoWidth / aspect;
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 6;
  } catch {
    y += 10;
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const title = data.comPercentual5
    ? 'CONTRATO DE CONSIGNAÇÃO - 299 (5%)'
    : 'CONTRATO DE CONSIGNAÇÃO - 299';
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 7;

  // Company info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(empresaNome, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text('SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF', pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text('Telefone: (61) 3710-5687', pageWidth / 2, y, { align: 'center' });
  y += lineHeight + 2;

  // Line separator
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += sectionGap * 2;

  // DADOS DO CLIENTE
  sectionHeader('DADOS DO CLIENTE');
  setNormal();
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight;
  doc.text(`E-mail: ${data.email}`, marginLeft, y); y += lineHeight;
  doc.text(`Endereço: ${data.endereco}`, marginLeft, y); y += lineHeight;
  doc.text(`CEP: ${data.cep}`, marginLeft, y); y += lineHeight + sectionGap;

  // DADOS DA MOTO
  sectionHeader('DADOS DA MOTO');
  setNormal();
  doc.text(`Marca: ${data.marca}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modelo}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.anoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placa}`, marginLeft, y); y += lineHeight;
  doc.text(`Km: ${data.km}`, marginLeft, y); y += lineHeight;
  doc.text(`Valor de Quitação: ${data.valorQuitacao}`, marginLeft, y); y += lineHeight;
  doc.text(`Valor Negociado: ${data.valorNegociado}`, marginLeft, y); y += lineHeight + sectionGap;

  // OBSERVAÇÕES
  if (data.observacoes) {
    sectionHeader('OBSERVAÇÕES');
    setNormal();
    const obsLines = doc.splitTextToSize(data.observacoes, contentWidth);
    checkPageBreak(obsLines.length * lineHeight + 5);
    doc.text(obsLines, marginLeft, y);
    y += obsLines.length * lineHeight;
    y += sectionGap;
  }

  // VALOR DE FECHAMENTO
  checkPageBreak(10);
  setNormal();
  doc.text('Valor de Fechamento: ', marginLeft, y);
  const labelW = doc.getTextWidth('Valor de Fechamento: ');
  setBold();
  doc.text(data.valorFechamento, marginLeft + labelW, y);
  setNormal();
  y += lineHeight + sectionGap;

  // DATA DO CONTRATO
  checkPageBreak(10);
  setNormal();
  doc.text('Data do Contrato: ', marginLeft, y);
  const dtLabelW = doc.getTextWidth('Data do Contrato: ');
  setBold();
  doc.text(data.dataContrato, marginLeft + dtLabelW, y);
  setNormal();
  y += lineHeight + sectionGap * 2;

  // CONDIÇÕES DO CONTRATO
  sectionHeader('CONDIÇÕES DO CONTRATO');
  setNormal();

  const condicoesTexts = [
    'O CONSIGNANTE entrega ao CONSIGNATÁRIO o veículo acima descrito para fins de venda em consignação, obrigando-se o CONSIGNATÁRIO a devolvê-lo nas mesmas condições em que o recebeu, caso não efetue a venda no prazo acordado.',
    'O CONSIGNATÁRIO se compromete a não utilizar o veículo para fins pessoais, sendo sua responsabilidade a guarda e conservação do mesmo durante o período de consignação.',
    'Em caso de venda, o CONSIGNATÁRIO deverá repassar ao CONSIGNANTE o valor acordado, deduzidas as taxas e comissões previamente estabelecidas.',
    'O prazo de consignação é de 90 (noventa) dias, podendo ser prorrogado mediante acordo entre as partes.',
    'O CONSIGNANTE declara ser o legítimo proprietário do veículo e que o mesmo encontra-se livre de quaisquer ônus, gravames, multas ou restrições.',
  ];

  for (const txt of condicoesTexts) {
    checkPageBreak(20);
    y = drawJustifiedText(doc, txt, marginLeft, contentWidth, y, lineHeight);
    y += sectionGap;
  }
  y += sectionGap;

  // Signature lines
  y += lineHeight * 5;
  checkPageBreak(70);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, marginLeft, y);
  y += lineHeight * 8;

  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += sectionGap * 2;

  // LGPD
  const lgpdText = 'Em conformidade com a Lei Geral de Proteção de Dados (LGPD), Lei n.º 13.709/2018, o cliente consente expressamente com a utilização dos seus dados pessoais, fornecidos neste contrato a fins de contato e comunicação comercial pela empresa.';
  checkPageBreak(20);
  y = drawJustifiedText(doc, lgpdText, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // Digital signature note
  const digitalText = 'Ao confirmar e revisar este documento por via digital, estamos de acordo que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas dos envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o relativo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.';
  checkPageBreak(25);
  y = drawJustifiedText(doc, digitalText, marginLeft, contentWidth, y, lineHeight);

  // Save
  const suffix = data.comPercentual5 ? '_5PCT' : '';
  const fileName = `CONSIGNACAO${suffix}_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoConsignacaoPdfData };
