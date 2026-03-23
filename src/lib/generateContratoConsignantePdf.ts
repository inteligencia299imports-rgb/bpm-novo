import jsPDF from 'jspdf';

interface ContratoConsignantePdfData {
  nomeConsignante: string;
  telefoneConsignante: string;
  cpfCnpj: string;
  dadosBancarios: string;
  titularConta: string;
  marcaMoto: string;
  modeloMoto: string;
  placaMoto: string;
  valorFechamento: string;
  totalAbatimentos: string;
  valorRepasse: string;
  custosOperacionais: { tipo: string; responsavel: string; descricao: string; valor: string }[];
  custosOficina: { tipo: string; responsavel: string; detalhes: string; valor: string }[];
  observacoesContrato: string;
  observacoesInternas: string;
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
  const empresaNome = 'MMATOS COMERCIO DE VEÍCULOS E PECAS LTDA';
  const cnpj = '21.194.795/0001-96';
  const logoPath = '/logos/299-logo.jpg';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginTop = 10;
  const marginBottom = 10;
  const marginLeft = 10;
  const contentWidth = pageWidth - marginLeft - 10;
  const fontSize = 9;
  const lineHeight = 4.5;
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
    setBold();
    doc.text(title, marginLeft, y);
    y += lineHeight;
  };

  // Logo
  try {
    const logoData = await loadImage(logoPath);
    const logoWidth = 30;
    const logoHeight = 15;
    doc.addImage(logoData, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 6;
  } catch {
    y += 10;
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TERMO DE PAGAMENTO AO CONSIGNANTE', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // DADOS DO CONSIGNANTE
  sectionHeader('DADOS DO CONSIGNANTE');
  setNormal();
  doc.text(`Nome: ${data.nomeConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`Telefone: ${data.telefoneConsignante}`, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y); y += lineHeight;
  doc.text(`Dados Bancários: ${data.dadosBancarios}`, marginLeft, y); y += lineHeight;
  doc.text(`Titular da Conta: ${data.titularConta}`, marginLeft, y); y += lineHeight + sectionGap;

  // CONSIGNATÁRIA
  sectionHeader('CONSIGNATÁRIA');
  setNormal();
  doc.text(`${empresaNome}`, marginLeft, y); y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, marginLeft, y); y += lineHeight + sectionGap;

  // DADOS DA MOTO
  sectionHeader('DADOS DA MOTO');
  setNormal();
  doc.text(`Marca: ${data.marcaMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Modelo: ${data.modeloMoto}`, marginLeft, y); y += lineHeight;
  doc.text(`Placa: ${data.placaMoto}`, marginLeft, y); y += lineHeight + sectionGap;

  // RESUMO FINANCEIRO
  sectionHeader('RESUMO FINANCEIRO');
  setNormal();

  setBold();
  doc.text(`Valor de Fechamento: ${data.valorFechamento}`, marginLeft, y); y += lineHeight;
  setNormal();

  // Custos de oficina
  if (data.custosOficina.length > 0) {
    y += 2;
    doc.text('Custos de Oficina:', marginLeft, y); y += lineHeight;
    for (const c of data.custosOficina) {
      checkPageBreak(5);
      doc.text(`  • ${c.tipo} (${c.responsavel}) - ${c.detalhes || 'Sem detalhes'}: ${c.valor}`, marginLeft, y);
      y += lineHeight;
    }
  }

  // Custos operacionais
  if (data.custosOperacionais.length > 0) {
    y += 2;
    doc.text('Custos Operacionais:', marginLeft, y); y += lineHeight;
    for (const c of data.custosOperacionais) {
      checkPageBreak(5);
      doc.text(`  • ${c.tipo} (${c.responsavel}) - ${c.descricao || 'Sem descrição'}: ${c.valor}`, marginLeft, y);
      y += lineHeight;
    }
  }

  y += 2;
  setBold();
  doc.text(`Total Abatimentos: ${data.totalAbatimentos}`, marginLeft, y); y += lineHeight;
  doc.setFontSize(11);
  doc.text(`VALOR DE REPASSE: ${data.valorRepasse}`, marginLeft, y); y += lineHeight;
  doc.setFontSize(fontSize);
  setNormal();
  y += sectionGap;

  // OBSERVAÇÕES
  if (data.observacoesContrato) {
    sectionHeader('OBSERVAÇÕES DO CONTRATO');
    setNormal();
    const lines = doc.splitTextToSize(data.observacoesContrato, contentWidth);
    checkPageBreak(lines.length * lineHeight + 5);
    doc.text(lines, marginLeft, y);
    y += lines.length * lineHeight + sectionGap;
  }

  // Data
  checkPageBreak(10);
  setBold();
  doc.text(`Brasília, ${data.dataContrato}`, pageWidth / 2, y, { align: 'center' });
  y += lineHeight * 4;

  // Signatures
  checkPageBreak(40);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  setNormal();
  doc.text(data.nomeConsignante, marginLeft, y); y += lineHeight;
  doc.text(`CPF/CNPJ: ${data.cpfCnpj}`, marginLeft, y);
  y += lineHeight * 4;

  doc.line(marginLeft, y, marginLeft + 70, y);
  y += lineHeight;
  doc.text(empresaNome, marginLeft, y); y += lineHeight;
  doc.text(`CNPJ: ${cnpj}`, marginLeft, y);

  const fileName = `PAGAMENTO_CONSIGNANTE_${data.nomeConsignante.replace(/\s+/g, '_').toUpperCase()}.pdf`;
  doc.save(fileName);
}

export { type ContratoConsignantePdfData };
