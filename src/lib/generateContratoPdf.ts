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

type TemplateType = 'ducati' | 'ducati_fln' | 'ducati_poa' | 'fag' | 'mmatos';

const TEMPLATES: Record<TemplateType, {
  empresaNome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  logoPath: string;
}> = {
  ducati: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/ducati-logo.png',
  },
  ducati_fln: {
    empresaNome: 'Intercontinental Motorsport LTDA',
    cnpj: '05.564.902/0001-74',
    endereco: 'Rua Professor Egidio Ferreira 198, Capoeiras - 88090-500 - Florianópolis, SC',
    telefone: '(48) 3031-3992',
    logoPath: '/logos/ducati-logo.png',
  },
  ducati_poa: {
    empresaNome: 'INTERCONTINENTAL MOTORSPORT LTDA',
    cnpj: '05.564.902/0002-55',
    endereco: 'Pereira Franco 283-A, São João - 90240-520 - Porto Alegre, RS',
    telefone: '(51) 3373-7608',
    logoPath: '/logos/ducati-logo.png',
  },
  fag: {
    empresaNome: 'FAG SOLUCOES E COMERCIO DE VEICULOS LTDA',
    cnpj: '49.580.035/0001-36',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/299-logo.jpg',
  },
  mmatos: {
    empresaNome: 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA',
    cnpj: '21.194.795/0001-96',
    endereco: 'SCIA Quadra 15 Conjunto 3, Nº 6, Loja 6 - 71250-015 - Brasília, DF',
    telefone: '(61) 3710-5687',
    logoPath: '/logos/299-logo.jpg',
  },
};

function getTemplateType(loja: string, empresaMotoInteresse: string | null): TemplateType {
  const l = (loja || '').toUpperCase();
  if (l.includes('DUCATI')) {
    if (l.includes('FLN')) return 'ducati_fln';
    if (l.includes('POA')) return 'ducati_poa';
    return 'ducati';
  }
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

// Justified text helper with bold support using **text** markers
function drawJustifiedText(doc: jsPDF, text: string, x: number, maxWidth: number, y: number, lineHeight: number, boldSegments?: string[]): number {
  // First, split text to size using normal font to get line breaks
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth);
  
  for (let i = 0; i < lines.length; i++) {
    const line: string = lines[i];
    const isLastLine = i === lines.length - 1;
    
    if (!boldSegments || boldSegments.length === 0) {
      // No bold segments - simple rendering
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
      // Render with bold segments
      const words = line.split(/\s+/);
      
      // Calculate space width for justification
      let spaceWidth: number;
      if (isLastLine || words.length <= 1) {
        doc.setFont('helvetica', 'normal');
        spaceWidth = doc.getTextWidth(' ');
      } else {
        // Calculate total words width considering bold
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
        // Check if this word is part of a bold segment
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
    y += logoHeight + 6;
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
  
  // VENDEDOR
  sectionHeader('VENDEDOR:');
  setNormal();
  doc.text(data.vendedorNome, marginLeft, y); y += lineHeight;
  y += sectionGap;
  
  // OBJETO
  sectionHeader('OBJETO');
  setNormal();
  doc.text(`Marca: ${data.produtoMarca}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.produtoModelo}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.produtoAnoFabMod}`, marginLeft, y); y += lineHeight;
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
      y = drawJustifiedText(doc, transferenciaText, marginLeft, contentWidth, y, lineHeight);
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
      y = drawJustifiedText(doc, ipvaText, marginLeft, contentWidth, y, lineHeight);
      y += sectionGap;
    }
  }
  
  // RECIBO DE SINAL DE NEGÓCIO (justified with bold values) - not shown for venda
  if (!isVenda) {
    sectionHeader('RECIBO DE SINAL DE NEGÓCIO');
    setNormal();
    const reciboText = `Recebemos o valor de ${data.valorSinal} a título de sinal de negócio, referente a compra de uma motocicleta descrita nas condições de negócio, reconhecido neste documento no campo "comprador" e assinando no campo "assinatura do cliente" declarando para os devidos fins que efetuei o sinal de negócio do veículo acima descrito no campo "condições da venda", e me comprometo a efetuar o pagamento do valor restante até o dia ${data.dataVencimento} conforme as condições da venda descritas neste recibo, o comprador também declara, estar ciente que o prazo para entrega da moto é de até 7 dias úteis após ter efetuado o pagamento total da mesma.`;
    const reciboBoldSegments = [...data.valorSinal.split(/\s+/), ...data.dataVencimento.split(/\s+/)];
    checkPageBreak(40);
    y = drawJustifiedText(doc, reciboText, marginLeft, contentWidth, y, lineHeight, reciboBoldSegments);
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
    if (forma.tipo === 'financiamento') {
      checkPageBreak(30);
      setBold();
      doc.text('Financiamento', marginLeft, y); y += lineHeight;
      setNormal();
      doc.text(`Banco: ${forma.financeira || '-'}`, marginLeft + 5, y); y += lineHeight;
      doc.text(`Valor de Entrada: ${forma.valorEntrada || '-'}`, marginLeft + 5, y); y += lineHeight;
      doc.text(`Nº Parcelas: ${forma.numeroParcelas || '-'}`, marginLeft + 5, y); y += lineHeight;
      doc.text(`Valor Parcelas: ${forma.valorParcelas || '-'}`, marginLeft + 5, y); y += lineHeight;
      doc.text(`Valor Financiado: ${forma.valorFinanciado || '-'}`, marginLeft + 5, y); y += lineHeight;
    } else {
      checkPageBreak(6);
      setNormal();
      doc.text(`${forma.descricao}: ${forma.valor}`, marginLeft, y); y += lineHeight;
    }
    y += sectionGap; // one line gap between each payment method
  }
  
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
  sectionHeader(isVenda ? 'DAS CLÁUSULAS E CONDIÇÕES' : 'CONDIÇÕES DO CONTRATO');
  setNormal();

  
  if (isVenda) {
    const trocaMarca = data.troca?.marca || data.produtoMarca || '';
    // Intro
    const introVenda = `Pelo presente instrumento particular de compra e venda de motocicleta usada, de um lado, ${template.empresaNome}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${template.cnpj}, com sede em ${template.endereco}, doravante denominada simplesmente VENDEDORA, e, de outro lado, ${data.nomeCliente}, portador(a) do CPF/CNPJ nº ${data.cpfCnpj}, doravante denominado(a) COMPRADOR(A), têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições a seguir estabelecidas.`;
    checkPageBreak(30);
    y = drawJustifiedText(doc, introVenda, marginLeft, contentWidth, y, lineHeight);
    y += sectionGap;

    const clausulas: { titulo: string; paragrafos: string[] }[] = [
      {
        titulo: 'DO CONTRATO',
        paragrafos: [
          'I. Natureza Jurídica: O presente instrumento é regido pelas disposições do Código Civil Brasileiro (Lei nº 10.406/2002), especialmente pelos artigos 481 e seguintes, que tratam do contrato de compra e venda.',
          'II. Disposição Legal: Fica ajustado que o presente contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores a qualquer título.',
        ],
      },
      {
        titulo: 'CLÁUSULA PRIMEIRA – DO OBJETO',
        paragrafos: [
          `O presente contrato tem por objeto a compra e venda da motocicleta usada de marca ${data.produtoMarca}, modelo ${data.produtoModelo}, ano/modelo ${data.produtoAnoFabMod}, placa/chassi ${data.produtoPlacaChassi}, de propriedade da VENDEDORA, livre e desembaraçada de quaisquer ônus, dívidas ou pendências, salvo aquelas expressamente ressalvadas neste instrumento.`,
          '§1º. O COMPRADOR declara que vistoriou o veículo, tomando ciência de seu estado geral de conservação, e o aceita nas condições em que se encontra.',
          '§2º. A VENDEDORA se responsabiliza pela regularidade documental do veículo até a data da assinatura deste contrato.',
        ],
      },
      {
        titulo: 'CLÁUSULA SEGUNDA – DO PAGAMENTO E SUA FORMA',
        paragrafos: [
          `O COMPRADOR pagará à VENDEDORA, pelo objeto descrito na Cláusula Primeira, o valor de ${data.valorVenda}, na forma e condições descritas nas condições da venda acima estabelecidas.`,
          '§1º. O pagamento poderá ser realizado por meio de recursos próprios, financiamento bancário, consórcio, dação em pagamento (troca) ou quaisquer outras modalidades previamente ajustadas entre as partes.',
          '§2º. Em caso de financiamento, o COMPRADOR se obriga a apresentar toda a documentação necessária à instituição financeira e a arcar com as taxas, juros e encargos decorrentes da operação.',
          '§3º. O eventual ANUENTE, quando indicado, assume solidariamente as obrigações aqui pactuadas, inclusive quanto ao pagamento e à regularidade do bem.',
          '§4º. A quitação integral do preço é condição essencial para a transferência definitiva da propriedade da motocicleta.',
        ],
      },
      {
        titulo: 'CLÁUSULA TERCEIRA – PACTO DE RESERVA DE DOMÍNIO',
        paragrafos: [
          'A propriedade da motocicleta objeto deste contrato somente se transferirá ao COMPRADOR após a quitação integral do preço ajustado, permanecendo o bem sob domínio da VENDEDORA até tal evento, nos termos dos artigos 521 a 528 do Código Civil.',
          'Parágrafo único. Enquanto perdurar a reserva de domínio, a posse direta será transferida ao COMPRADOR, que responderá integralmente por eventuais danos, avarias, multas, tributos e demais encargos incidentes sobre o veículo.',
        ],
      },
      {
        titulo: 'CLÁUSULA QUARTA – DAS OBRIGAÇÕES DO COMPRADOR',
        paragrafos: [
          'São obrigações do COMPRADOR:',
          'a) Efetuar o pagamento nos exatos termos e prazos ajustados;',
          'b) Providenciar a transferência de propriedade junto ao órgão de trânsito competente no prazo legal;',
          'c) Arcar com todos os tributos, taxas, seguros, multas e demais encargos incidentes sobre o veículo a partir da data de retirada;',
          'd) Zelar pela conservação e adequada utilização do bem.',
        ],
      },
      {
        titulo: 'CLÁUSULA QUINTA – DO LOCAL DE RETIRADA DA MOTOCICLETA',
        paragrafos: [
          `A retirada da motocicleta ocorrerá na sede da VENDEDORA, localizada em ${template.endereco}, após a confirmação da quitação integral do preço ou, no caso de financiamento, após a liberação dos recursos pela instituição financeira.`,
          'Parágrafo único. O prazo para a entrega do veículo é de até 7 (sete) dias úteis contados da data do pagamento integral.',
        ],
      },
      {
        titulo: 'CLÁUSULA SEXTA – DA GARANTIA',
        paragrafos: [
          'A VENDEDORA não oferece garantia sobre o funcionamento mecânico, elétrico ou estrutural do veículo, tendo em vista tratar-se de bem usado, salvo disposição em contrário expressamente pactuada por escrito.',
          'Parágrafo único. O COMPRADOR declara ter conhecimento das condições atuais da motocicleta e assume os riscos inerentes à sua utilização.',
        ],
      },
      {
        titulo: 'CLÁUSULA SÉTIMA – DA RESCISÃO CONTRATUAL',
        paragrafos: [
          'O descumprimento de qualquer das cláusulas deste contrato ensejará sua rescisão de pleno direito, sujeitando a parte inadimplente ao pagamento de multa correspondente a 20% (vinte por cento) do valor total do contrato, sem prejuízo das perdas e danos apurados.',
        ],
      },
      {
        titulo: 'CLÁUSULA OITAVA – DAS DISPOSIÇÕES FINAIS',
        paragrafos: [
          'As partes elegem o foro da comarca da sede da VENDEDORA para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
          'E, por estarem assim justas e contratadas, firmam o presente instrumento em via digital, com validade legal, na forma da MP nº 2.200-2/2001.',
        ],
      },
    ];

    for (const cl of clausulas) {
      checkPageBreak(14);
      setBold();
      doc.text(cl.titulo, marginLeft, y);
      y += lineHeight;
      setNormal();
      for (const p of cl.paragrafos) {
        checkPageBreak(12);
        y = drawJustifiedText(doc, p, marginLeft, contentWidth, y, lineHeight);
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
      checkPageBreak(20);
      y = drawJustifiedText(doc, txt, marginLeft, contentWidth, y, lineHeight);
      y += sectionGap;
    }
    y += sectionGap;
  }
  
  // Signature lines - spacing for digital signature
  y += lineHeight * 5; // space before company signature for digital signature
  checkPageBreak(70);
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
  
  // Data do sinal
  checkPageBreak(25);
  setNormal();
  doc.text('Data do Sinal: ', marginLeft, y);
  const dsLabelW = doc.getTextWidth('Data do Sinal: ');
  setBold();
  doc.text(data.dataSinal, marginLeft + dsLabelW, y);
  setNormal();
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
  const fileName = `${isVenda ? 'CONTRATO_VENDA' : 'SINAL'}_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoPdfData };
