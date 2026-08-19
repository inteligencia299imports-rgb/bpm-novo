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
  produtoAnoFabricacao: string;
  produtoAnoModelo: string;
  produtoCor: string;
  produtoPlacaChassi: string;
  
  // Vendedor
  vendedorNome: string;
  
  // Valores
  valorSinal: string;
  valorVenda: string;
  
  // Transferência
  transferenciaTipo?: string | null;
  transferenciaValor?: string | null;
  
  // IPVA
  ipvaTipo?: string | null;
  ipvaCotas?: string | null;
  
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
  formasPagamento: {
    tipo: string;
    descricao: string;
    valor: string;
    financeira?: string;
    valorEntrada?: string;
    numeroParcelas?: number;
    valorParcelas?: string;
    valorFinanciado?: string;
  }[];
  
  // Observações
  observacoes: string;
  
  // Datas
  dataSinal: string;
  dataVencimento: string;
}

type TemplateType = 'ducati' | 'ducati_fln' | 'ducati_poa' | 'fag' | 'mmatos' | 'inter_poa_299' | 'inter_fln_299';

const TEMPLATES: Record<TemplateType, {
  empresaNome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  logoPath: string;
  comarca: string;
}> = {
  ducati: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/ducati-logo.png',
    comarca: 'Brasília/DF',
  },
  ducati_fln: {
    empresaNome: 'Intercontinental Motorsport LTDA',
    cnpj: '05.564.902/0001-74',
    endereco: 'R. São Bento, 125 A - Jardim Capoeiras, Florianópolis - SC, CEP: 88090-725',
    telefone: '(48) 3031-3992',
    logoPath: '/logos/ducati-logo.png',
    comarca: 'Florianópolis/SC',
  },
  ducati_poa: {
    empresaNome: 'INTERCONTINENTAL MOTORSPORT LTDA',
    cnpj: '05.564.902/0002-55',
    endereco: 'Rua Pereira Franco, 283 A - São João, Porto Alegre - RS, CEP: 90240-520',
    telefone: '(51) 3373-7608',
    logoPath: '/logos/ducati-logo.png',
    comarca: 'Porto Alegre/RS',
  },
  fag: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/299-logo.jpg',
    comarca: 'Brasília/DF',
  },
  mmatos: {
    empresaNome: 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA',
    cnpj: '21.194.795/0001-96',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/299-logo.jpg',
    comarca: 'Brasília/DF',
  },
  inter_poa_299: {
    empresaNome: 'INTERCONTINENTAL MOTORSPORT LTDA',
    cnpj: '05.564.902/0002-55',
    endereco: 'Rua Pereira Franco, 283 A - São João, Porto Alegre - RS, CEP: 90240-520',
    telefone: '(51) 3373-7608',
    logoPath: '/logos/299-logo.jpg',
    comarca: 'Porto Alegre/RS',
  },
  inter_fln_299: {
    empresaNome: 'Intercontinental Motorsport LTDA',
    cnpj: '05.564.902/0001-74',
    endereco: 'R. São Bento, 125 A - Jardim Capoeiras, Florianópolis - SC, CEP: 88090-725',
    telefone: '(48) 3031-3992',
    logoPath: '/logos/299-logo.jpg',
    comarca: 'Florianópolis/SC',
  },
};

