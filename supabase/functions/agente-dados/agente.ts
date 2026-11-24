// deno-lint-ignore-file no-explicit-any
// Loop do agente de dados: Claude + ferramentas SÓ de leitura (consultas passam pela função
// agente_consultar do banco: papel somente leitura, sem tokens/senhas, salários só com RH).
import Anthropic from 'npm:@anthropic-ai/sdk@^0.121.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { INSTRUCOES, contextoUsuario } from './prompt.ts';
import type { Conversa } from './whatsapp.ts';
import { base64 } from './whatsapp.ts';
import { gerarExcel, gerarPdf, nomeArquivo } from './arquivos.ts';

const MODELO = Deno.env.get('AGENTE_MODELO') ?? 'claude-opus-5-5';
const MAX_VOLTAS = 14; // chamadas ao modelo por pergunta
const LINHAS_PARA_O_MODELO = 150; // amostra devolvida ao modelo (o total vai junto)
const MAX_CHARS_RESULTADO = 60_000;
const AVISO_DEMORA_MS = 7_000;

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
  tokensEntrada: number;
  tokensSaida: number;
}

/** Roda uma consulta pela porta somente leitura do banco. */
async function consultar(db: SupabaseClient, sql: string, rh: boolean): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.rpc('agente_consultar', { _q: sql, _rh: rh });
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
  historico: Anthropic.MessageParam[];
  entrada: Anthropic.ContentBlockParam[];
}): Promise<ResultadoAgente> {
  const { db, conversa, nome, rh } = opts;
  const client = new Anthropic({ apiKey: Deno.env.get('AGENTE_ANTHROPIC_API_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY') });
  const r: ResultadoAgente = { respostaFinal: '', consultas: [], arquivos: [], tokensEntrada: 0, tokensSaida: 0 };

  // "Estou levantando..." se a resposta demorar.
  let respondeu = false;
  const aviso = setTimeout(() => {
    if (!respondeu) conversa.texto('Um momento, estou levantando essas informações. 📊').catch(() => {});
  }, AVISO_DEMORA_MS);

  const messages: Anthropic.MessageParam[] = [...opts.historico, { role: 'user', content: opts.entrada }];
  let botoesEnviados = false;
  try {
    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 8000,
        system: [
          { type: 'text', text: INSTRUCOES, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contextoUsuario(nome, rh) },
        ],
        tools: ferramentas,
        messages,
      });
      r.tokensEntrada += resp.usage?.input_tokens ?? 0;
      r.tokensSaida += resp.usage?.output_tokens ?? 0;

      const textoDaVolta = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();

      if (resp.stop_reason === 'refusal') {
        r.respostaFinal = 'Não posso ajudar com esse pedido. Posso apoiar com análises e números do negócio. 💼';
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
              const linhas = await consultar(db, sql, rh);
              r.consultas.push({ objetivo: inp.objetivo, sql, linhas: linhas.length, ms: Date.now() - t0 });
              resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: resumoResultado(linhas) });
            } catch (e) {
              r.consultas.push({ objetivo: inp.objetivo, sql, erro: String(e).slice(0, 300), ms: Date.now() - t0 });
              resultados.push({ type: 'tool_result', tool_use_id: bloco.id, is_error: true, content: `Erro na consulta: ${String((e as Error).message ?? e).slice(0, 400)}` });
            }
          } else if (bloco.name === 'estrutura_tabelas') {
            const nomes = (Array.isArray(inp.tabelas) ? inp.tabelas : []).map(String).filter((t: string) => /^[a-z0-9_]{1,63}$/.test(t)).slice(0, 10);
            const sql = `select table_name as tabela, column_name as coluna, data_type as tipo from information_schema.columns where table_schema = 'public' and table_name in (${nomes.map((n: string) => `'${n}'`).join(', ') || "''"}) order by table_name, ordinal_position`;
            const linhas = await consultar(db, sql, rh);
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
            let linhas = await consultar(db, sql, rh);
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
                `📋 ${titulo} (${linhas.length} registros${cortado ? ', limitado a 2.000' : ''})`,
              );
              respondeu = true;
              r.arquivos.push({ formato, titulo, linhas: linhas.length });
              resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: `Arquivo ${formato.toUpperCase()} enviado com ${linhas.length} registros${cortado ? ' (limitado a 2.000)' : ''}.` });
            }
          } else if (bloco.name === 'responder_com_botoes') {
            const opcoes = (Array.isArray(inp.opcoes) ? inp.opcoes : []).map(String);
            await conversa.botoes(String(inp.texto ?? ''), opcoes);
            respondeu = true;
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
      r.respostaFinal = 'Não consegui concluir essa análise agora. Pode reformular a pergunta ou reduzir o período? 📊';
    }
    if (r.respostaFinal && !botoesEnviados) {
      await conversa.texto(r.respostaFinal);
    }
    respondeu = true;
    return r;
  } finally {
    clearTimeout(aviso);
  }
}
