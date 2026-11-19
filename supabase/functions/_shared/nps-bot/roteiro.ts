// Roteiro da pesquisa: perguntas, escalas (mesmos textos que os relatórios leem em
// respostas_nps — ver cerebro/src/lib/relatorios/npsDashboard.ts) e mensagens.

export type Produto = 'moto' | 'equipamento' | 'servico' | null;

export interface Item {
  id: string;
  tabela: string;          // atendimentos_motos | avaliacoes | atendimento_equipamentos | atendimento_servicos
  departamento: string;    // SHOWROOM | AVALIAÇÃO | EQUIPAMENTOS | OFICINA
  negociacao: string;      // COMPRAR, TROCAR, PERDIDO, SERVIÇO, ...
  loja: string;
  cidade: string;
  nome_exibicao: string;
  link_google: string | null; // da oficina, quando o item é da oficina
  ducati: boolean;
  produto: Produto;
}

export type Escala = 'atendimento' | 'produto' | 'experiencia';

export interface Passo {
  chave: string;                 // atendimento | outros_setores | produto:<tipo> | experiencia | nps | comentario
  tipo: 'escala' | 'nps' | 'sim_nao';
  escala?: Escala;
  texto: string;
  itens: string[];               // ids dos itens a que a resposta se aplica
}

export const ESCALAS: Record<Escala, string[]> = {
  atendimento: ['Sim, superou as expectativas', 'Sim, atendeu satisfatoriamente', 'Neutro', 'Somente em partes', 'Absolutamente não'],
  produto: ['Muito satisfeito', 'Satisfeito', 'Neutro', 'Insatisfeito', 'Muito insatisfeito'],
  experiencia: ['Muito satisfatória', 'Satisfatória', 'Neutro', 'Insatisfatória', 'Muito insatisfatória'],
};

/** Índice 3 e 4 = abaixo de "Neutro" → perguntar o motivo. Nota: 0 a 6 (detrator). */
export const abaixoDoNeutro = (passo: Passo, indice: number) =>
  passo.tipo === 'nps' ? indice <= 6 : passo.tipo === 'escala' ? indice >= 3 : false;

export const produtoDoItem = (departamento: string, negociacao: string): Produto => {
  if (negociacao === 'PERDIDO') return null;
  if (departamento === 'SHOWROOM') return 'moto';
  if (departamento === 'EQUIPAMENTOS') return 'equipamento';
  if (departamento === 'OFICINA') return 'servico';
  return null; // AVALIAÇÃO: não tem produto
};

const sorteia = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const primeiroNome = (nome: string | null) => {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** Nome da marca na pergunta de experiência: "experiência Ducati" ou "experiência 299 Imports". */
const marca = (itens: Item[], principal: Item) => (itens.some((i) => i.ducati) ? 'Ducati' : principal.nome_exibicao);

// Textos com variações — o sentido de cada indicador não muda, só a redação
// (mensagens idênticas em massa aumentam o risco de bloqueio do número).
const TEXTO_PRODUTO: Record<Exclude<Produto, null>, string[]> = {
  moto: [
    'Após o uso, como você avalia a sua satisfação em relação à *moto adquirida*?',
    'E a *moto adquirida*: depois de usar, qual o seu nível de satisfação com ela?',
  ],
  equipamento: [
    'Após o uso, como você avalia a sua satisfação em relação ao *equipamento adquirido*?',
    'E o *equipamento adquirido*: depois de usar, qual o seu nível de satisfação com ele?',
  ],
  servico: [
    'Como você avalia a sua satisfação com o *serviço realizado* na sua moto?',
    'E o *serviço realizado* na sua moto: qual o seu nível de satisfação com ele?',
  ],
};

export function montarPassos(itens: Item[], principal: Item): Passo[] {
  const todos = itens.map((i) => i.id);
  const passos: Passo[] = [
    {
      chave: 'atendimento', tipo: 'escala', escala: 'atendimento', itens: todos,
      texto: sorteia([
        'Você considera ter recebido um *super atendimento* do consultor?',
        'Sobre o consultor que te atendeu: você considera ter recebido um *super atendimento*?',
      ]),
    },
    {
      chave: 'outros_setores', tipo: 'escala', escala: 'atendimento', itens: todos,
      texto: sorteia(['E dos *outros setores* da loja?', 'E o atendimento dos *outros setores* da loja?']),
    },
  ];
  // Uma pergunta de produto por tipo (moto, equipamento, serviço). Avaliação e perdidos não têm.
  for (const tipo of ['moto', 'equipamento', 'servico'] as const) {
    const ids = itens.filter((i) => i.produto === tipo).map((i) => i.id);
    if (ids.length) {
      passos.push({ chave: `produto:${tipo}`, tipo: 'escala', escala: 'produto', itens: ids, texto: sorteia(TEXTO_PRODUTO[tipo]) });
    }
  }
  const m = marca(itens, principal);
  passos.push(
    {
      chave: 'experiencia', tipo: 'escala', escala: 'experiencia', itens: todos,
      texto: sorteia([`Como você avalia a experiência *${m}*?`, `De forma geral, como foi a sua experiência *${m}*?`]),
    },
    {
      chave: 'nps', tipo: 'nps', itens: todos,
      texto: sorteia([
        `Qual é a probabilidade de você recomendar a *${principal.nome_exibicao}* a um(a) amigo(a) ou colega?`,
        `De 0 a 10, o quanto você recomendaria a *${principal.nome_exibicao}* a um(a) amigo(a) ou colega?`,
      ]),
    },
    {
      chave: 'comentario', tipo: 'sim_nao', itens: todos,
      texto: sorteia([
        'Gostaria de deixar mais algum *comentário, elogio ou crítica*?',
        'Quer deixar mais algum *comentário, elogio ou crítica*?',
      ]),
    },
  );
  return passos;
}

/** Opções (botões) de um passo. id = o:<passo>:<valor>. */
export function opcoesDoPasso(passo: Passo, indice: number): { texto: string; id: string }[] {
  if (passo.tipo === 'escala') return ESCALAS[passo.escala!].map((t, i) => ({ texto: t, id: `o:${indice}:${i}` }));
  if (passo.tipo === 'nps') return Array.from({ length: 11 }, (_, k) => 10 - k).map((n) => ({ texto: String(n), id: `o:${indice}:${n}` }));
  return [{ texto: 'Sim', id: `o:${indice}:1` }, { texto: 'Não', id: `o:${indice}:0` }];
}

export function textoAbertura(nome: string | null, itens: Item[], principal: Item, qtdPerguntas: number): string {
  const n = primeiroNome(nome);
  const ola = n ? `Olá, ${n}!` : 'Olá!';
  const loja = `*${principal.nome_exibicao}*`;
  const tipos = new Set(itens.map((i) => i.produto));
  const soPerdido = itens.every((i) => i.negociacao === 'PERDIDO');
  let motivo: string;
  if (soPerdido) motivo = sorteia([`Obrigado por ter considerado a ${loja}.`, `Obrigado pelo seu contato com a ${loja}.`]);
  else if (tipos.has('moto')) motivo = `Obrigado por escolher a ${loja} na *compra da sua moto*.`;
  else if (tipos.has('equipamento')) motivo = `Obrigado por escolher a ${loja} na *compra do seu equipamento*.`;
  else if (tipos.has('servico')) motivo = `Obrigado por escolher a ${loja} para *cuidar da sua moto*.`;
  else motivo = `Obrigado por escolher a ${loja} na *negociação da sua moto*.`;
  const pedido = sorteia([
    `Por favor, *responda a uma rápida pesquisa*. São ${qtdPerguntas} perguntas e leva cerca de 1 minuto e meio.`,
    `Pode nos ajudar com uma *pesquisa rápida*? São ${qtdPerguntas} perguntas, leva cerca de 1 minuto e meio.`,
  ]);
  return `${ola}\n\n${motivo}\n\n${pedido}\n\n*Obrigado!*`;
}

export const textoMotivo = (passo: Passo) =>
  passo.tipo === 'nps'
    ? sorteia(['Poxa, obrigado pela sinceridade. O que faltou para darmos uma nota maior?', 'Entendemos. Pode contar o que faltou para uma nota maior?'])
    : sorteia([
        'Poxa, sentimos muito. Pode nos contar o que motivou essa resposta? Pode escrever ou mandar um áudio.',
        'Que pena. O que aconteceu para você responder assim? Pode escrever ou mandar um áudio.',
      ]);

export const TEXTO_PEDIR_COMENTARIO =
  'Perfeito! Envie o seu feedback em uma única mensagem. Se preferir, você também pode enviar um áudio.';

export interface Fechamento { texto: string; linkPreview: boolean }

/**
 * Mensagem final, conforme a nota:
 *  - Ducati na oficina (BSB, FLN, POA) com nota 10 → portal da Ducati (cadastro com o e-mail do cliente);
 *  - nota 9 ou 10 → Google da loja; em Brasília, ganha uma lavagem mostrando a avaliação;
 *  - demais → só o agradecimento.
 */
export function textoFechamento(
  nota: number | null, itens: Item[], principal: Item, link: { google: string | null; portalDucati: string; instagram?: string | null },
  email: string | null,
): Fechamento {
  const insta = link.instagram ? `📸 Siga a gente no Instagram: ${link.instagram}

` : '';
  const assinatura = `${insta}Abraços, equipe *${principal.nome_exibicao}*! 🏁`;
  const ducatiOficina = itens.some((i) => i.ducati && i.departamento === 'OFICINA');
  if (nota === 10 && ducatiOficina) {
    const emailTxt = email
      ? `Basta se inscrever com o e-mail do seu cadastro: *${email}*`
      : 'Basta se inscrever com o seu e-mail.';
    return {
      texto: `Agradecemos por dedicar o seu tempo!\n\nQue tal deixar essa avaliação também no *portal da Ducati*? Ela faz toda a diferença para nós.\n\n🔗 ${link.portalDucati}\n\n${emailTxt}\n\n${assinatura}`,
      linkPreview: false,
    };
  }
  if (nota !== null && nota >= 9 && link.google) {
    const lavagem = principal.cidade === 'BSB'
      ? '\n\nE tem mais: *mostrando a sua avaliação no Google aqui no nosso Lava-Jato você ganha uma lavagem conosco!* 🫧💦'
      : '';
    return {
      texto: `*Agradecemos por dedicar o seu tempo!*\n\n*Nos avalie também no Google*, sua opinião faz toda a diferença e nos ajuda a alcançar ainda mais pessoas:\n\n🔗 ${link.google}${lavagem}\n\n${assinatura}`,
      linkPreview: true,
    };
  }
  return { texto: `*Agradecemos por dedicar o seu tempo!* Sua opinião é muito importante para nós.\n\n${assinatura}`, linkPreview: false };
}
