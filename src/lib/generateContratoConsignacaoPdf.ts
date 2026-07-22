import jsPDF from 'jspdf';

interface ContratoConsignacaoPdfData {
  nomeCliente: string;
  telefone: string;
  cpfCnpj: string;
  email: string;
  endereco: string;
  cep: string;
  marca: string;
  modelo: string;
  anoFabMod: string;
  placa: string;
  km: string;
  valorQuitacao: string;
  valorNegociado: string;
  observacoes: string;
  valorFechamento: string;
  dataContrato: string;
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
      // Bold segments handling - find bold segment within the line text
      let currentX = x;
      const fullLineText = line;
      
      // Check if any bold segment appears in this line
      let hasBoldInLine = false;
      for (const seg of boldSegments) {
        if (fullLineText.includes(seg)) {
          hasBoldInLine = true;
          break;
        }
      }
      
      if (!hasBoldInLine) {
        // No bold in this line, render with justification
        if (isLastLine || !fullLineText.trim()) {
          doc.text(fullLineText, x, y);
        } else {
          const words = fullLineText.split(/\s+/);
          if (words.length <= 1) {
            doc.text(fullLineText, x, y);
          } else {
            const wordsWidth = words.reduce((sum: number, w: string) => sum + doc.getTextWidth(w), 0);
            const totalSpaceWidth = maxWidth - wordsWidth;
            const spaceWidth = totalSpaceWidth / (words.length - 1);
            currentX = x;
            for (let j = 0; j < words.length; j++) {
              doc.text(words[j], currentX, y);
              currentX += doc.getTextWidth(words[j]) + spaceWidth;
            }
          }
        }
      } else {
        // Render with bold segments inline
        const segments: { text: string; bold: boolean }[] = [];
        let remaining = fullLineText;
        
        for (const seg of boldSegments) {
          const idx = remaining.indexOf(seg);
          if (idx >= 0) {
            if (idx > 0) segments.push({ text: remaining.substring(0, idx), bold: false });
            segments.push({ text: seg, bold: true });
            remaining = remaining.substring(idx + seg.length);
          }
        }
        if (remaining) segments.push({ text: remaining, bold: false });
        
        currentX = x;
        for (const seg of segments) {
          const leadingSpaces = (seg.text.match(/^\s+/)?.[0]) || '';
          const trailingSpaces = (seg.text.match(/\s+$/)?.[0]) || '';
          const cleanText = seg.text.trim();

          if (leadingSpaces) {
            currentX += doc.getTextWidth(leadingSpaces);
          }

          if (cleanText) {
            doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
            doc.text(cleanText, currentX, y);
            currentX += doc.getTextWidth(cleanText);
          }

          if (trailingSpaces) {
            currentX += doc.getTextWidth(trailingSpaces);
          }
        }
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

  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - marginBottom) {
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
    ? 'CONTRATO DE CONSIGNAÇÃO E TERMO DE RESPONSABILIDADE'
    : 'CONTRATO DE CONSIGNAÇÃO COM VALOR ESTIPULADO E TERMO DE RESPONSABILIDADE';
  // For the long title, use smaller font if needed
  const titleFontSize = data.comPercentual5 ? 14 : 12;
  doc.setFontSize(titleFontSize);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  for (const tl of titleLines) {
    doc.text(tl, pageWidth / 2, y, { align: 'center' });
    y += titleFontSize * 0.4;
  }
  y += 4;

  // CONSIGNANTE/PROPRIETÁRIO
  sectionHeader('CONSIGNANTE/PROPRIETÁRIO');
  setNormal();
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight;
  doc.text(`E-mail: ${data.email}`, marginLeft, y); y += lineHeight;
  doc.text(`Endereço: ${data.endereco}`, marginLeft, y); y += lineHeight;
  doc.text(`CEP: ${data.cep}`, marginLeft, y); y += lineHeight + sectionGap;

  // CONSIGNATÁRIA
  sectionHeader('CONSIGNATÁRIA');
  setNormal();
  const consignatariaText = `${empresaNome} - 299 Imports, pessoa jurídica de direito privado, inscrita no CNPJ Nº ${cnpj}, com sede em Brasília–DF, na rua Setor SCIA Quadra 15 Conjunto 3 loja n.º 06, bairro Zona Industrial (Guará), CEP 71250-015, doravante denominada CONSIGNATÁRIA. As partes acima qualificadas têm, entre si, justo e acertado, o presente Contrato de Consignação, através do qual o CONSIGNANTE autoriza a CONSIGNATÁRIA, a promover a venda do veículo objeto da presente, o qual o consignante declara ser proprietário, pelo valor, prazo e demais condições a seguir expostos.`;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, consignatariaText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;

  // OBJETO
  sectionHeader('OBJETO:');
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
    sectionHeader('OBSERVAÇÕES:');
    setNormal();
    const obsLines = doc.splitTextToSize(data.observacoes, contentWidth);
    checkPageBreak(obsLines.length * lineHeight + 5);
    doc.text(obsLines, marginLeft, y);
    y += obsLines.length * lineHeight;
    y += sectionGap;
  }

  // VALOR
  sectionHeader('VALOR:');
  setNormal();
  checkPageBreak(15);
  {
    const prefix = data.comPercentual5
      ? 'A CONSIGNATÁRIA fica autorizada, através do presente, a vender o bem objeto do presente, pelo valor de '
      : 'A CONSIGNATÁRIA fica acordado a repassar em mãos o valor de ';
    const suffix = ';';
    const valor = data.valorFechamento;

    // Render prefix in normal, valor in bold, suffix in normal
    let cx = marginLeft;
    setNormal();
    doc.text(prefix, cx, y);
    cx += doc.getTextWidth(prefix);

    // Check if valor fits on same line
    setBold();
    const valorWidth = doc.getTextWidth(valor);
    if (cx + valorWidth > marginLeft + contentWidth) {
      // Wrap to next line
      y += lineHeight;
      cx = marginLeft;
    }
    doc.text(valor, cx, y);
    cx += valorWidth;

    setNormal();
    doc.text(suffix, cx, y);
    y += lineHeight;
  }
  y += sectionGap;

  // DO PAGAMENTO
  sectionHeader('DO PAGAMENTO:');
  setNormal();
  checkPageBreak(30);
  if (data.comPercentual5) {
    const pagText = 'O repasse do valor acordado será efetuado após a entrega integral da documentação exigida pela empresa, conforme especificado no campo "Observações". Ressalta-se que o DUT (Documento Único de Transferência) ou ATPV-e (Autorização para Transferência de Propriedade de Veículo Eletrônica) deverá estar devidamente preenchido e com firma reconhecida. Concluída essa etapa documental, proceder-se-á ao pagamento da motocicleta consignada.';
    y = drawJustifiedText(doc, pagText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  } else {
    const pagText = 'O repasse do valor acordado será efetuado após a entrega integral da documentação e dos itens exigidos pela empresa, conforme previamente estabelecido e especificado no campo "Observações". Ressalta-se que o DUT (Documento Único de Transferência) ou a ATPV-e (Autorização para Transferência de Propriedade de Veículo Eletrônica) deverá estar devidamente preenchido e com firma reconhecida. Concluída essa etapa documental, proceder-se-á ao pagamento da motocicleta consignada no prazo de até 7 (sete) dias úteis.';
    y = drawJustifiedText(doc, pagText, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  }
  y += sectionGap;

  // §1 and §2 of DO PAGAMENTO
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1º A transferência do valor será realizada, preferencialmente, por meio de depósito ou transferência bancária para a conta indicada pelo(a) CONSIGNANTE, após a entrega de toda a documentação solicitada.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2º Após a concretização da venda, a CONSIGNATÁRIA se compromete a prestar o suporte necessário ao comprador para a efetivação da transferência do veículo, auxiliando-o no cumprimento dos trâmites administrativos e burocráticos junto aos órgãos competentes.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DA COMISSÃO
  sectionHeader('DA COMISSÃO:');
  setNormal();
  checkPageBreak(25);
  if (data.comPercentual5) {
    y = drawJustifiedText(doc, 'Fica desde já convencionado entre as partes que, na hipótese de o veículo objeto do presente contrato vir a ser alienado, seja pelo valor indicado no campo "VALOR" ou por quantia inferior, desde que haja anuência expressa do(a) CONSIGNANTE —, será devida à CONSIGNATÁRIA comissão correspondente a 5% (cinco por cento) do valor efetivo da transação. Tal comissão será automaticamente retida pela CONSIGNATÁRIA no ato do pagamento efetuado pelo comprador, por ocasião da quitação final.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§1º Caso o(a) CONSIGNANTE deseje fixar o valor líquido que pretende auferir com a venda, deverá informar tal quantia de maneira clara e expressa no momento da consignação, a fim de que conste no campo "Observações" do presente contrato.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§2º Os valores previstos nesta cláusula, inclusive a comissão ora estipulada, permanecerão devidos à CONSIGNATÁRIA mesmo que a venda do veículo se concretize após a devolução do bem ao(à) CONSIGNANTE, desde que o(a) comprador(a) tenha sido por ela apresentado(a) ao(à) CONSIGNANTE, de forma direta ou indireta, durante a vigência deste instrumento.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§3º O(a) CONSIGNANTE declara ter pleno conhecimento de que, enquanto vigente o presente contrato, não poderá dispor do veículo para venda direta a terceiros. Qualquer divulgação do bem por iniciativa própria, inclusive por meio de plataformas de venda online ou quaisquer outros meios, será considerada infração contratual, caracterizando violação às obrigações aqui assumidas.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  } else {
    y = drawJustifiedText(doc, 'Fica desde já estabelecido, que independentemente do valor de venda, será repassado ao consignante o valor estipulado no campo "VALOR", ao proprietário do veículo.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§1º Caso o CONSIGNANTE estabeleça o valor líquido pretendido com a venda, este deverá informar de forma clara no momento da consignação para ser especificado no campo "Observações".', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§2° Os valores referidos nesta cláusula, persistirão em favor da CONSIGNATÁRIA, acaso o veículo objeto desta seja negociado após sua devolução ao CONSIGNANTE, diretamente por este ou por outrem e o comprador seja, justamente, pessoa que tenha sido apresentada, na vigência deste, ao CONSIGNANTE, pela CONSIGNATÁRIA;', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
    y += sectionGap;
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, '§3° O CONSIGNANTE fica ciente que durante a vigência deste contrato, não poderá dispor do objeto para venda direta e o ato contrário, como a publicação em canais de venda, se caracteriza como quebra deste contrato.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  }
  y += sectionGap;

  // DA AVALIAÇÃO E VERIFICAÇÃO
  sectionHeader('DA AVALIAÇÃO E VERIFICAÇÃO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1° O Consignante, ao deixar a motocicleta para consignação, declara-se ciente e concorda que a mesma somente será exposta à venda após a realização de uma avaliação e verificação mecânica, conhecida como check-in list, bem como a pesquisa junto aos órgãos competentes para identificação de eventuais pendências financeiras, como multas, IPVA atrasados, bloqueios, dentre outros que possam interferir na futura venda e/ou transferência do veículo.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2° A Consignatária informará ao Consignante o resultado da avaliação imediatamente após sua conclusão e disponibilizará a motocicleta para a venda após conclusão dos trâmites necessários.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;

  // DA IRRETRATABILIDADE
  sectionHeader('DA IRRETRATABILIDADE APÓS SINAL DE NEGÓCIO E RESPONSABILIDADE POR IMPEDIMENTO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Caso haja manifestação de interesse de comprador com pagamento de sinal, o CONSIGNANTE não poderá retirar o veículo até:', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += 2;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'a, undefined, undefined, undefined, undefined, undefined, lineCheckPageBreak) conclusão da venda; ou b) desistência formal do comprador.', marginLeft, contentWidth, y, lineHeight);
  y += 2;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O sinal caracteriza início de vínculo contratual.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Caso o CONSIGNANTE inviabilize a venda, pagará multa de 20% sobre o valor do veículo, além de perdas e danos.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Durante a vigência: I – não poderá gerar ônus ou restrições; II – deverá manter regularidade do veículo; III – não poderá negociar fora da consignação.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O descumprimento autoriza rescisão imediata.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Parágrafo único: Caso haja impedimento no CPF do CONSIGNANTE que inviabilize a transferência, este será responsável por toda regularização, custos, despesas e prejuízos, nada podendo ser imputado à CONSIGNATÁRIA.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DO DIREITO DE IMAGEM
  sectionHeader('DO DIREITO DE IMAGEM:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Todas as imagens produzidas na transação de consignação são de direito exclusivo da CONSIGNATÁRIA.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  y = drawJustifiedText(doc, '§1° As imagens produzidas pela CONSIGNATÁRIA serão de uso e direito para esta comercialização, vetado o repasse ou uso sem permissão, sob pena de impor despesas evasivas.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2° O CONSIGNANTE fica ciente que durante a vigência deste contrato não poderá dispor do objeto para anúncios particulares e venda direta. Sob pena de eventuais cobranças judiciais.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§3° O CONSIGNANTE DEVE RETIRAR IMEDIATAMENTE QUALQUER ANÚNCIO REFERENTE A MOTO, OBJETO DESTE CONTRATO, DE CANAIS DE VENDAS DIVERSOS, E NÃO PODERÁ FAZER NOVOS ANÚNCIOS ENQUANTO A MOTO ESTIVER CONSIGNADA NA LOJA.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DAS RESPONSABILIDADES
  sectionHeader('DAS RESPONSABILIDADES:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O CONSIGNANTE se responsabiliza pela evicção, por eventuais vícios redibitórios, bem como todas as multas, sejam elas Federais, Estaduais e/ou Municipais, até a presente data. Diante disso, esta CONSIGNATÁRIA fica desde já autorizada, após tentativa amigável de cobrança, mediante notificação extrajudicial, a qual deverá ser respaldada nos documentos de origem dos débitos, a proceder à execução do valor atualizado do débito, devidamente acrescido da multa eventualmente impingida pelos órgãos públicos, mais juros de mora de 1% ao mês, a contar da data em que a CONSIGNATÁRIA, ou alguém por ela despenda tais valores. Deste modo, o (a) CONSIGNANTE declara que reconhece que o presente instrumento é firmado no termo do artigo 585, II do CPC, razão pela qual o presente é um título executivo extrajudicial, mesmo porque, o "quantum debeatur" depende de simples cálculo aritmético, a partir de dados consignados em documentos comprobatórios do débito (multas de trânsito, IPVA e outros). Nesta seara, a CONSIGNATÁRIA poderá executar o presente para cobrar os valores eventualmente devidos e de responsabilidade do (a) CONSIGNANTE. Para dirimir quaisquer dúvidas decorrentes do presente, as partes estabelecem desde já o foro da comarca de Brasília, por mais privilegiado que outro possa ser, sendo que o CONSIGNANTE RENUNCIA ao foro previsto no inciso I, do artigo 101, do Código de Defesa do Consumidor. O veículo objeto do presente ficará sob guarda e responsabilidade da CONSIGNATÁRIA, até o dia da venda ou sua devolução ao CONSIGNANTE;', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1° O CONSIGNANTE declara que o veículo acima descrito encontra-se desobstruído para transferência em todo TERRITÓRIO NACIONAL. Sendo de sua responsabilidade multas e débitos até a presente data.', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2° O CONSIGNANTE que optou pela ISENÇÃO DE IPVA, no momento da compra do veículo acima descrito, deverá arcar com os débitos em aberto junto à Secretaria de Fazenda do estado de origem. Visando a transferência de propriedade após a conclusão da venda.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§3° Fica desde já estabelecido que, o início da contagem do prazo de responsabilidade, do consignante por eventuais defeitos e vícios ocultos se dará após a concretização da venda, com a assinatura e reconhecimento do CRV (DUT).', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§4° Caso o CONSIGNANTE precise se ausentar do Distrito Federal, deverá deixar uma procuração para alguém de sua confiança, autorizando essa pessoa a agir em seu nome.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // SÃO OBRIGAÇÕES DO CONSIGNANTE
  sectionHeader('SÃO OBRIGAÇÕES DO CONSIGNANTE:');
  setNormal();

  const obrigacoes = [
    '§1° O CONSIGNANTE fica obrigado a realizar o pagamento da TAXA referente a: CHECKLIST DE ENTRADA, LIMPEZA, MANUTENÇÃO EM ESTOQUE E ANÚNCIOS no valor de R$ 100,00 após a assinatura do contrato.',
    '§2° Entregar os bens livres e desembaraçados de quaisquer ônus, na data estipulada neste contrato, conforme parte das responsabilidades;',
    '§3° Prestar toda a assistência à CONSIGNATÁRIA, em caso de venda, na transferência dos veículos;',
    '§4° Responsabilizar-se por qualquer vício oculto do bem anterior à sua entrega à CONSIGNATÁRIA, conforme parte das responsabilidades;',
    '§5° O CONSIGNANTE será sempre responsável pelo pagamento das penalidades de multas, emitidas pelos órgãos de departamentos de trânsito, acerca de infrações ocorridas até entrega da motocicleta, deste, independente se a notificação chegar após a venda da referida até 01 um ano;',
    '§6° O CONSIGNANTE deverá entregar todos os itens da motocicleta, chaves, peças originais, e tudo que lhe for pedido pela CONSIGNATÁRIA para a perfectibilização da venda do objeto, caso o consignante não cumpra será cobrado uma taxa de R$ 1.000,00 (mil reais) de taxa até entregar as peças requeridas.',
    '§7° É obrigação do CONSIGNANTE a integral quitação do tributo referente à propriedade de veículos automotores (IPVA) do veículo em questão, concernente ao exercício fiscal vigente no momento da celebração deste instrumento ou na ocasião da transferência a terceiros, juntamente com a regularização dos períodos antecedentes.',
  ];
  for (const obr of obrigacoes) {
    checkPageBreak(lineHeight);
    y = drawJustifiedText(doc, obr, marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
    y += sectionGap;
  }

  // DOS VÍCIOS OCULTOS
  sectionHeader('DOS VÍCIOS OCULTOS');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'A previsão legal dos Vícios Redibitórios está contida no art. 441 do Código Civil, sendo que esses Vícios são DEFEITOS OCULTOS em coisa recebida em virtude de contrato comutativo, que a tornem imprópria para o uso ou lhe diminuam o valor.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // CONTRATO DE CONSIGNAÇÃO (continuation header)
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1° O CONSIGNANTE é responsável pelo objeto deste contrato e pelos seus defeitos, ainda que os desconheça até o momento.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2° O check list não exime o CONSIGNANTE de sua responsabilidade em relação ao objeto. A 299 Imports realizará um laudo técnico de verificação da motocicleta após a assinatura deste contrato. Este laudo é caracterizado conforme abaixo:', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;

  // Photo checklist
  sectionHeader('FOTOGRAFAR A MOTO CONFORME ITENS ABAIXO.');
  setNormal();
  const fotoItems = ['1. TRASEIRA + PLACA', '2. PNEU TRASEIRO', '3. PNEU DIANTEIRO', '4. PAINEL + GUIDÃO + ODÔMETRO', '5. TANQUE', '6. CHASSI', '7. LATERAL ESQUERDA', '8. LATERAL DIANTEIRA', '9. FRENTE'];
  for (const item of fotoItems) {
    checkPageBreak(5);
    doc.text(item, marginLeft, y); y += lineHeight;
  }
  y += sectionGap;

  // Verification items
  sectionHeader('VERIFICAÇÃO DOS ITENS:');
  setNormal();
  const verItems = ['1. RELAÇÃO', '2. PASTILHAS', '3. BATERIA', '4. LUZES', '5. MOTOR', '6. BARULHOS NÃO CARACTERÍSTICOS DO MODELO', '7. VERIFICAÇÃO DO NÍVEL E ESTADO DOS FLUIDOS.'];
  for (const item of verItems) {
    checkPageBreak(5);
    doc.text(item, marginLeft, y); y += lineHeight;
  }
  y += sectionGap;

  // Scanner text
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O veículo passará por nosso scanner para uma verificação completa (laudo de entrada e também será repetido na saída) - O relatório será anexado ao processo e histórico da moto. O scanner verifica:', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  const scanItems = ['1. HISTÓRICO DE FALHAS DA MOTO', '2. LEITURA DOS PARÂMETROS', '3. AVISOS DE SERVIÇO DE MANUTENÇÃO.'];
  for (const item of scanItems) {
    checkPageBreak(5);
    doc.text(item, marginLeft, y); y += lineHeight;
  }
  y += sectionGap;

  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Posterior ao scanner será feito o teste de rodagem por nosso mecânico para verificações mais amplas em funcionamento. Os resultados deste laudo serão anexados ao processo de consignação e caso solicitado serão enviados ao cliente. Ciente de que, caso o laudo técnico aponte que a motocicleta possui falhas, problemas técnicos ou condições de qualidade que não condizem com os objetivos da empresa, cabe a negociação para:', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(10);
  doc.text('- Autorização para o ajuste em nossa própria oficina.', marginLeft, y); y += lineHeight;
  doc.text('- Retirada da motocicleta para ser realizada a manutenção em local de preferência do consignante proprietário.', marginLeft, y); y += lineHeight;
  y += sectionGap;

  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§3° O CONSIGNANTE será contatado a qualquer momento pela CONSIGNATÁRIA, durante a vigência deste contrato ou no período de garantia legal (após a concretização da venda e tradição do objeto), para ser comunicado sobre defeitos ocultos e tomar as medidas cabíveis, ainda que o perecimento ocorra em poder do adquirente/comprador.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DO PRAZO
  sectionHeader('DO PRAZO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'A presente autorização de venda se dá pelo prazo de 30 dias, prorrogando-se automaticamente no caso de silêncio do CONSIGNANTE;', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1° Caso o CONSIGNANTE retire o objeto deste contrato antes do prazo estipulado acima, este tem a obrigação de custear despesas evasivas da CONSIGNATÁRIA. Sendo pré-fixado o valor de R$ 100,00.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§2° Consignante não pode dispor do objeto deste contrato antes de lhe ser restituída ou e lhe ser comunicada a restituição (CC/2002, art. 537).', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§3° A empresa 299 Imports se compromete a postar e disponibilizar o veículo para a venda no prazo máximo de 7 dias uteis, a partir do momento da assinatura deste. O prazo sugerido se deve aos processos de diagnóstico, tratamento e higienização da motocicleta.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§4° A empresa consignatária poderá rescindir unilateralmente o presente instrumento, sem ônus, mediante aviso por escrito, que deverá ser encaminhado via e-mail ou WhatsApp, indicado no presente termo ou notificação por AR-MP, com antecedência de, no mínimo, 1 (um) dia.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§5º Durante o prazo estipulado para a venda, é permitido ao CONSIGNANTE rescindir unilateralmente o presente instrumento, sem ônus, mediante aviso por escrito, que deverá ser encaminhado por o e-mail, notificação por AR ou via WhatsApp, com antecedência mínima de 5 (cinco) dias, a fim de possibilitar proceder-se os trâmites administrativos necessários, sob pena de imposição de multa de R$ 2.000,00 (dois mil reais).', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DAS INCONFORMIDADES
  sectionHeader('DAS INCONFORMIDADES NO ÂMBITO LEGAL:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O CONSIGNANTE fica ciente que durante a vigência deste contrato, a CONSIGNATÁRIA fará consultas periódicas em órgãos públicos de: seu nome, do veículo objeto deste contrato e da pessoa cujo nome constar no CRLV. Com intuito de resguardar seus clientes e negócios. Havendo qualquer inconformidade, a CONSIGNATÁRIA comunicará o CONSIGNANTE, ficando a escolha da CONSIGNATÁRIA se permanecerá com o contrato de consignação. Fica acordado, ainda, que não haverá restituição de valores pagos na assinatura deste.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DO DESLOCAMENTO
  sectionHeader('DO DESLOCAMENTO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'O CONSIGNANTE dará aprovação ao deslocamento entre lojas (loja 1- SCIA QUADRA 15 CONJUNTO 03 LOJA 06 CIDADE DO AUTOMÓVEL CEP: 71.250-015, loja 2 - Q QMSW 2 BLOCO A LOJA 20 SETOR SUDOESTE CEP:70.680-203 e loja 3 – SAI TRECHO 3 LOTE 1205 ZONA INDUSTRIAL, GUARÁ CEP: 71.200-037) por meio de autorização em anexo, ficará ciente que poderá ocorrer a venda em qualquer unidade 299 Imports e que o transporte se dará por conta da CONSIGNATÁRIA por meio de van totalmente equipada para deslocamento.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // DA COMUNICAÇÃO
  sectionHeader('DA COMUNICAÇÃO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, '§1° Fica ajustado que as comunicações/notificações que tratam o presente contrato poderão ser encaminhadas da seguinte forma:', marginLeft, contentWidth, y, lineHeight, undefined, lineCheckPageBreak);
  y += sectionGap;
  doc.text('1. Por escrito;', marginLeft, y); y += lineHeight;
  doc.text('2. Via e-mails e WhatsApp informados na qualificação das partes.', marginLeft, y); y += lineHeight;
  y += sectionGap;

  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'As partes elegem o Foro da Comarca de BRASÍLIA - DF, renunciando a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer dúvidas ou litígios resultantes do presente instrumento. E, por estarem de pleno acordo, as partes firmam o presente instrumento em duas vias, de igual forma e teor, juntamente com duas testemunhas, para surtirem os seus efeitos jurídicos e legais.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // FORO DE ELEIÇÃO
  sectionHeader('FORO DE ELEIÇÃO:');
  setNormal();
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Para dirimir quaisquer dúvidas decorrentes do presente, as partes estabelecem desde já, com exclusividade, o foro da comarca de Brasília–DF, por mais privilegiado que outro possa ser. O comprador de livre e espontânea vontade renuncia ao foro previsto no artigo 101, I, do Código de Defesa do Consumidor.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  // LGPD + Digital
  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Conforme a Lei Geral de Proteção de Dados (LGPD), Lei n.º 13.709/2018, o cliente consente expressamente com a utilização dos seus dados pessoais, fornecidos neste contrato a fins de contato e comunicação comercial pela empresa.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += sectionGap;

  checkPageBreak(lineHeight);
  y = drawJustifiedText(doc, 'Ao confirmar e revisar este documento por via digital, estamos de acordo que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas dos envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o relativo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += lineHeight * 4;

  // Signatures
  // Client signature
  checkPageBreak(50);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(data.nomeCliente, marginLeft, y); y += lineHeight;
  doc.text(data.cpfCnpj, marginLeft, y);
  y += lineHeight * 4;

  // Testemunha
  checkPageBreak(20);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text('Testemunha 1', marginLeft, y); y += lineHeight;
  doc.text('RG/CPF', marginLeft, y);
  y += lineHeight * 5;

  // Company signature
  checkPageBreak(20);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, marginLeft, y);
  y += lineHeight;

  // DEVOLUÇÃO DO VEÍCULO
  checkPageBreak(40);

  sectionHeader('DEVOLUÇÃO DO VEÍCULO:');
  setNormal();
  y = drawJustifiedText(doc, 'Declaro a quem possa interessar que retirei o veículo objeto desta consignação e o mesmo encontra-se nas mesmas condições de funcionamento e conservação de quando foi consignado, não tendo, portanto, nada a reclamar.', marginLeft, contentWidth, y, lineHeight, lineCheckPageBreak);
  y += lineHeight * 4;

  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(data.nomeCliente, marginLeft, y); y += lineHeight;
  doc.text(data.cpfCnpj, marginLeft, y);
  y += lineHeight * 4;

  // Company signature + date
  checkPageBreak(20);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, marginLeft, y); y += lineHeight * 2;
  setBold();
  doc.text(`Brasília, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });
  setNormal();

  // Save
  const suffix = data.comPercentual5 ? '_5PCT' : '';
  const fileName = `CONSIGNACAO${suffix}_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoConsignacaoPdfData };
