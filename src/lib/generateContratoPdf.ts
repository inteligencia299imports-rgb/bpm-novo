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
    logoPath: '/logos/299-logo.png',
  },
  mmatos: {
    empresaNome: 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA',
    cnpj: '21.194.795/0001-96',
    logoPath: '/logos/299-logo.png',
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

export async function generateContratoPdf(data: ContratoPdfData): Promise<void> {
  const templateType = getTemplateType(data.loja, data.empresaMotoInteresse);
  const template = TEMPLATES[templateType];
  
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 25;
  const marginRight = 25;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 15;
  
  // Load and add logo
  try {
    const logoData = await loadImage(template.logoPath);
    const logoWidth = templateType === 'ducati' ? 25 : 35;
    const logoHeight = templateType === 'ducati' ? 30 : 20;
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 5;
  } catch {
    y += 10;
  }
  
  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SINAL DE NEGÓCIO', pageWidth / 2, y, { align: 'center' });
  y += 8;
  
  // Company info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(template.empresaNome, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`CNPJ: ${template.cnpj}`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('Telefone: (61) 3710-5687', pageWidth / 2, y, { align: 'center' });
  y += 6;
  
  // Line separator
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 10;
  
  // Helper to check page break
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > 275) {
      doc.addPage();
      y = 20;
    }
  };
  
  // Section header helper
  const sectionHeader = (title: string) => {
    checkPageBreak(15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, marginLeft, y);
    y += 6;
  };
  
  // COMPRADOR
  sectionHeader('COMPRADOR');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += 5;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += 5;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += 8;
  
  // VENDEDOR
  sectionHeader('VENDEDOR: ' + data.vendedorNome);
  y += 4;
  
  // OBJETO
  sectionHeader('OBJETO');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Marca: ${data.produtoMarca}`, marginLeft, y); y += 5;
  doc.text(`Modelo: ${data.produtoModelo}`, marginLeft, y); y += 5;
  doc.text(`Fab/Mod: ${data.produtoAnoFabMod}`, marginLeft, y); y += 5;
  doc.text(`Placa/Chassi: ${data.produtoPlacaChassi}`, marginLeft, y); y += 8;
  
  // RECIBO DE SINAL DE NEGÓCIO
  sectionHeader('RECIBO DE SINAL DE NEGÓCIO');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const reciboText = `Recebemos o valor de ${data.valorSinal} a título de sinal de negócio, referente a compra de uma motocicleta descrita nas condições de negócio, reconhecido neste documento no campo "comprador" e assinando no campo "assinatura do cliente" declarando para os devidos fins que efetuei o sinal de negócio do veículo acima descrito no campo "condições da venda", e me comprometo a efetuar o pagamento do valor restante até o dia ${data.dataVencimento} conforme as condições da venda descritas neste recibo, o comprador também declara, estar ciente que o prazo para entrega da moto é de até 7 dias úteis após ter efetuado o pagamento total da mesma.`;
  const reciboLines = doc.splitTextToSize(reciboText, contentWidth);
  checkPageBreak(reciboLines.length * 5 + 5);
  doc.text(reciboLines, marginLeft, y);
  y += reciboLines.length * 5 + 8;
  
  // CONDIÇÕES DA VENDA
  sectionHeader('CONDIÇÕES DA VENDA');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Valor da Venda: ${data.valorVenda}, sendo:`, marginLeft, y); y += 7;
  
  // Moto troca
  if (data.troca) {
    checkPageBreak(45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Moto na Troca:', marginLeft, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Marca: ${data.troca.marca}`, marginLeft + 5, y); y += 5;
    doc.text(`Modelo: ${data.troca.modelo}`, marginLeft + 5, y); y += 5;
    doc.text(`Fab/Mod: ${data.troca.anoFabMod}`, marginLeft + 5, y); y += 5;
    doc.text(`Placa/Chassi: ${data.troca.placaChassi}`, marginLeft + 5, y); y += 5;
    doc.text(`Km: ${data.troca.km}`, marginLeft + 5, y); y += 5;
    doc.text(`Valor de Quitação: ${data.troca.valorQuitacao}`, marginLeft + 5, y); y += 5;
    doc.text(`Valor Negociado: ${data.troca.valorNegociado}`, marginLeft + 5, y); y += 7;
  }
  
  // Formas de pagamento
  for (const forma of data.formasPagamento) {
    checkPageBreak(8);
    doc.text(`${forma.descricao}: ${forma.valor}`, marginLeft, y); y += 5;
  }
  y += 5;
  
  // OBSERVAÇÕES
  sectionHeader('OBSERVAÇÕES');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (data.observacoes) {
    const obsLines = doc.splitTextToSize(data.observacoes, contentWidth);
    checkPageBreak(obsLines.length * 5 + 5);
    doc.text(obsLines, marginLeft, y);
    y += obsLines.length * 5 + 5;
  } else {
    y += 5;
  }
  y += 3;
  
  // CONDIÇÕES DO CONTRATO
  sectionHeader('CONDIÇÕES DO CONTRATO');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  const condicoesTexts = [
    'No caso de Arrependimento por parte do COMPRADOR, o mesmo perde o valor dado ao VENDEDOR. E se o Arrependimento por parte do VENDEDOR, o COMPRADOR pode exigir a devolução do valor em dobro. Art. 417. Se, por ocasião da conclusão do contrato, uma parte der à outra, a título de arras, dinheiro ou outro bem móvel, deverá as arras, em caso de execução, ser restituídas ou computadas nas prestações devidas, se do mesmo gênero da vida diretor.',
    'Art. 418. Se a parte que deu as arras não executar o contrato, poderá a outra tê-lo por desfeito, retendo-as; se a inexecução para quem recebeu as arras, poderá quem tiver o contrato por desfeito, e exigir sua devolução mais o equivalente, com atualizada segundo índices oficiais regularmente estabelecidos, juros e honorários de advogado.',
    'Art. 420. Se nenhum contrato para estipulado o direito de reclamação para qualquer das partes, as arras ou sinal terão função unicamente indenizatória. Neste caso, quem as deu perdê-las-á em benefício da outra parte; e quem recebeu devolvê-las-á, mais o equivalente. Em ambos os casos não há direito a indenização suplementar. (Código Civil – Lei 10.406/2001)',
  ];
  
  for (const txt of condicoesTexts) {
    const lines = doc.splitTextToSize(txt, contentWidth);
    checkPageBreak(lines.length * 4.5 + 4);
    doc.text(lines, marginLeft, y);
    y += lines.length * 4.5 + 4;
  }
  y += 8;
  
  // Signature lines
  checkPageBreak(40);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(template.empresaNome, marginLeft, y); y += 4;
  doc.text(templateType === 'mmatos' ? `CNPJ: ${template.cnpj}` : template.cnpj, marginLeft, y);
  y += 15;
  
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += 4;
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += 4;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += 10;
  
  // Page 2 - Data do sinal + LGPD
  checkPageBreak(30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data do Sinal: ${data.dataSinal}`, marginLeft, y);
  y += 8;
  
  doc.setFontSize(8);
  const lgpdText = 'Em conformidade com a Lei Geral de Proteção de Dados (LGPD), Lei n.º 13.709/2018, o cliente consente expressamente com a utilização dos seus dados pessoais, fornecidos neste contrato a fins de contato e comunicação comercial pela empresa.';
  const lgpdLines = doc.splitTextToSize(lgpdText, contentWidth);
  checkPageBreak(lgpdLines.length * 4 + 10);
  doc.text(lgpdLines, marginLeft, y);
  y += lgpdLines.length * 4 + 5;
  
  const digitalText = 'Ao confirmar e revisar este documento por via digital, estamos de acordo que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas dos envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o relativo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.';
  const digitalLines = doc.splitTextToSize(digitalText, contentWidth);
  checkPageBreak(digitalLines.length * 4);
  doc.text(digitalLines, marginLeft, y);
  
  // Save
  const fileName = `SINAL_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoPdfData };
