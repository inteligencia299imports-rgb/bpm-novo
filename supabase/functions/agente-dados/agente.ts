// deno-lint-ignore-file no-explicit-any
// Loop do agente de dados: Claude + ferramentas SÓ de leitura (consultas passam pela função
// agente_consultar do banco: papel somente leitura, sem tokens/senhas, salários só com RH).
import Anthropic from 'npm:@anthropic-ai/sdk@^0.121.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { INSTRUCOES, contextoUsuario } from './prompt.ts';
import type { Conversa } from './whatsapp.ts';
import { base64 } from './whatsapp.ts';
import { gerarExcel, gerarPdf, nomeArquivo } from './arquivos.ts';
import { gerarManual, nomeManual, type ManualSpec } from './manual.ts';

const MODELO = Deno.env.get('AGENTE_MODELO') ?? 'claude-opus-5-5';
const MAX_VOLTAS = 14; // chamadas ao modelo por pergunta
const MAX_TOKENS = 16_000; // folga para o conteúdo de um manual
const LINHAS_PARA_O_MODELO = 150; // amostra devolvida ao modelo (o total vai junto)
const MAX_CHARS_RESULTADO = 60_000;

/** Preço do Claude Opus 5.5 (US$ por token): entrada, saída, leitura e escrita de cache (5 min). */
const PRECO = { entrada: 4 / 1e6, saida: 20 / 1e6, cacheLeitura: 0.2 / 1e6, cacheEscrita: 5 / 1e6 };
/** Transcrição de áudio (gpt-4o-mini-transcribe): ~US$ 0,003 por minuto. */
export const PRECO_AUDIO_SEG = 0.003 / 60;

const ferramentas: Anthropic.Tool[] = [
  {
    name: 'consultar_banco',
    description:
      'Executa UMA consulta SQL somente leitura (SELECT ou WITH) no banco da 299 e devolve as linhas em JSON (até 150 linhas na amostra, com o total). Agregue no banco sempre que possível. Não aceita ";" nem comandos de alteração.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Consulta SELECT/WITH única, sem ponto e vírgula.' },
        objetivo: { type: 'string', description: 'Em poucas palavras, o que a consulta responde (para o registro).' },
      },
      required: ['sql', 'objetivo'],
    },
  },
  {
    name: 'estrutura_tabelas',
    description: 'Lista as colunas e tipos das tabelas/visões informadas (só as que você pode consultar).',
    input_schema: {
      type: 'object',
      properties: { tabelas: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
      required: ['tabelas'],
    },
  },
  {
    name: 'enviar_arquivo',
    description:
      'Gera um arquivo Excel ou PDF com o resultado de uma consulta SELECT (até 2.000 linhas) e envia ao usuário desta conversa. Use quando a lista passar de 30 registros e o usuário escolher o formato.',
    input_schema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: ['excel', 'pdf'] },
        titulo: { type: 'string', description: 'Título do relatório (também vira o nome do arquivo).' },
        sql: { type: 'string', description: 'Consulta SELECT/WITH única, com aliases legíveis em português.' },
      },
      required: ['formato', 'titulo', 'sql'],
    },
  },
  {
    name: 'gerar_manual',
    description:
      'Gera um manual de processo em PDF no padrão visual dos manuais do Setor de Inteligência da 299 (capa com logo, páginas 16:9, rodapé) e envia ao usuário desta conversa. Siga a estrutura da seção "Manuais em PDF". Textos aceitam **negrito**.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título curto do manual (ex.: "Moto de repasse"). Vira "MANUAL - TITULO.pdf".' },
        area: { type: 'string', description: 'Setores/etapas separados por " · " (rótulo da capa).' },
        subtitulo: { type: 'string', description: '1 ou 2 frases do que o manual explica.' },
        chips: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Termos-chave ou caminhos (3 a 5).' },
        paginas: {
          type: 'array',
          maxItems: 12,
          description: 'Páginas depois da capa, na ordem da estrutura padrão.',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['cards', 'passos', 'comparativo', 'tela', 'tabela'] },
              rotulo: { type: 'string', description: 'Rótulo pequeno acima do título (ex.: "Visão geral").' },
              titulo: { type: 'string' },
              fundo: { type: 'string', enum: ['claro', 'alternativo', 'escuro'], description: 'Só para cards. "escuro" = Cuidados e dicas (última página).' },
              cards: { type: 'array', maxItems: 6, items: { type: 'object', properties: { icone: { type: 'string' }, titulo: { type: 'string' }, texto: { type: 'string' } }, required: ['titulo', 'texto'] } },
              passos: { type: 'array', maxItems: 7, items: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' }, tag: { type: 'string' }, cor: { type: 'string', enum: ['laranja', 'azul', 'verde', 'roxo', 'cinza', 'vermelho'] } }, required: ['titulo', 'texto'] } },
              lados: {
                type: 'array', maxItems: 2,
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string' }, cor: { type: 'string', enum: ['laranja', 'azul', 'verde', 'roxo', 'cinza', 'vermelho'] }, selo: { type: 'string' },
                    linhas: { type: 'array', maxItems: 8, items: { type: 'object', properties: { campo: { type: 'string' }, valor: { type: 'string' } }, required: ['campo', 'valor'] } },
                  },
                  required: ['nome', 'linhas'],
                },
              },
              tela: {
                type: 'object',
                description: 'Simulação da tela (quando não houver print do usuário).',
                properties: {
                  titulo: { type: 'string' },
                  caminho: { type: 'string', description: 'Ex.: "Detalhe da venda › Solicitar Devolução".' },
                  campos: {
                    type: 'array', maxItems: 10,
                    items: {
                      type: 'object',
                      properties: {
                        tipo: { type: 'string', enum: ['campo', 'opcoes', 'tabela', 'texto', 'resumo', 'botao'] },
                        rotulo: { type: 'string' }, valor: { type: 'string' },
                        opcoes: { type: 'array', items: { type: 'string' } }, selecionada: { type: 'string' },
                        colunas: { type: 'array', items: { type: 'string' } },
                        linhas: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                        marcador: { type: 'integer', description: 'Número da legenda que aponta para este campo.' },
                        meia: { type: 'boolean', description: 'Dois campos seguidos com meia = true ficam lado a lado.' },
                      },
                      required: ['tipo'],
                    },
                  },
                },
              },
              usar_imagem: { type: 'boolean', description: 'Usar o print de tela que o usuário enviou NESTA mensagem.' },
              marcadores: {
                type: 'array', maxItems: 9, description: 'Marcadores sobre o print (x e y em % da largura/altura da imagem).',
                items: { type: 'object', properties: { numero: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['numero', 'x', 'y'] },
              },
              legenda: { type: 'array', maxItems: 7, items: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' } }, required: ['titulo', 'texto'] } },
              colunas: { type: 'array', maxItems: 6, items: { type: 'string' } },
              coluna_tag: { type: 'integer', description: 'Índice (0 = primeira) da coluna exibida como etiqueta colorida.' },
              linhas: { type: 'array', maxItems: 60, items: { type: 'object', properties: { celulas: { type: 'array', items: { type: 'string' } }, cor: { type: 'string', enum: ['laranja', 'azul', 'verde', 'roxo', 'cinza', 'vermelho'] } }, required: ['celulas'] } },
              nota: { type: 'object', properties: { destaque: { type: 'string' }, texto: { type: 'string' } }, required: ['texto'], description: 'Faixa de destaque no fim da página.' },
            },
            required: ['tipo', 'rotulo', 'titulo'],
          },
        },
      },
      required: ['titulo', 'area', 'subtitulo', 'paginas'],
    },
  },
  {
    name: 'consumo_do_agente',
    description:
      'Consumo e gastos DESTE agente (perguntas, tokens e custo estimado em US$), por período e opcionalmente por usuário. É a única fonte para perguntas sobre consumo de tokens, custos ou gastos de IA.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'AAAA-MM-DD (opcional; padrão: início do mês atual).' },
        data_fim: { type: 'string', description: 'AAAA-MM-DD, inclusive (opcional; padrão: hoje).' },
        por_usuario: { type: 'boolean', description: 'Detalhar por usuário.' },
      },
    },
  },
  {
    name: 'responder_com_botoes',
    description:
      'Envia ao usuário uma mensagem com até 3 botões de resposta rápida (ex.: Sim/Não, Excel/PDF). Use para toda pergunta de resposta objetiva. Depois de usar, encerre o turno sem texto adicional.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        opcoes: { type: 'array', items: { type: 'string', maxLength: 20 }, minItems: 1, maxItems: 3 },
      },
      required: ['texto', 'opcoes'],
    },
  },
];

export interface ResultadoAgente {
  respostaFinal: string;
  consultas: { objetivo?: string; sql: string; linhas?: number; erro?: string; ms: number }[];
  arquivos: { formato: string; titulo: string; linhas: number }[];
  /** Conteúdo do último manual gerado (vai para o histórico, para ajustes depois). */
  manual?: ManualSpec;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  tokensCacheEscrita: number;
  custoUsd: number;
}

/** Consumo do próprio agente (registro agente_dados_log), lido pela função — o papel de consulta não vê o log. */
async function consumoDoAgente(db: SupabaseClient, inp: any) {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const ok = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const ini = ok(inp.data_inicio) ? inp.data_inicio : `${hoje.slice(0, 7)}-01`;
  const fim = ok(inp.data_fim) ? inp.data_fim : hoje;
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400_000).toISOString();
  const { data, error } = await db.from('agente_dados_log')
    .select('nome, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, audio_segundos, custo_usd, arquivos')
    .gte('created_at', new Date(`${ini}T00:00:00-03:00`).toISOString()).lt('created_at', ate).limit(20000);
  if (error) throw new Error(error.message);
  const soma = (rs: any[]) => ({
    perguntas: rs.length,
    tokens_entrada: rs.reduce((t, x) => t + (x.tokens_entrada ?? 0), 0),
    tokens_saida: rs.reduce((t, x) => t + (x.tokens_saida ?? 0), 0),
    tokens_cache: rs.reduce((t, x) => t + (x.tokens_cache_leitura ?? 0) + (x.tokens_cache_escrita ?? 0), 0),
    minutos_audio: Math.round(rs.reduce((t, x) => t + (x.audio_segundos ?? 0), 0) / 6) / 10,
    arquivos_gerados: rs.reduce((t, x) => t + (Array.isArray(x.arquivos) ? x.arquivos.length : 0), 0),
    custo_usd: Math.round(rs.reduce((t, x) => t + Number(x.custo_usd ?? 0), 0) * 100) / 100,
  });
  const rs = data ?? [];
  const out: any = { periodo: { de: ini, ate: fim }, total: soma(rs), observacao: 'Custo estimado pela tabela de preços (Claude Opus 5.5 e transcrição de áudio), em US$. Só deste agente.' };
  if (inp.por_usuario) {
    const grupos: Record<string, any[]> = {};
    for (const x of rs) (grupos[x.nome ?? '-'] ??= []).push(x);
    out.por_usuario = Object.entries(grupos).map(([nome, g]) => ({ usuario: nome, ...soma(g) })).sort((a, b) => b.custo_usd - a.custo_usd);
  }
  return out;
}

/** Roda uma consulta pela porta somente leitura do banco. */
async function consultar(db: SupabaseClient, sql: string, rh: boolean, chave: string): Promise<Record<string, unknown>[]> {
  // A alçada do usuário (sistemas e departamentos) é aplicada no banco, pelo papel dele.
  const { data, error } = await db.rpc('agente_consultar', { _q: sql, _rh: rh, _chave: chave });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

const resumoResultado = (linhas: Record<string, unknown>[]) => {
  const passou = linhas.length > 2000;
  const lista = passou ? linhas.slice(0, 2000) : linhas;
  let json = JSON.stringify({
    total_linhas: passou ? 'mais de 2000' : lista.length,
    amostra: lista.slice(0, LINHAS_PARA_O_MODELO),
    amostra_parcial: lista.length > LINHAS_PARA_O_MODELO,
  });
  if (json.length > MAX_CHARS_RESULTADO) json = `${json.slice(0, MAX_CHARS_RESULTADO)} …(resultado cortado; refine a consulta)`;
  // Marca explícita: o que vem do banco é dado, não instrução.
  return `<dados_do_banco>\n${json}\n</dados_do_banco>`;
};

export async function rodarAgente(opts: {
  db: SupabaseClient;
  conversa: Conversa;
  nome: string;
  rh: boolean;
  /** Chave do telefone: define a alçada no banco. */
  chave: string;
  /** Sistemas liberados (null = todos) e se o HCM é só dos departamentos que gere. */
  sistemas: string[] | null;
  hcmSoDepartamentos: boolean;
  /** Perfil de acesso (ex.: "vendedor": sem custos, valor de compra e avaliação). */
  perfil?: string | null;
  historico: Anthropic.MessageParam[];
  entrada: Anthropic.ContentBlockParam[];
}): Promise<ResultadoAgente> {
  const { db, conversa, nome, rh, chave } = opts;
  const client = new Anthropic({ apiKey: Deno.env.get('AGENTE_ANTHROPIC_API_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY') });
  const r: ResultadoAgente = {
    respostaFinal: '', consultas: [], arquivos: [], tokensEntrada: 0, tokensSaida: 0, tokensCacheLeitura: 0, tokensCacheEscrita: 0, custoUsd: 0,
  };

  const messages: Anthropic.MessageParam[] = [...opts.historico, { role: 'user', content: opts.entrada }];
  // Instruções montadas UMA vez por pergunta: o começo da conversa não pode mudar entre as chamadas do
  // loop (o raciocínio de uma chamada fica preso a esse começo; mudar o horário a cada volta dava erro 400).
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: INSTRUCOES, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextoUsuario(nome, rh, opts.sistemas, opts.hcmSoDepartamentos, opts.perfil ?? null) },
  ];
  let botoesEnviados = false;
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system,
      tools: ferramentas,
      messages,
    });
    const u: any = resp.usage ?? {};
    r.tokensEntrada += u.input_tokens ?? 0;
    r.tokensSaida += u.output_tokens ?? 0;
    r.tokensCacheLeitura += u.cache_read_input_tokens ?? 0;
    r.tokensCacheEscrita += u.cache_creation_input_tokens ?? 0;
    r.custoUsd += (u.input_tokens ?? 0) * PRECO.entrada + (u.output_tokens ?? 0) * PRECO.saida
      + (u.cache_read_input_tokens ?? 0) * PRECO.cacheLeitura + (u.cache_creation_input_tokens ?? 0) * PRECO.cacheEscrita;

    const textoDaVolta = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();

    if (resp.stop_reason === 'refusal') {
      r.respostaFinal = 'Não posso ajudar com esse pedido. Posso apoiar com análises e números do negócio.';
      break;
    }
    if (resp.stop_reason !== 'tool_use') {
      // Fim do turno (end_turn / max_tokens): o texto é a resposta, a não ser que já tenha ido com botões.
      if (!botoesEnviados) r.respostaFinal = textoDaVolta;
      break;
    }

    messages.push({ role: 'assistant', content: resp.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of resp.content) {
      if (bloco.type !== 'tool_use') continue;
      const inp = (bloco.input ?? {}) as any;
      const t0 = Date.now();
      try {
        if (bloco.name === 'consultar_banco') {
          const sql = String(inp.sql ?? '');
          try {
            const linhas = await consultar(db, sql, rh, chave);
            r.consultas.push({ objetivo: inp.objetivo, sql, linhas: linhas.length, ms: Date.now() - t0 });
            resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: resumoResultado(linhas) });
          } catch (e) {
            r.consultas.push({ objetivo: inp.objetivo, sql, erro: String(e).slice(0, 300), ms: Date.now() - t0 });
            resultados.push({ type: 'tool_result', tool_use_id: bloco.id, is_error: true, content: `Erro na consulta: ${String((e as Error).message ?? e).slice(0, 400)}` });
          }
        } else if (bloco.name === 'estrutura_tabelas') {
          const nomes = (Array.isArray(inp.tabelas) ? inp.tabelas : []).map(String).filter((t: string) => /^[a-z0-9_]{1,63}$/.test(t)).slice(0, 10);
          const sql = `select table_name as tabela, column_name as coluna, data_type as tipo from information_schema.columns where table_schema not in ('pg_catalog', 'information_schema', 'agente') and table_name in (${nomes.map((n: string) => `'${n}'`).join(', ') || "''"}) order by table_name, ordinal_position`;
          const linhas = await consultar(db, sql, rh, chave);
          const porTabela: Record<string, string[]> = {};
          for (const l of linhas) (porTabela[String(l.tabela)] ??= []).push(`${l.coluna} (${l.tipo})`);
          const naoEncontradas = nomes.filter((n: string) => !porTabela[n]);
          resultados.push({
            type: 'tool_result', tool_use_id: bloco.id,
            content: JSON.stringify({ tabelas: porTabela, sem_acesso_ou_inexistentes: naoEncontradas }),
          });
        } else if (bloco.name === 'enviar_arquivo') {
          const sql = String(inp.sql ?? '');
          const titulo = String(inp.titulo ?? 'Relatório').slice(0, 120);
          const formato = inp.formato === 'pdf' ? 'pdf' : 'excel';
          let linhas = await consultar(db, sql, rh, chave);
          const cortado = linhas.length > 2000;
          if (cortado) linhas = linhas.slice(0, 2000);
          r.consultas.push({ objetivo: `arquivo: ${titulo}`, sql, linhas: linhas.length, ms: Date.now() - t0 });
          if (!linhas.length) {
            resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: 'A consulta não retornou registros; nenhum arquivo foi enviado.' });
          } else {
            const bytes = formato === 'pdf' ? await gerarPdf(titulo, linhas) : gerarExcel(titulo, linhas);
            await conversa.documento(
              nomeArquivo(titulo, formato === 'pdf' ? 'pdf' : 'xlsx'),
              formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              base64(bytes),
              `${titulo} (${linhas.length} registros${cortado ? ', limitado a 2.000' : ''})`,
            );
            r.arquivos.push({ formato, titulo, linhas: linhas.length });
            resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: `Arquivo ${formato.toUpperCase()} enviado com ${linhas.length} registros${cortado ? ' (limitado a 2.000)' : ''}.` });
          }
        } else if (bloco.name === 'gerar_manual') {
          const spec = inp as ManualSpec;
          if (!spec?.titulo || !Array.isArray(spec.paginas) || !spec.paginas.length) throw new Error('manual sem título ou sem páginas');
          // Print de tela enviado nesta mensagem (para a página "tela" com usar_imagem).
          const img = opts.entrada.find((b) => b.type === 'image') as any;
          const imagem = img?.source?.type === 'base64'
            ? { bytes: Uint8Array.from(atob(img.source.data), (c) => c.charCodeAt(0)), tipo: String(img.source.media_type) }
            : undefined;
          const bytes = await gerarManual(spec, imagem);
          const nome = nomeManual(spec.titulo);
          await conversa.documento(nome, 'application/pdf', base64(bytes), nome.replace(/\.pdf$/, ''));
          r.manual = spec;
          r.arquivos.push({ formato: 'manual', titulo: spec.titulo, linhas: spec.paginas.length + 1 });
          resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: `Manual enviado (${spec.paginas.length + 1} páginas). Responda só com uma frase curta de confirmação, sem repetir o conteúdo.` });
        } else if (bloco.name === 'consumo_do_agente') {
          const c = await consumoDoAgente(db, inp);
          resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: JSON.stringify(c) });
        } else if (bloco.name === 'responder_com_botoes') {
          const opcoes = (Array.isArray(inp.opcoes) ? inp.opcoes : []).map(String);
          await conversa.botoes(String(inp.texto ?? ''), opcoes);
          botoesEnviados = true;
          r.respostaFinal = `${inp.texto ?? ''} [botões: ${opcoes.join(' | ')}]`;
          resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: 'Mensagem com botões enviada. Encerre o turno sem texto adicional.' });
        } else {
          resultados.push({ type: 'tool_result', tool_use_id: bloco.id, is_error: true, content: 'Ferramenta inexistente.' });
        }
      } catch (e) {
        resultados.push({ type: 'tool_result', tool_use_id: bloco.id, is_error: true, content: `Falha: ${String((e as Error).message ?? e).slice(0, 300)}` });
      }
    }
    messages.push({ role: 'user', content: resultados });
  }
  if (!r.respostaFinal && !botoesEnviados && !r.arquivos.length) {
    r.respostaFinal = 'Não consegui concluir essa análise agora. Pode reformular a pergunta ou reduzir o período?';
  }
  if (r.respostaFinal && !botoesEnviados) {
    await conversa.texto(r.respostaFinal);
  }
  return r;
}