function getTemplateType(loja: string, empresaMotoInteresse: string | null): TemplateType {
  const l = (loja || '').toUpperCase();
  if (l.includes('DUCATI')) {
    if (l.includes('FLN')) return 'ducati_fln';
    if (l.includes('POA')) return 'ducati_poa';
    return 'ducati';
  }
  if (l.includes('299P')) return 'inter_poa_299';
  if (l.includes('299F')) return 'inter_fln_299';
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

// Justified text helper with bold support and optional per-line page break
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

export type ContratoVariant = 'sinal' | 'venda';

export async function generateContratoPdf(data: ContratoPdfData, variant: ContratoVariant = 'sinal'): Promise<void> {
  const templateType = getTemplateType(data.loja, data.empresaMotoInteresse);
  const template = TEMPLATES[templateType];
  const isVenda = variant === 'venda';
  const is0km = templateType === 'ducati' || templateType === 'ducati_fln' || templateType === 'ducati_poa';

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
      // Ducati shield: constrain by height
      logoHeight = isVenda ? 18 : 24;
      logoWidth = logoHeight * aspect;
    } else {
      // 299 Imports: constrain by width
      logoWidth = isVenda ? 24 : 30;
      logoHeight = logoWidth / aspect;
    }
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 10;
  } catch {
    y += 10;
  }
  
  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(isVenda ? 'CONTRATO DE COMPRA E VENDA' : 'SINAL DE NEGÓCIO', pageWidth / 2, y, { align: 'center' });
  y += 7;
  
  // Company info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(template.empresaNome, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text(`CNPJ: ${template.cnpj}`, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text(template.endereco, pageWidth / 2, y, { align: 'center' });
  y += lineHeight;
  doc.text(`Telefone: ${template.telefone}`, pageWidth / 2, y, { align: 'center' });
  y += lineHeight + 2;
  
  // Line separator
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += sectionGap * 2;
  
  // Helper to check page break (block-level)
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > 297 - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  // Per-line page break for justified text (allows paragraphs to split across pages)
  const lineCheckPageBreak = (currentY: number, needed: number): number => {
    if (currentY + needed > 297 - marginBottom) {
      doc.addPage();
      return marginTop;
    }
    return currentY;
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
  
  const setBold = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
  };
  
  // COMPRADOR
  sectionHeader('COMPRADOR');
  setNormal();
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight + sectionGap;

  // OBJETO
  sectionHeader('OBJETO');
  setNormal();
  doc.text(`Marca: ${data.produtoMarca}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.produtoModelo}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.produtoAnoFabMod}`, marginLeft, y); y += lineHeight;
  if (!is0km) {
    doc.text(`Cor: ${data.produtoCor}`, marginLeft, y); y += lineHeight;
  }
  doc.text(`Placa/Chassi: ${data.produtoPlacaChassi}`, marginLeft, y); y += lineHeight + sectionGap;

  // TRANSFERÊNCIA
  if (data.transferenciaTipo) {
    checkPageBreak(10);
    setNormal();
    let transferenciaText = '';
    if (data.transferenciaTipo === 'cliente') {
      transferenciaText = `Transferência: O cliente pagará a transferência de propriedade da moto com a intermediação entre a 299 Imports e o DETRAN, no valor de ${data.transferenciaValor || '-'}.`;
    } else if (data.transferenciaTipo === 'loja') {
      transferenciaText = 'Transferência: A taxa de transferência será paga pela 299 Imports.';
    } else if (data.transferenciaTipo === 'outra_uf') {
      transferenciaText = 'Transferência: O cliente realizará a transferência de propriedade no seu estado de origem.';
    }
    if (transferenciaText) {
      y = drawJustifiedText(doc, transferenciaText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
      y += sectionGap;
    }
  }

  // IPVA
  if (data.ipvaTipo) {
    checkPageBreak(10);
    setNormal();
    let ipvaText = '';
    if (data.ipvaTipo === 'loja') {
      ipvaText = 'IPVA: Os débitos de IPVA e licenciamento referente ao ano de 2026 serão pagos pela 299 Imports.';
    } else if (data.ipvaTipo === 'cliente') {
      ipvaText = 'IPVA: Os débitos de IPVA e licenciamento referente ao ano de 2026 serão de responsabilidade do comprador.';
    } else if (data.ipvaTipo === 'ambos') {
      ipvaText = `IPVA: Os débitos de IPVA e licenciamento referente ao ano de 2026 serão divididos entre a empresa e o comprador, sendo que: as cotas de IPVA n° ${data.ipvaCotas || '-'} serão de responsabilidade do comprador, e as demais serão pagas pela 299 Imports.`;
    }
    if (ipvaText) {
      y = drawJustifiedText(doc, ipvaText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
      y += sectionGap;
    }
  }
  
  // RECIBO DE SINAL DE NEGÓCIO (justified with bold values) - not shown for venda
  if (!isVenda) {
    sectionHeader('RECIBO DE SINAL DE NEGÓCIO');
    setNormal();
    const reciboText = `Recebemos o valor de ${data.valorSinal} a título de sinal de negócio, referente a compra de uma motocicleta descrita nas condições de negócio, reconhecido neste documento no campo "comprador" e assinando no campo "assinatura do cliente" declarando para os devidos fins que efetuei o sinal de negócio do veículo acima descrito no campo "condições da venda", e me comprometo a efetuar o pagamento do valor restante até o dia ${data.dataVencimento} conforme as condições da venda descritas neste recibo, o comprador também declara, estar ciente que o prazo para entrega da moto é de até 7 dias úteis após ter efetuado o pagamento total da mesma.`;
    const reciboBoldSegments = [...data.valorSinal.split(/\s+/), ...data.dataVencimento.split(/\s+/)];
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, reciboText, marginLeft, contentWidth, y, lineHeight, reciboBoldSegments, lineCheckPageBreak);
    y += sectionGap;
  }
  
  // CONDIÇÕES DA VENDA
  sectionHeader('CONDIÇÕES DA VENDA');
  setNormal();
  setNormal();
  doc.text('Valor da Venda: ', marginLeft, y);
  const vvLabelW = doc.getTextWidth('Valor da Venda: ');
  setBold();
  doc.text(`${data.valorVenda}`, marginLeft + vvLabelW, y);
  const vvValW = doc.getTextWidth(`${data.valorVenda}`);
  setNormal();
  doc.text(', sendo:', marginLeft + vvLabelW + vvValW, y);
  y += lineHeight + sectionGap;
  
  // Moto troca
  if (data.troca) {
    checkPageBreak(lineHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.text('Moto na Troca:', marginLeft, y); y += lineHeight;
    setNormal();
    checkPageBreak(lineHeight);
    doc.text(`Marca: ${data.troca.marca}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Modelo: ${data.troca.modelo}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Fab/Mod: ${data.troca.anoFabMod}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Placa/Chassi: ${data.troca.placaChassi}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Km: ${data.troca.km}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Valor de Quitação: ${data.troca.valorQuitacao}`, marginLeft + 5, y); y += lineHeight;
    checkPageBreak(lineHeight);
    doc.text(`Valor Negociado: ${data.troca.valorNegociado}`, marginLeft + 5, y); y += lineHeight + sectionGap;
  }
  
  // Formas de pagamento
  for (const forma of data.formasPagamento) {
    if (forma.tipo === 'financiamento') {
      checkPageBreak(lineHeight);
      setBold();
      doc.text('Financiamento', marginLeft, y); y += lineHeight;
      setNormal();
      checkPageBreak(lineHeight);
      doc.text(`Banco: ${forma.financeira || '-'}`, marginLeft + 5, y); y += lineHeight;
      checkPageBreak(lineHeight);
      doc.text(`Valor de Entrada: ${forma.valorEntrada || '-'}`, marginLeft + 5, y); y += lineHeight;
      checkPageBreak(lineHeight);
      doc.text(`Nº Parcelas: ${forma.numeroParcelas || '-'}`, marginLeft + 5, y); y += lineHeight;
      checkPageBreak(lineHeight);
      doc.text(`Valor Parcelas: ${forma.valorParcelas || '-'}`, marginLeft + 5, y); y += lineHeight;
      checkPageBreak(lineHeight);
      doc.text(`Valor Financiado: ${forma.valorFinanciado || '-'}`, marginLeft + 5, y); y += lineHeight;
    } else {
      checkPageBreak(6);
      setNormal();
      doc.text(`${forma.descricao}: ${forma.valor}`, marginLeft, y); y += lineHeight;
    }
    y += sectionGap; // one line gap between each payment method
  }

  // Confirmação das formas de pagamento (apenas seminovas, venda)
  if (isVenda && !is0km) {
    const confirmacaoPagamento = 'As partes reconhecem que os valores acima descritos compõem a forma de pagamento ajustada neste contrato, conferindo plena quitação das respectivas parcelas após a efetiva compensação dos respectivos pagamentos.';
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, confirmacaoPagamento, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;
  }

  // OBSERVAÇÕES
  sectionHeader('OBSERVAÇÕES');
  setNormal();
  if (data.observacoes) {
    const obsLines = doc.splitTextToSize(data.observacoes, contentWidth);
    for (const ln of obsLines) {
      y = lineCheckPageBreak(y, lineHeight);
      doc.text(ln, marginLeft, y);
      y += lineHeight;
    }
  }
  y += sectionGap;

  // Preâmbulo de venda
  if (isVenda) {
    const preambuloVenda = is0km
      ? 'Pelo presente Contrato Particular de Compra e Venda Motocicleta, as partes acima qualificadas têm justo e contratado entre si, exercendo sua livre vontade e dentro dos padrões da boa-fé contratual, o abaixo convencionado.'
      : 'Pelo presente Contrato Particular de Compra e Venda, as partes acima qualificadas têm justo e contratado entre si, exercendo sua livre vontade e dentro dos padrões da boa-fé contratual, o abaixo convencionado.';
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, preambuloVenda, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;
  }

  // DO CONTRATO (justified) — antes das cláusulas e condições
  if (isVenda) {
    checkPageBreak(lineHeight * 2);
    setBold();
    doc.text('DO CONTRATO', marginLeft, y);
    y += lineHeight;
    setNormal();
    const doContratoParagrafos = is0km ? [
      'I. Natureza Jurídica: O presente instrumento é regido pelas disposições do Código Civil Brasileiro (Lei nº 10.406/2002), especialmente pelos artigos 481 e seguintes, que tratam do contrato de compra e venda.',
      'II. Disposição Legal: Fica ajustado que o presente contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores a qualquer título.',
    ] : [
      '1. Natureza Jurídica: Instrumento Particular de Compra e Venda de motocicleta com reserva de domínio e outros pactos, realizada de comum acordo e vontade das partes, isentas de qualquer coação ou vícios de consentimento;',
      '2. Disposição Legal: Art. 481 e seguintes do Código Civil, Art. 521 e seguintes do Código Civil, e demais normas vigentes pertinentes as matérias.',
    ];
    for (const p of doContratoParagrafos) {
      checkPageBreak(lineHeight);
      y = drawJustifiedText(doc, p, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    }
    y += sectionGap;
  }

  // CONDIÇÕES DO CONTRATO (justified)
  if (isVenda) {
    if (!is0km) {
      sectionHeader('CLÁUSULAS E CONDIÇÕES');
    }
    checkPageBreak(lineHeight);
    setNormal();
    const clausulasIntro = 'Mediante as cláusulas e condições adiante transcritas, o presente instrumento se regerá, sendo que as partes contratantes, mutuamente, aceitam e outorgam, comprometendo-se por si, seus herdeiros e sucessores em fazê-lo cumprir em todos seus termos:';
    y = drawJustifiedText(doc, clausulasIntro, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;
  } else {
    sectionHeader('CONDIÇÕES DO CONTRATO');
  }
  setNormal();


  if (isVenda) {
    const trocaMarca = data.troca?.marca || data.produtoMarca || '';
    // Intro
    const introVenda = `Pelo presente instrumento particular de compra e venda de motocicleta usada, de um lado, ${template.empresaNome}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${template.cnpj}, com sede em ${template.endereco}, doravante denominada simplesmente VENDEDORA, e, de outro lado, ${data.nomeCliente}, portador(a) do CPF/CNPJ nº ${data.cpfCnpj}, doravante denominado(a) COMPRADOR(A), têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições a seguir estabelecidas.`;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, introVenda, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;

    const clausulas: { titulo: string; paragrafos: string[] }[] = [
      is0km ? {
        titulo: 'CLÁUSULA PRIMEIRA – DO OBJETO',
        paragrafos: [
          `Compra e venda da motocicleta ZERO-QUILÔMETRO, marca ${data.produtoMarca}, modelo ${data.produtoModelo}, ano de fabricação ${data.produtoAnoFabricacao} e modelo ${data.produtoAnoModelo}, o qual é de propriedade e posse da VENDEDORA e se encontra livre e desembaraçado de quaisquer ônus.`,
          '§1º. O COMPRADOR declara que teve acesso aos manuais da motocicleta, assim como todas as informações acerca de seus opcionais, características técnicas, uso correto, revisões e garantia de fábrica (período, direitos e obrigações).',
          '§2º. O COMPRADOR declara que lhe foram prestadas todas as informações relativas às características técnicas da motocicleta, equipamentos, acessórios, forma correta de utilização, plano de revisões, condições da garantia de fábrica e demais esclarecimentos necessários à perfeita utilização do bem, declarando não possuir dúvidas quanto ao objeto adquirido.',
        ],
      } : {
        titulo: 'CLÁUSULA PRIMEIRA – DO OBJETO',
        paragrafos: [
          `Compra e venda da motocicleta usada, marca ${data.produtoMarca}, modelo ${data.produtoModelo} ano de fabricação ${data.produtoAnoFabricacao} e modelo ${data.produtoAnoModelo}, cor ${data.produtoCor}, placa ${data.produtoPlacaChassi}, o qual é de propriedade e posse da VENDEDORA e se encontra livre e desembaraçado de quaisquer ônus.`,
          '§1º. O COMPRADOR declara que teve acesso aos manuais da motocicleta, assim como todas as informações acerca de seus opcionais, características técnicas, uso correto, revisões e garantia de fábrica (período, direitos e obrigações).',
          '§2º. O COMPRADOR declara que lhe foi oportunizado avaliar a motocicleta em oficina de sua confiança, e que está ciente que a motocicleta objeto deste contrato é usada e apresenta um desgaste natural decorrente do tempo e uso, já tendo sido devidamente vistoriado e inspecionado pelo mesmo, o qual tomou ciência de suas condições, funções, características e estado de conservação e funcionamento, não tendo delas o que reclamar no presente ou no futuro a qualquer título.',
          '§3º. O COMPRADOR declara que teve pleno acesso à motocicleta objeto deste contrato antes da aquisição, podendo submetê-la à vistoria de sua confiança, tendo examinado seu estado geral de conservação, funcionamento, características, opcionais e quilometragem, declarando estar ciente de que se trata de veículo seminovo, compatível com o tempo de uso e quilometragem apresentados.',
        ],
      },
      is0km ? {
        titulo: 'CLÁUSULA SEGUNDA – DO PAGAMENTO E SUA FORMA',
        paragrafos: [
          `O COMPRADOR pagará à VENDEDORA, pelo objeto descrito na Cláusula Primeira, o valor de ${data.valorVenda}, na forma e condições descritas nas condições da venda acima estabelecidas.`,
          '§1º. O pagamento poderá ser realizado por meio de recursos próprios, financiamento bancário, consórcio, dação em pagamento (troca) ou quaisquer outras modalidades previamente ajustadas entre as partes.',
          '§2º. Em caso de financiamento, o COMPRADOR se obriga a apresentar toda a documentação necessária à instituição financeira e a arcar com as taxas, juros e encargos decorrentes da operação.',
          '§3º. O eventual ANUENTE, quando indicado, assume solidariamente as obrigações aqui pactuadas, inclusive quanto ao pagamento e à regularidade do bem.',
          '§4º. Os documentos para a transferência da motocicleta dado em pagamento serão preenchidos diretamente, inclusive com firma reconhecida, em nome da VENDEDORA, ou de terceiro por ela indicado, em um prazo máximo de dois dias após a assinatura deste instrumento, sem que o Promissário ofereça qualquer embaraço para tal ato. A violação ao estipulado neste parágrafo sujeita o COMPRADOR ao pagamento de multa de 10% (dez por cento) sobre o valor total da transação.',
          '§5º. A tradição da motocicleta dado em pagamento se dá neste momento, sendo que a VENDEDORA, a partir da data da assinatura deste, passa a exercer a posse direta sobre o mesmo, motivo pelo qual assume a responsabilidade pelo seu uso, como multas, tributos, entre outras que se façam necessárias à sua manutenção e guarda.',
          `§6º. Considerando a implementação de políticas de Prevenção e Combate à Lavagem de Dinheiro e Ocultação de Bens, Direitos e Valores, e com base na Carta Circular nº 3.978 e 4.001 publicada pelo Banco Central do Brasil, DECLARA o COMPRADOR que a dação em pagamento da motocicleta, marca ${data.troca?.marca || ''}, de propriedade da ANUENTE, ocorre pelo fato de possuírem vínculo conjugal.`,
          '§7º. Caso, por solicitação exclusiva do COMPRADOR, o veículo já tenha sido faturado, emplacado, registrado ou tenha havido contratação de financiamento e, posteriormente, haja desistência da aquisição sem justa causa, o COMPRADOR responsabilizar-se-á pelo ressarcimento das despesas efetivamente suportadas pela VENDEDORA, sem prejuízo dos direitos assegurados ao consumidor pela legislação aplicável.',
        ],
      } : {
        titulo: 'CLÁUSULA SEGUNDA – DO PAGAMENTO E SUA FORMA',
        paragrafos: [
          `O COMPRADOR pagará à VENDEDORA, pelo objeto descrito na Cláusula Primeira, o valor de ${data.valorVenda}, na forma e condições descritas nas condições da venda acima estabelecidas.`,
          '§1º. O pagamento poderá ser realizado por meio de recursos próprios, financiamento bancário, consórcio, dação em pagamento (troca) ou quaisquer outras modalidades previamente ajustadas entre as partes.',
          '§2º. Em caso de financiamento, o COMPRADOR se obriga a apresentar toda a documentação necessária à instituição financeira e a arcar com as taxas, juros e encargos decorrentes da operação.',
          '§3º. O eventual ANUENTE, quando indicado, assume solidariamente as obrigações aqui pactuadas, inclusive quanto ao pagamento e à regularidade do bem.',
          '§4º. A quitação integral do preço é condição essencial para a transferência definitiva da propriedade da motocicleta.',
          '§5º. A tradição da motocicleta dado em pagamento se dá neste momento, sendo que a VENDEDORA, a partir da data da assinatura deste, passa a exercer a posse direta sobre o mesmo, motivo pelo qual assume a responsabilidade pelo seu uso, como multas, tributos, entre outras que se façam necessárias à sua e guarda.',
          '§6º. Caso, por solicitação exclusiva do COMPRADOR, tenha sido emitida documentação, providenciado registro, transferência, contratação de financiamento ou praticado qualquer ato administrativo para conclusão da negociação, eventual desistência injustificada implicará o ressarcimento das despesas efetivamente suportadas pela VENDEDORA, observada a legislação aplicável.',
        ],
      },
      ...(is0km ? [
        {
          titulo: 'CLÁUSULA TERCEIRA – PACTO DE RESERVA DE DOMÍNIO',
          paragrafos: [
            'Por força do pacto de reserva de domínio, aqui expressamente instituído e aceito pelas partes, fica reservada à VENDEDORA a propriedade do bem descrito e caracterizado na cláusula primeira deste instrumento, até a comprovação, pelo COMPRADOR, do cumprimento integral das obrigações decorrentes deste contrato, em especial quanto ao pagamento do preço e encargos pela aquisição.',
          ],
        },
        {
          titulo: 'CLÁUSULA QUARTA – DAS OBRIGAÇÕES DO COMPRADOR',
          paragrafos: [
            'O COMPRADOR, a partir da data da assinatura deste contrato, torna-se automaticamente responsável pela motocicleta objeto da compra e venda, inclusive com relação a todos os tributos incidentes sobre o mesmo, multas, seguros e demais responsabilidades civis, administrativas e criminais decorrentes de sua guarda, depósito, manutenção e uso.',
            '§1º. Compete ao COMPRADOR a transferência do veículo perante os órgãos administrativos competentes, que deverá efetuá-la no prazo máximo de 10 dias a contar do recebimento da nota fiscal, somente após a devida quitação do valor estabelecido neste instrumento.',
            'I. A inobservância do §1º sujeita a aplicação de multa de 10% (dez por cento) sobre o valor total da transação, sem prejuízo das perdas e danos porventura sofridos pela VENDEDORA, cabendo a esta, inclusive direito de regresso em face do COMPRADOR.',
            'II. Caso a VENDEDORA seja acionada judicialmente em virtude de atos e fatos relativos ao veículo objeto deste contrato, em função do não adimplemento do COMPRADOR de qualquer das responsabilidades previstas no caput da presente cláusula, ou desrespeito à previsão do §1º, convenciona-se a denunciação da lide ao COMPRADOR, sendo este responsável por indenizar os prejuízos que porventura sofridos pela VENDEDORA em Juízo e fora dele, na forma do art. 70, inciso III, do Código de Processo Civil, além das despesas advocatícias, honorários de sucumbência, custas judiciais e demais que se façam necessárias à completa e eficiente defesa da VENDEDORA.',
            '§2º. O COMPRADOR obriga-se a manter atualizados seus dados cadastrais perante a VENDEDORA, reputando-se válidas todas as comunicações encaminhadas aos endereços físicos e eletrônicos, e-mail e número de telefone informados neste contrato, até comunicação formal de alteração.',
            '§3º. As partes reconhecem como válidas as comunicações realizadas por meios eletrônicos, inclusive e-mail, aplicativo WhatsApp e demais plataformas digitais utilizadas pela VENDEDORA, desde que enviadas aos contatos fornecidos pelo COMPRADOR.',
            '§4º. O COMPRADOR declara ciência de que modificações nas características originais da motocicleta, bem como a instalação de acessórios ou equipamentos não homologados pela fabricante, poderão acarretar restrições ou perda da garantia contratual relativamente aos componentes afetados, conforme normas da fabricante.',
          ],
        },
        {
          titulo: 'CLÁUSULA QUINTA – DO LOCAL DE RETIRADA DA MOTOCICLETA',
          paragrafos: [
            'A entrega da motocicleta dar-se-á na sede da VENDEDORA, sendo o COMPRADOR responsável pela remoção física do bem no momento quando comunicado de sua chegada, salvo negociação em contrário entre as partes.',
            '§1º. A partir da entrega da motocicleta ao COMPRADOR ou a terceiro por ele indicado, todos os riscos relacionados ao bem, inclusive perdas, furtos, roubos, avarias, multas, tributos e demais responsabilidades passam a ser exclusivamente do COMPRADOR.',
            '§2º. Comunicada a disponibilidade da motocicleta para retirada, caso o COMPRADOR deixe de retirá-la no prazo de 10 (dez) dias, sem justificativa aceita pela VENDEDORA, esta poderá promover a cobrança das despesas decorrentes de guarda e armazenamento, mediante prévia comunicação.',
            '§3º. No ato da entrega será realizada entrega técnica da motocicleta, ocasião em que o COMPRADOR receberá orientações acerca do funcionamento do veículo, revisões periódicas, garantia de fábrica, utilização dos equipamentos, acessórios, comandos eletrônicos e demais informações pertinentes, declarando recebê-las de forma clara e suficiente.',
          ],
        },
        {
          titulo: 'CLÁUSULA SEXTA – DA GARANTIA',
          paragrafos: [
            'Todas as especificações de manutenção, bem como o prazo de garantia contratual dos produtos entregues e que integram a motocicleta deste instrumento, constam do Manual de Garantias elaborado pela montadora, neste ato recebido pelo COMPRADOR, que devem ser observadas para fins de eventual responsabilidade civil, caracterizando-se como fundamental para fins de reparação de eventuais defeitos/vícios.',
            'I. A garantia contratual e as dicas para manutenção adequada, seguem padrões de normas técnicas e de razoabilidade do tempo de desgaste de cada produto indicados pela própria montadora;',
            'II. Ao término da garantia contratual passará a ser observado o prazo de 90 (noventa) dias previsto no Código de Defesa do Consumidor para eventuais reclamações em face dos produtos entregues pela VENDEDORA ter apresentado defeitos ou vícios aparentes;',
            'III. Após o término do prazo da garantia contratual, acrescida do prazo de 90 (noventa) dias acima disposto, a VENDEDORA não estará mais obrigada a proceder a manutenção ou eventual troca dos produtos que sejam impróprios ou tenham reduzidas a sua capacidade, exceto nos casos em que se tratem de vícios ocultos, cujo prazo para reclamação se iniciará quando seu conhecimento.',
            'IV. A garantia não abrange desgaste natural decorrente da utilização normal da motocicleta, itens considerados de consumo, danos ocasionados por acidente, queda, uso inadequado, negligência, utilização em desacordo com as orientações do fabricante, combustível inadequado, eventos externos, caso fortuito ou força maior.',
            'V. A instalação de acessórios, equipamentos, modificações mecânicas, elétricas ou eletrônicas, remapeamento, alterações de software ou quaisquer intervenções não homologadas pela fabricante poderá acarretar a exclusão da cobertura da garantia em relação aos componentes afetados, conforme critérios técnicos da fabricante.',
            'VI. Eventuais vícios ocultos observarão o regime jurídico previsto no Código de Defesa do Consumidor, iniciando-se o prazo para reclamação a partir da constatação do defeito, na forma da legislação aplicável.',
            'Parágrafo Único. Os pneus, bateria e demais componentes cuja garantia seja prestada diretamente por seus respectivos fabricantes estarão sujeitos às condições específicas por eles estabelecidas, sem prejuízo da garantia legal prevista na legislação aplicável.',
          ],
        },
        {
          titulo: 'CLÁUSULA SÉTIMA – DA RESCISÃO CONTRATUAL',
          paragrafos: [
            'No caso de descumprimento de quaisquer das cláusulas previstas neste instrumento, à parte prejudicada caberá o direito de rescisão contratual, desde que previamente notificada a parte inadimplente, mediante meio escrito, idôneo e de comprovado recebimento, para que cumpra a obrigação inadimplida em prazo não inferior a 10 (dez) dias do recebimento da referida notificação;',
            '§1º. Em havendo a rescisão contratual, a motocicleta voltará à propriedade e posse da VENDEDORA, no estado em que se encontrava quando da assinatura do presente contrato e os valores eventualmente pagos pelo COMPRADOR, salvo aqueles dados a título de sinal de negócio, serão ao mesmo ressarcidos, corrigidos pelo índice IGP-M/FGV, ou outro que o substitua.',
            '§2º. Na hipótese de a devolução da motocicleta se tornar impossível, por qualquer razão ou motivo, deverá o COMPRADOR ressarcir a VENDEDORA em perdas e danos equivalentes ao valor total desta negociação, devidamente corrigido pelo índice IGP-M/FGV, ou outro que o substitua.',
            '§3º. Salvo negociação em contrário entre as partes, a devolução da motocicleta e dos valores eventualmente pagos pelo COMPRADOR, serão realizadas no prazo máximo de 10 (dez) dias a contar da comprovação do recebimento da notificação escrita de rescisão contratual.',
            '§4º. Em não sendo cumprido o prazo estipulado no parágrafo acima, a parte inadimplente pagará à prejudicada, a título de cláusula penal, o valor de 10% (dez por cento) sobre o total desta negociação, que será mantido atualizado pelo índice IGP-M/FGV, além de juros de mora de 1% (um por cento) ao mês sobre o valor de compra e venda do veículo no caso de ressarcimento à VENDEDORA, ou dos eventualmente pagos pelo COMPRADOR no caso de ressarcimento ao mesmo.',
            '§5º. O inadimplemento reiterado de qualquer obrigação contratual ou o abandono da motocicleta nas dependências da VENDEDORA por período superior a 30 (trinta) dias, após regular notificação, autoriza a adoção das medidas judiciais e extrajudiciais cabíveis para resguardar os direitos da VENDEDORA.',
          ],
        },
        {
          titulo: 'CLÁUSULA OITAVA – DAS DISPOSIÇÕES FINAIS',
          paragrafos: [
            `As partes, em comum acordo, elegem o Foro da Comarca de ${template.comarca}, para dirimirem quaisquer dúvidas a respeito do presente contato, renunciando a qualquer outro por mais privilegiado que seja.`,
          ],
        },
      ] : [
        {
          titulo: 'CLÁUSULA TERCEIRA – PACTO DE RESERVA DE DOMÍNIO',
          paragrafos: [
            'Por força do pacto de reserva de domínio, aqui expressamente instituído e aceito pelas partes, fica reservada à VENDEDORA a propriedade do bem descrito e caracterizado na cláusula primeira deste instrumento, até a comprovação, pelo COMPRADOR, do cumprimento integral das obrigações decorrentes deste contrato, em especial quanto ao pagamento do preço e encargos pela aquisição.',
          ],
        },
        {
          titulo: 'CLÁUSULA QUARTA – DAS OBRIGAÇÕES DO COMPRADOR',
          paragrafos: [
            'O COMPRADOR, a partir da data da assinatura deste contrato, torna-se automaticamente responsável pela motocicleta objeto da compra e venda, inclusive com relação a todos os tributos incidentes sobre o mesmo, multas, seguros e demais responsabilidades civis, administrativas e criminais decorrentes de sua guarda, depósito, manutenção e uso.',
            '§1º. Compete ao COMPRADOR a transferência da motocicleta perante os órgãos administrativos competentes, que deverá efetuá-la no prazo máximo de 10 dias a contar do recebimento da nota fiscal, somente após a devida quitação do valor estabelecido neste instrumento.',
            '§2º. O COMPRADOR obriga-se a manter atualizados seus dados cadastrais, reputando-se válidas as comunicações encaminhadas aos endereços físico e eletrônico, inclusive e-mail e aplicativo WhatsApp, informados neste contrato.',
            '§3º. As partes reconhecem como válidas as comunicações eletrônicas realizadas pela VENDEDORA aos contatos fornecidos pelo COMPRADOR.',
            '§4º. A instalação de acessórios, equipamentos ou modificações não homologadas pelo fabricante poderá acarretar restrições à cobertura da garantia relativamente aos componentes afetados.',
            '§5º. A inobservância do §1º sujeita a aplicação de multa de 10% (dez por cento) sobre o valor total da transação, sem prejuízo das perdas e danos porventura sofridos pela VENDEDORA, cabendo a esta, inclusive direito de regresso em face do COMPRADOR.',
            '§6º. Caso a VENDEDORA seja acionada judicialmente em virtude de atos e fatos relativos a motocicleta objeto deste contrato, em função do não adimplemento do COMPRADOR de qualquer das responsabilidades previstas no caput da presente cláusula, ou desrespeito à previsão do §1º, convenciona-se a denunciação da lide ao COMPRADOR, sendo este responsável por indenizar os prejuízos que porventura sofridos pela VENDEDORA em Juízo e fora dele, na forma do art. 70, inciso III, do Código de Processo Civil, além das despesas advocatícias, honorários de sucumbência, custas judiciais e demais que se façam necessárias à completa e eficiente defesa da VENDEDORA.',
          ],
        },
        {
          titulo: 'CLÁUSULA QUINTA – DO LOCAL DE RETIRADA DA MOTOCICLETA',
          paragrafos: [
            'A entrega da motocicleta dar-se-á na sede da VENDEDORA, sendo o COMPRADOR responsável pela remoção física do bem no momento quando comunicado de sua chegada, salvo negociação em contrário entre as partes.',
            '§1º. A partir da entrega da motocicleta ao COMPRADOR ou a terceiro por ele indicado, todos os riscos relacionados ao bem, inclusive perdas, furtos, roubos, avarias, multas, tributos e demais responsabilidades passam a ser exclusivamente do COMPRADOR.',
            '§2º. Comunicada a disponibilidade da motocicleta para retirada, caso o COMPRADOR deixe de retirá-la no prazo de 10 (dez) dias, sem justificativa aceita pela VENDEDORA, esta poderá promover a cobrança das despesas decorrentes de guarda e armazenamento, mediante prévia comunicação.',
          ],
        },
        {
          titulo: 'CLÁUSULA SEXTA – DA GARANTIA',
          paragrafos: [
            'Todas as especificações de manutenção, bem como o prazo de garantia contratual dos produtos entregues e que integram a motocicleta deste instrumento, constam do Manual de Garantias elaborado pela montadora, neste ato recebido pelo COMPRADOR, que devem ser observadas para fins de eventual responsabilidade civil, caracterizando-se como fundamental para fins de reparação de eventuais defeitos/vícios.',
            '§1º. A garantia contratual e as dicas para manutenção adequada, seguem padrões de normas técnicas e de razoabilidade do tempo de desgaste de cada produto indicados pela própria montadora;',
            '§2º. Ao término da garantia contratual passará a ser observado o prazo de 90 (noventa) dias previsto no Código de Defesa do Consumidor para eventuais reclamações em face dos produtos entregues pela VENDEDORA ter apresentado defeitos ou vícios aparentes;',
            '§3º. Após o término do prazo da garantia contratual, acrescida do prazo de 90 (noventa) dias acima disposto, a VENDEDORA não estará mais obrigada a proceder a manutenção ou eventual troca dos produtos que sejam impróprios ou tenham reduzidas a sua capacidade, exceto nos casos em que se tratem de vícios ocultos, cujo prazo para reclamação se iniciará quando seu conhecimento.',
            'Parágrafo Único. Os pneus são cobertos separadamente por seu fabricante.',
          ],
        },
        {
          titulo: 'CLÁUSULA SÉTIMA – DA RESCISÃO CONTRATUAL',
          paragrafos: [
            'No caso de descumprimento de quaisquer das cláusulas previstas neste instrumento, à parte prejudicada caberá o direito de rescisão contratual, desde que previamente notificada a parte inadimplente, mediante meio escrito, idôneo e de comprovado recebimento, para que cumpra a obrigação inadimplida em prazo não inferior a 10 (dez) dias do recebimento da referida notificação;',
            '§1º. Em havendo a rescisão contratual, o veículo voltará à propriedade e posse da VENDEDORA, no estado em que se encontrava quando da assinatura do presente contrato e os valores eventualmente pagos pelo COMPRADOR, salvo aqueles dados a título de sinal de negócio, serão ao mesmo ressarcidos, corrigidos pelo índice IGP-M/FGV, ou outro que o substitua.',
            '§2º. Na hipótese de a devolução da motocicleta se tornar impossível, por qualquer razão ou motivo, deverá o COMPRADOR ressarcir a VENDEDORA em perdas e danos equivalentes ao valor total desta negociação, devidamente corrigido pelo índice IGP-M/FGV, ou outro que o substitua.',
            '§3º. Salvo negociação em contrário entre as partes, a devolução da motocicleta e dos valores eventualmente pagos pelo COMPRADOR, serão realizadas no prazo máximo de 10 (dez) dias a contar da comprovação do recebimento da notificação escrita de rescisão contratual.',
            '§4º. Em não sendo cumprido o prazo estipulado no parágrafo acima, a parte inadimplente pagará à prejudicada, a título de cláusula penal, o valor de 10% (dez por cento) sobre o total desta negociação, que será mantido atualizado pelo índice IGP-M/FGV, além de juros de mora de 1% (um por cento) ao mês sobre o valor de compra e venda da motocicleta no caso de ressarcimento à VENDEDORA, ou dos eventualmente pagos pelo COMPRADOR no caso de ressarcimento ao mesmo.',
            '§5º. O abandono da motocicleta nas dependências da VENDEDORA por período superior a 30 (trinta) dias, após notificação, autoriza a adoção das medidas judiciais e extrajudiciais cabíveis.',
          ],
        },
        {
          titulo: 'CLÁUSULA OITAVA – DAS DISPOSIÇÕES FINAIS',
          paragrafos: [
            `As partes, em comum acordo, elegem o Foro da Comarca de ${template.comarca}, para dirimirem quaisquer dúvidas a respeito do presente contato, renunciando a qualquer outro por mais privilegiado que seja.`,
            'O COMPRADOR declara que, previamente a aquisição da motocicleta objeto deste contrato, recebeu clara e satisfatoriamente as informações sobre o valor dos tributos incidentes na comercialização e da situação de regularidade, bem como sobre a inexistência de multas, taxas, débitos de impostos (inclusive a periodicidade de incidência) ou quaisquer fatos conhecidos que limitem ou impeçam a circulação do veículo. Igualmente lhe foi esclarecido sobre a não existência de registros conhecidos de furto ou de registro de gravame (alienação fiduciária). Recebeu o alerta que as informações fornecidas sobre a regularidade poderão ser obtidas e confirmadas nos sítios eletrônicos das autoridades policiais, de trânsito e fazendárias da unidade da Federação onde o veículo está registrado. A presente declaração tem como finalidade o cumprimento do quanto disposto na Lei 13.111/15 cujo texto teve ciência.',
          ],
        },
      ]),
    ];

    for (const cl of clausulas) {
      checkPageBreak(lineHeight * 2);
      setBold();
      doc.text(cl.titulo, marginLeft, y);
      y += lineHeight;
      setNormal();
      for (const p of cl.paragrafos) {
        checkPageBreak(lineHeight);
        y = drawJustifiedText(doc, p, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
      }
      y += sectionGap;
    }
    y += sectionGap;
  } else {
    const condicoesTexts = [
      'No caso de Arrependimento por parte do COMPRADOR, o mesmo perde o valor dado ao VENDEDOR. E se o Arrependimento por parte do VENDEDOR, o COMPRADOR pode exigir a devolução do valor em dobro. Art. 417. Se, por ocasião da conclusão do contrato, uma parte der à outra, a título de arras, dinheiro ou outro bem móvel, deverá as arras, em caso de execução, ser restituídas ou computadas nas prestações devidas, se do mesmo gênero da vida diretor.',
      'Art. 418. Se a parte que deu as arras não executar o contrato, poderá a outra tê-lo por desfeito, retendo-as; se a inexecução para quem recebeu as arras, poderá quem tiver o contrato por desfeito, e exigir sua devolução mais o equivalente, com atualizada segundo índices oficiais regularmente estabelecidos, juros e honorários de advogado.',
      'Art. 420. Se nenhum contrato para estipulado o direito de reclamação para qualquer das partes, as arras ou sinal terão função unicamente indenizatória. Neste caso, quem as deu perdê-las-á em benefício da outra parte; e quem recebeu devolvê-las-á, mais o equivalente. Em ambos os casos não há direito a indenização suplementar. (Código Civil – Lei 10.406/2001)',
    ];

    for (const txt of condicoesTexts) {
      checkPageBreak(lineHeight);
      y = drawJustifiedText(doc, txt, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
      y += sectionGap;
    }
    y += sectionGap;
  }
  
  // Signature lines - spacing for digital signature
  checkPageBreak(lineHeight * 5 + 50);
  y += lineHeight * 5; // space before company signature for digital signature
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(template.empresaNome, marginLeft, y); y += lineHeight;
  doc.text(templateType === 'mmatos' ? `CNPJ: ${template.cnpj}` : template.cnpj, marginLeft, y);
  y += lineHeight * 8;
  
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += sectionGap * 2;
  
  // Data do sinal / venda
  checkPageBreak(lineHeight);
  setNormal();
  const dataLabel = isVenda ? 'Data da Venda: ' : 'Data do Sinal: ';
  doc.text(dataLabel, marginLeft, y);
  const dsLabelW = doc.getTextWidth(dataLabel);
  setBold();
  doc.text(data.dataSinal, marginLeft + dsLabelW, y);
  setNormal();
  y += lineHeight + sectionGap;

  if (!isVenda) {
    // LGPD (justified)
    const lgpdText = 'Em conformidade com a Lei Geral de Proteção de Dados (LGPD), Lei n.º 13.709/2018, o cliente consente expressamente com a utilização dos seus dados pessoais, fornecidos neste contrato a fins de contato e comunicação comercial pela empresa.';
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, lgpdText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;

    const digitalText = 'Ao confirmar e revisar este documento por via digital, estamos de acordo que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas dos envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o relativo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.';
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, digitalText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  } else {
    // Venda: declarações finais após assinaturas
    const vendaDeclParas = [
      'O COMPRADOR declara que, previamente a aquisição do veículo objeto deste contrato, recebeu clara e satisfatoriamente as informações sobre o valor dos tributos incidentes na comercialização e da situação de regularidade, bem como sobre a inexistência de multas, taxas, débitos de impostos (inclusive a periodicidade de incidência) ou quaisquer fatos conhecidos que limitem ou impeçam a circulação do veículo. Igualmente lhe foi esclarecido sobre a não existência de registros conhecidos de furto ou de registro de gravame (alienação fiduciária). Recebeu o alerta que as informações fornecidas sobre a regularidade poderão ser obtidas e confirmadas nos sítios eletrônicos das autoridades policiais, de trânsito e fazendárias da unidade da Federação onde o veículo está registrado. A presente declaração tem como finalidade o cumprimento do quanto disposto na Lei 13.111/15 cujo texto teve ciência.',
      'A VENDEDORA declara que cumpre a Lei 13709/2028 – Lei Geral de Privacidade de Dados – LGPD e que utiliza dados pessoais para cumprimentos de requisitos legais, compartilhamento de informações por obrigações com ao fabricante, contatos para avisos de garantia e, quando consentido, campanhas de marketing. Mais informações estão constantes em nossa Política de Privacidade no endereço eletrônico https://ducatiflorianopolis.com.br/politica-de-privacidade.',
      'A eventual tolerância de qualquer das partes quanto ao descumprimento de obrigação prevista neste contrato constituirá mera liberalidade, não implicando renúncia de direito, alteração contratual ou novação. As partes reconhecem como válidas as assinaturas eletrônicas apostas neste instrumento, bem como aquelas realizadas por plataformas certificadas, produzindo os mesmos efeitos jurídicos das assinaturas manuscritas.',
      'E por estarem assim justos e contratados, assinam o presente Contrato de Compra e Venda, na presença de duas testemunhas, que a tudo assistiram e conhecimentos tiveram, para que surta os seus jurídicos e legais efeitos.',
    ];
    setNormal();
    for (const p of vendaDeclParas) {
      checkPageBreak(lineHeight);
      y = drawJustifiedText(doc, p, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
      y += sectionGap;
    }
  }
  
  // Save
  const fileName = `${isVenda ? 'CONTRATO_VENDA' : 'SINAL'}_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoPdfData };
