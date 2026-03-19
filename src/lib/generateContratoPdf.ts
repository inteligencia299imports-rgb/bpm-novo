import jsPDF from 'jspdf';

interface ContratoPdfData {
  // Template selection
  loja: string;
  empresaMotoInteresse: string | null;
  
  // Client
  nomeCliente: string;
  telefone: string;
  cpfCnpj: string;
  
  // Moto de interesse (produto)
  produtoMarca: string;
  produtoModelo: string;
  produtoAnoFabMod: string;
  produtoPlacaChassi: string;
  
  // Vendedor
  vendedorNome: string;
  
  // Valores
  valorSinal: string;
  valorVenda: string;
  
  // Moto troca (optional)
  troca?: {
    marca: string;
    modelo: string;
    anoFabMod: string;
    placaChassi: string;
    km: string;
    valorQuitacao: string;
    valorNegociado: string;
  };
  
  // Formas de pagamento (besides troca)
  formasPagamento: { descricao: string; valor: string }[];
  
  // Observações
  observacoes: string;
  
  // Datas
  dataSinal: string;
  dataVencimento: string;
}

type TemplateType = 'ducati' | 'fag' | 'mmatos';

const TEMPLATES: Record<TemplateType, {
  empresaNome: string;
  cnpj: string;
  logoPath: string;
}> = {
  ducati: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    logoPath: '/logos/ducati-logo.png',
  },
  fag: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    logoPath: '/logos/299-logo.jpg',
  },
  mmatos: {
    empresaNome: 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA',
    cnpj: '21.194.795/0001-96',
    logoPath: '/logos/299-logo.jpg',
  },
};

function getTemplateType(loja: string, empresaMotoInteresse: string | null): TemplateType {
  if (loja === 'Ducati') return 'ducati';
  if (empresaMotoInteresse?.toUpperCase()?.includes('MMATOS')) return 'mmatos';
  return 'fag';
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

// Justified text helper
function drawJustifiedText(doc: jsPDF, text: string, x: number, maxWidth: number, y: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;
    
    if (isLastLine || !line.trim()) {
      // Last line: left-aligned
      doc.text(line, x, y);
    } else {
      // Justify: distribute words across the line
      const words = line.split(/\s+/);
      if (words.length <= 1) {
        doc.text(line, x, y);
      } else {
        const lineWidthNatural = doc.getTextWidth(line.replace(/\s+/g, ' '));
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
    y += lineHeight;
  }
  return y;
}

export async function generateContratoPdf(data: ContratoPdfData): Promise<void> {
  const templateType = getTemplateType(data.loja, data.empresaMotoInteresse);
  const template = TEMPLATES[templateType];
  
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginTop = 10; // 1cm
  const marginBottom = 10; // 1cm
  const marginLeft = 10; // 1cm
  const marginRight = 10; // 1cm
  const contentWidth = pageWidth - marginLeft - marginRight;
  const fontSize = 9;
  const lineHeight = 4;
  const sectionGap = lineHeight;
  let y = marginTop;
  
  // Load and add logo (preserve aspect ratio)
  try {
    const logoData = await loadImage(template.logoPath);
    // Get natural dimensions to preserve aspect ratio
    const img = new Image();
    img.src = template.logoPath;
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const aspect = naturalW / naturalH;
    
    let logoWidth: number;
    let logoHeight: number;
    if (templateType === 'ducati') {
      // Ducati shield: constrain by height ~24mm
      logoHeight = 24;
      logoWidth = logoHeight * aspect;
    } else {
      // 299 Imports: constrain by width ~30mm
      logoWidth = 30;
      logoHeight = logoWidth / aspect;
    }
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 3;
  } catch {
    y += 10;
  }
  
  // Title
  doc.setFont('arial', 'bold');
  doc.setFontSize(18);
  doc.text('SINAL DE NEGÓCIO', pageWidth / 2, y, { align: 'center' });
  y += 7;
  
  // Company info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(template.empresaNome, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text(`CNPJ: ${template.cnpj}`, pageWidth / 2, y, { align: 'center' });
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
  
  // Helper to check page break
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > 297 - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };
  
  // Section header helper
  const sectionHeader = (title: string) => {
    checkPageBreak(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.text(title, marginLeft, y);
    y += lineHeight;
  };
  
  // Set default font
  const setNormal = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
  };
  
  // COMPRADOR
  sectionHeader('COMPRADOR');
  setNormal();
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight + sectionGap;
  
  // VENDEDOR
  sectionHeader('VENDEDOR: ' + data.vendedorNome);
  y += sectionGap;
  
  // OBJETO
  sectionHeader('OBJETO');
  setNormal();
  doc.text(`Marca: ${data.produtoMarca}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.produtoModelo}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.produtoAnoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa/Chassi: ${data.produtoPlacaChassi}`, marginLeft, y); y += lineHeight + sectionGap;
  
  // RECIBO DE SINAL DE NEGÓCIO (justified)
  sectionHeader('RECIBO DE SINAL DE NEGÓCIO');
  setNormal();
  const reciboText = `Recebemos o valor de ${data.valorSinal} a título de sinal de negócio, referente a compra de uma motocicleta descrita nas condições de negócio, reconhecido neste documento no campo "comprador" e assinando no campo "assinatura do cliente" declarando para os devidos fins que efetuei o sinal de negócio do veículo acima descrito no campo "condições da venda", e me comprometo a efetuar o pagamento do valor restante até o dia ${data.dataVencimento} conforme as condições da venda descritas neste recibo, o comprador também declara, estar ciente que o prazo para entrega da moto é de até 7 dias úteis após ter efetuado o pagamento total da mesma.`;
  checkPageBreak(40);
  y = drawJustifiedText(doc, reciboText, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;
  
  // CONDIÇÕES DA VENDA
  sectionHeader('CONDIÇÕES DA VENDA');
  setNormal();
  doc.text(`Valor da Venda: ${data.valorVenda}, sendo:`, marginLeft, y); y += lineHeight + sectionGap;
  
  // Moto troca
  if (data.troca) {
    checkPageBreak(35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.text('Moto na Troca:', marginLeft, y); y += lineHeight;
    setNormal();
    doc.text(`Marca: ${data.troca.marca}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Modelo: ${data.troca.modelo}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Fab/Mod: ${data.troca.anoFabMod}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Placa/Chassi: ${data.troca.placaChassi}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Km: ${data.troca.km}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Valor de Quitação: ${data.troca.valorQuitacao}`, marginLeft + 5, y); y += lineHeight;
    doc.text(`Valor Negociado: ${data.troca.valorNegociado}`, marginLeft + 5, y); y += lineHeight + sectionGap;
  }
  
  // Formas de pagamento
  for (const forma of data.formasPagamento) {
    checkPageBreak(6);
    setNormal();
    doc.text(`${forma.descricao}: ${forma.valor}`, marginLeft, y); y += lineHeight;
  }
  y += sectionGap;
  
  // OBSERVAÇÕES
  sectionHeader('OBSERVAÇÕES');
  setNormal();
  if (data.observacoes) {
    const obsLines = doc.splitTextToSize(data.observacoes, contentWidth);
    checkPageBreak(obsLines.length * lineHeight + 5);
    doc.text(obsLines, marginLeft, y);
    y += obsLines.length * lineHeight;
  }
  y += sectionGap;
  
  // CONDIÇÕES DO CONTRATO (justified)
  sectionHeader('CONDIÇÕES DO CONTRATO');
  setNormal();
  
  const condicoesTexts = [
    'No caso de Arrependimento por parte do COMPRADOR, o mesmo perde o valor dado ao VENDEDOR. E se o Arrependimento por parte do VENDEDOR, o COMPRADOR pode exigir a devolução do valor em dobro. Art. 417. Se, por ocasião da conclusão do contrato, uma parte der à outra, a título de arras, dinheiro ou outro bem móvel, deverá as arras, em caso de execução, ser restituídas ou computadas nas prestações devidas, se do mesmo gênero da vida diretor.',
    'Art. 418. Se a parte que deu as arras não executar o contrato, poderá a outra tê-lo por desfeito, retendo-as; se a inexecução para quem recebeu as arras, poderá quem tiver o contrato por desfeito, e exigir sua devolução mais o equivalente, com atualizada segundo índices oficiais regularmente estabelecidos, juros e honorários de advogado.',
    'Art. 420. Se nenhum contrato para estipulado o direito de reclamação para qualquer das partes, as arras ou sinal terão função unicamente indenizatória. Neste caso, quem as deu perdê-las-á em benefício da outra parte; e quem recebeu devolvê-las-á, mais o equivalente. Em ambos os casos não há direito a indenização suplementar. (Código Civil – Lei 10.406/2001)',
  ];
  
  for (const txt of condicoesTexts) {
    checkPageBreak(20);
    y = drawJustifiedText(doc, txt, marginLeft, contentWidth, y, lineHeight);
    y += sectionGap;
  }
  y += sectionGap;
  
  // Signature lines
  checkPageBreak(40);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(template.empresaNome, marginLeft, y); y += lineHeight;
  doc.text(templateType === 'mmatos' ? `CNPJ: ${template.cnpj}` : template.cnpj, marginLeft, y);
  y += lineHeight * 3;
  
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += lineHeight * 3;
  
  // Data do sinal
  checkPageBreak(25);
  setNormal();
  doc.text(`Data do Sinal: ${data.dataSinal}`, marginLeft, y);
  y += lineHeight + sectionGap;
  
  // LGPD (justified)
  const lgpdText = 'Em conformidade com a Lei Geral de Proteção de Dados (LGPD), Lei n.º 13.709/2018, o cliente consente expressamente com a utilização dos seus dados pessoais, fornecidos neste contrato a fins de contato e comunicação comercial pela empresa.';
  checkPageBreak(20);
  y = drawJustifiedText(doc, lgpdText, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;
  
  const digitalText = 'Ao confirmar e revisar este documento por via digital, estamos de acordo que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas dos envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o relativo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.';
  checkPageBreak(25);
  y = drawJustifiedText(doc, digitalText, marginLeft, contentWidth, y, lineHeight);
  
  // Save
  const fileName = `SINAL_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoPdfData };
