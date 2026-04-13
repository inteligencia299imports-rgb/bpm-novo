import jsPDF from 'jspdf';

interface ContratoCompraPdfData {
  nomeCliente: string;
  telefone: string;
  cpfCnpj: string;
  marca: string;
  modelo: string;
  anoFabMod: string;
  placa: string;
  km: string;
  valorQuitacao: string;
  valorFechamento: string;
  observacoes: string;
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

function drawJustifiedText(doc: jsPDF, text: string, x: number, maxWidth: number, y: number, lineHeight: number): number {
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth);

  for (let i = 0; i < lines.length; i++) {
    const line: string = lines[i];
    const isLastLine = i === lines.length - 1;

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
    y += lineHeight;
  }
  return y;
}

export async function generateContratoCompraPdf(data: ContratoCompraPdfData): Promise<void> {
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
  doc.setFontSize(14);
  doc.text('CONTRATO DE COMPRA', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // VENDEDOR
  sectionHeader('VENDEDOR');
  setNormal();
  doc.text(`Nome: ${data.nomeCliente}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefone}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight + sectionGap;

  // OBJETO
  sectionHeader('OBJETO');
  setNormal();
  doc.text(`Marca: ${data.marca}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modelo}`, marginLeft, y); y += lineHeight;
  doc.text(`Fab/Mod: ${data.anoFabMod}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placa}`, marginLeft, y); y += lineHeight;
  doc.text(`Km: ${data.km}`, marginLeft, y); y += lineHeight;
  doc.text(`Valor de Quitação: ${data.valorQuitacao}`, marginLeft, y); y += lineHeight;
  doc.text(`Valor de Fechamento: ${data.valorFechamento}`, marginLeft, y); y += lineHeight + sectionGap;

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

  // COMPRADOR
  sectionHeader('COMPRADOR');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, `${empresaNome}, pessoa jurídica de direito privado, inscrita no CNPJ: ${cnpj}, com sede em Brasília–DF, na Setor SCIA Quadra 15 Conjunto 3 loja, n.º 06 bairro Zona Industrial(Guará).`, marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  setNormal();
  doc.text('Vendedor:', marginLeft, y); y += lineHeight;
  y = drawJustifiedText(doc, 'Citado neste documento no campo "Vendedor", e assina o campo "Assinatura do cliente" ao final deste documento.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA PRIMEIRA
  sectionHeader('CLÁUSULA PRIMEIRA – DO OBJETO');
  setNormal();
  checkPageBreak(10);
  y = drawJustifiedText(doc, 'Descrito no campo item da proposta comercial o objeto deste contrato.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA SEGUNDA
  sectionHeader('CLÁUSULA SEGUNDA - DO PREÇO E FORMA DE PAGAMENTO');
  setNormal();
  checkPageBreak(10);
  y = drawJustifiedText(doc, 'Descrito no campo condições comerciais, assim como qualquer detalhe complementado no campo observação citada.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA TERCEIRA
  sectionHeader('CLÁUSULA TERCEIRA - DA VISTORIA E AVALIAÇÃO DO VEÍCULO');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, 'O COMPRADOR declara ter vistoriado e avaliado o estado em que se encontra o veículo ora negociado, estando o mesmo em perfeitas condições de funcionamento e estado de conservação.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA QUARTA
  sectionHeader('CLÁUSULA QUARTA - DA RESPONSABILIDADE CIVIL E CRIMINAL');
  setNormal();
  checkPageBreak(40);
  y = drawJustifiedText(doc, 'A partir desta data, o COMPRADOR se responsabiliza por quaisquer danos, seja no âmbito civil ou penal, decorrente da utilização do veículo ora adquirido, inclusive multas e pontuações na CNH decorrentes de tais infrações, sejam elas de âmbito Municipal, Estadual e/ou Federal, independente se a notificação chegar após a venda da referida até 01 um ano, bem como fica responsável também, nos mesmos termos acima, até a presente data e hora, por eventual veículo dado na compra do objeto do presente, respondendo ainda o comprador, pela evicção e eventuais vícios redibitórios do mesmo. O VENDEDOR, acaso tenha recebido algum veículo do COMPRADOR, como forma de pagamento do bem objeto do presente, fica responsável, por quaisquer danos, seja no âmbito civil ou penal, decorrente da utilização do veículo ora recebido, inclusive multas e pontuações na CNH decorrentes de tais infrações, sejam elas de âmbito Municipal, estadual e/ou Federal; Deste modo, o presente instrumento é firmado nos termos do artigo 585, II do CPC, razão pela qual é um título executivo extrajudicial, mesmo porque, o "quantum debeatur" depende de simples cálculo aritmético, a partir de dados consignados em documentos comprobatórios do débito (multas de trânsito, IPVA, licenciamento e outros). Parágrafo único - É de responsabilidade do COMPRADOR o pagamento integral dos Impostos sobre a Propriedade de Veículos Automotores (IPVA) do bem referido na cláusula primeira, vincendos.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA QUINTA
  doc.addPage();
  y = marginTop;
  sectionHeader('CLÁUSULA QUINTA – DA GARANTIA');
  setNormal();
  y = drawJustifiedText(doc, 'Para os veículos usados a VENDEDORA fornece a garantia pelo tempo exigido por lei, e somente para os componentes motor e caixa de câmbio, contudo, a mesma estará automaticamente cancelada, no caso de mau uso do veículo em questão, em caso deste último ter suas características originais (as quais são especificadas pelo fabricante do manual do veículo), alteradas, bem como, quando o mesmo for utilizado fora dos padrões e/ou limites de carga e/ou de rotação especificados pelos fabricantes ou ainda, se for utilizado em competições de qualquer espécie ou natureza, além do que, se tiver sua manutenção negligenciada. Todo e qualquer serviço e/ou conserto coberto por esta garantia deverá ser executado por assistência técnica, ou oficina mecânica indicada por esta VENDEDORA e somente após orçamento aprovado pela VENDEDORA; para os veículos novos, isto é, 0KM, a garantia é a de fábrica; ficam de fora da presente garantia, os componentes eletro-eletrônicos e do sistema de arrefecimento do veículo, como, por exemplo:', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  checkPageBreak(30);
  y = drawJustifiedText(doc, 'Sensores, módulos em geral, centrais, mangueiras, bomba d\'água, fiações, etc. Do mesmo modo, também não são cobertos eventuais vazamentos de óleo advindos de falhas ou danos em juntas, vedações ou retentores, bem como quebras de correntes por falta de lubrificantes ou por uso indevido do veículo, bem como eventuais danos gerados pelo superaquecimento do motor, seja por falha da bomba d\'água, falta de refrigeração ou ainda em decorrência da alteração do tipo de combustível utilizado pelo veículo, além do que, utilização de combustível adulterado. Estão fora da presente garantia, itens de desgaste natural e vida útil pré-determinados, tais como: discos e platô de embreagem, discos, tambores, pastilhas e lonas de freio, cabos de vela, correias em geral, bateria, amortecedores e molas, entre outros, incluindo-se ainda os itens considerados de manutenção normal, como limpeza de bicos injetores, fluídos e óleos em geral. A garantia das peças eventualmente substituídas na vigência deste, finda-se com o término do mesmo. Todo e qualquer custo não relacionado diretamente com a garantia do veículo, tais como despesas com táxi, guincho, alimentação, hospedagem, etc., não é de responsabilidade da VENDEDORA;', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA SEXTA
  sectionHeader('CLÁUSULA SEXTA - DA TRANSFERÊNCIA DO BEM');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, 'A transferência do bem objeto do presente instrumento para o nome do comprador ou de alguém por ele determinado, só se dará após a total quitação do bem descrito na cláusula primeira deste, sendo que na hipótese de pagamento em cheque(s) ou qualquer outro título de crédito, após a compensação ou quitação do(s) mesmo(s);', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA SÉTIMA
  sectionHeader('CLÁUSULA SÉTIMA DA CLÁUSULA RESOLUTIVA');
  setNormal();
  checkPageBreak(40);
  y = drawJustifiedText(doc, 'As partes VENDEDOR(A) e COMPRADOR(A), estabelecem desde já, que no caso de não cumprimento do presente, quanto aos pagamentos devidos pelo COMPRADOR ao VENDEDOR, na forma e prazos estabelecidos no bojo deste instrumento particular de contrato, os quais foram avençados de comum acordo entre partes, permitirá ao VENDEDOR, como melhor lhe aprouver, pedir a resolução do contrato ou, se preferir, exigir o cumprimento do mesmo, independentemente de notificação ou interpelação, nos termos do que reza o artigo 475 do Código Civil. Fica desde já avençado entre estas partes, que na hipótese de resolução do contrato, em se tratando de veículo usado, o COMPRADOR deverá pagar ao VENDEDOR, até a devolução do bem objeto deste instrumento, o valor diário pelo uso do veículo, na base de 0,5% (meio por cento) sobre o valor do mesmo, em se tratando de veículo novo (0 km), o COMPRADOR deverá pagar ao VENDEDOR, até a devolução do bem objeto deste instrumento, o valor diário pelo uso do veículo, na base de 0,5% (meio por cento) sobre o valor do bem, mais o valor decorrente da depreciação sofrida pelo veículo em razão de não ser mais o mesmo um bem 0Km, servindo-se para tal verificação (depreciação), a tabela FIPE atualizada;', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA OITAVA
  sectionHeader('CLÁUSULA OITAVA');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, 'Nos termos do que estabelece o artigo 629 do Código Civil, o COMPRADOR assume, de forma gratuita, a condição de depositário do bem objeto do presente, obrigando-se pela guarda e conservação do mesmo, até o integral pagamento do preço.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA NONA
  sectionHeader('CLÁUSULA NONA - DO DIREITO DE IMAGEM');
  setNormal();
  checkPageBreak(10);
  y = drawJustifiedText(doc, 'O VENDEDOR autoriza o COMPRADOR a utilizar sua imagem para fins publicitários nos canais de divulgação próprio e outros que achar pertinente. Esta autorização se dará por prazo INDETERMINADO.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA DÉCIMA
  sectionHeader('CLÁUSULA DÉCIMA');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, 'O comprador está totalmente ciente que está adquirindo uma motocicleta semi nova e está de acordo em adquirir a motocicleta com quaisquer detalhes, arranhados e demais avarias estéticas que a moto tenha, mediante avaliação prévia antes da negociação e assinatura deste.', marginLeft, contentWidth, y, lineHeight);
  y += sectionGap;

  // CLÁUSULA DÉCIMA PRIMEIRA
  sectionHeader('CLÁUSULA DÉCIMA PRIMEIRA - FORO DE ELEIÇÃO');
  setNormal();
  checkPageBreak(15);
  y = drawJustifiedText(doc, 'Para dirimir quaisquer dúvidas decorrentes do presente, as partes estabelecem desde já, com exclusividade, o foro da Comarca do COMPRADOR, por mais privilegiado que outro possa ser. O VENDEDOR, de livre e espontânea vontade, RENUNCIA ao foro previsto no artigo 101, I do Código de Defesa do Consumidor; E, para produzir seus legais efeitos, firmo o presente termo, na presença de 2 (duas) testemunhas.', marginLeft, contentWidth, y, lineHeight);
  y += lineHeight * 1;

  // Signatures - keep entire block together on same page
  const sigBlockHeight = lineHeight * 8;
  checkPageBreak(sigBlockHeight);

  const colWidth = contentWidth / 2 - 5;
  const lineLen = 70;

  doc.setLineWidth(0.3);

  // Client (left) and Company (right) side by side
  const sigY = y;
  doc.line(marginLeft, sigY, marginLeft + lineLen, sigY);
  const rightX = marginLeft + colWidth + 10;
  doc.line(rightX, sigY, rightX + lineLen, sigY);

  setNormal();
  doc.text(data.nomeCliente, marginLeft, sigY + lineHeight);
  doc.text(data.cpfCnpj, marginLeft, sigY + lineHeight * 2);

  doc.text(empresaNome, rightX, sigY + lineHeight);
  doc.text(`CNPJ: ${cnpj}`, rightX, sigY + lineHeight * 2);

  y = sigY + lineHeight * 4;

  // Digital agreement + date
  setNormal();
  y = drawJustifiedText(doc, 'Ao confirmar e assinar este documento por via eletrônica, estamos em acordo de que este será apresentado somente neste formato digital, e que os registros serão mantidos originalmente protegidos e inalteráveis em https://acrobat.adobe.com/link/documents/agreements, após coletadas todas as evidências de assinaturas de todos os envolvidos, o documento poderá ser baixado em formato PDF juntamente com o comprovante de assinatura eletrônica e todas as validações, histórico de assinaturas e o respectivo ID da transação, e uma cópia será mantida inalterada nos respectivos e-mails envolvidos, conforme determina a MP 2.200/01, art. 10º, §2º.', marginLeft, contentWidth, y, lineHeight);
  y += lineHeight * 3;

  setBold();
  doc.text(`Brasília, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });
  setNormal();

  // Save
  const fileName = `COMPRA_${data.nomeCliente.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}
