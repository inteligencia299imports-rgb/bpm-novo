// deno-lint-ignore-file no-explicit-any
// RENAVE (SERPRO) — entrada/saída de veículo 0km em estoque + ATPV-e, e
// entrada de veículo próprio (seminova) em estoque.
// Ações: cliente | pendentes | entrada | entrada-usado | saida | atpv-pdf |
//        atpv-pdf-usado | atpv-assinatura | estoque-status | vincular-nf |
//        termo-entrada-pdf | cancelar-estoque | crlve |
//        saida-usado | saida-usado-atpv | saida-usado-nf | saida-usado-termo |
//        saida-usado-cancelar (saída de seminova vendida, ver bloco próprio)
// Sequência real da entrada de seminova comprada de particular — CORRIGIDA
// 2026-09-23 contra o manual oficial da SERPRO (renave.estaleiro.serpro.gov.br/
// renave-ws/manual/) e RECONFIRMADA 2026-09-22 (achado real, chassi
// 95VHA00AAHM000135): entrada-usado (1, usa /api/solicitacoes-entrada-
// estoque — NÃO o "-veiculo-proprio" — com o CPF do vendedor; é isso que
// gera o idEstoque E cria a "intenção de venda" do lado da SERPRO) ->
// atpv-pdf-usado (2, baixa o ATPV-e em branco; só funciona DEPOIS do passo 1
// — sem a intenção de venda criada, a SERPRO rejeita com "Não existe
// intenção de venda disponível...") -> atpv-assinatura (3, só funciona
// DEPOIS do passo 1, exige idEstoque; é o envio da assinatura que efetiva a
// transferência pro CNPJ) -> NF-e (4, automático dentro do passo 1) ->
// crlve (5, baixa o CRLV-e já com a empresa como dona). Documentação
// oficial: "Vendedor deve ser o proprietário do veículo... Estabelecimento
// não pode ser o proprietário" (entrada) e "a assinatura... deve ser
// realizada após a entrada em estoque" (assinatura).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  clienteAutenticado, pendentesEntrada, entrarEstoqueZeroKm, entrarEstoque, enviarNotaFiscal,
  consultarEstoque, consultarVeiculoPorChassi, listarEstoques, municipios, sairEstoqueZeroKm, pdfAtpvPorChassi,
  enviarAssinaturaAtpv, consultarCrlve, termoEntradaEstoque, cancelarEstoque, erroRenave,
  sairEstoque, termoSaidaEstoque, cancelarSaidaEstoque,
  type RenaveLogCtx, type EnvioAssinaturaAtpv, type EntradaEstoque,
} from './renave.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';
// E-mail do estabelecimento exigido pela SERPRO na saída (ATPV-e) — mesmo
// e-mail pras 4 empresas do grupo (achado real 2026-09-15: rejeição [400]
// "E-mail do estabelecimento é obrigatório", nunca era enviado).
const EMAIL_ESTABELECIMENTO_PADRAO = 'financeiro@299imports.com.br';
// Mesmo modelo usado em extrair-dados-crlv, pra extração de documento.
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL_EXTRACAO') || 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** 44 dígitos da chave (remove prefixo "NFe" e não-dígitos). */
const soChave = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '').slice(-44);
const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([^<]+)</${name}>`, 'i'));
  return m ? m[1].trim() : null;
};

/**
 * Acha o campo com o PDF em base64 numa resposta da SERPRO, sem depender de
 * saber o nome exato do campo de antemão -- a doc oficial do "Termo de
 * Entrada em Estoque" (achado 2026-09-22) truncou antes de listar o schema
 * completo da resposta, então em vez de chutar um nome, procura pela
 * primeira chave cujo nome contenha "base64" (padrão confirmado nos outros
 * endpoints: pdfAtpvBase64, pdfCodigoSegurancaCrvBase64 etc.).
 */
function achaPdfBase64(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 200 && /base64/i.test(k)) return v;
  }
  return null;
}

/**
 * RENAVE espera dataHora em horário de Brasília SEM timezone (sem "Z"/offset).
 * Mandar em UTC com "Z" (ex.: new Date().toISOString()) faz a SERPRO ler o
 * número como se já fosse hora local — "agora" em UTC vira "daqui a 3h" em
 * Brasília, e ela rejeita como data futura (achado real, entrada 0km,
 * 2026-09-14). Brasil não tem mais horário de verão desde 2019, então -03:00
 * fixo é seguro. Aceita undefined (vira "agora") ou uma string ISO já em UTC.
 */
function brasiliaNaiveIso(input?: string | null): string {
  const d = input ? new Date(input) : new Date();
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 19);
}

async function persistir(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from('estoque_motos_novas')
    .update({ ...patch, renave_atualizado_em: new Date().toISOString() })
    .eq('id', id);
}

async function persistirAvaliacao(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from('avaliacoes')
    .update({ ...patch, renave_atualizado_em: new Date().toISOString() })
    .eq('id', id);
}

/** CNPJ (só dígitos) da empresa dona da moto — escolhe qual certificado a chamada usa. */
async function cnpjDaEmpresa(admin: any, empresaId: string | null | undefined): Promise<string | null> {
  if (!empresaId) return null;
  const { data } = await admin.from('empresas').select('cnpj').eq('id', empresaId).maybeSingle();
  return data?.cnpj ? String(data.cnpj).replace(/\D/g, '') : null;
}

// Seminova não tem empresa_id direto (diferente de estoque_motos_novas) --
// resolve pela mesma cadeia que emitir-nfe-compra já usa pra achar o CNPJ
// emitente: avaliacao -> atendimento -> loja -> empresa.
async function cnpjDaEmpresaPorAvaliacao(admin: any, avaliacaoId: string): Promise<string | null> {
  const { data: av } = await admin.from('avaliacoes').select('atendimento_id').eq('id', avaliacaoId).maybeSingle();
  if (!av?.atendimento_id) return null;
  const { data: at } = await admin.from('atendimentos_motos').select('loja_id').eq('id', av.atendimento_id).maybeSingle();
  if (!at?.loja_id) return null;
  const { data: lojaEmpresa } = await admin.from('loja_empresas').select('empresa_id').eq('id', at.loja_id).maybeSingle();
  if (!lojaEmpresa?.empresa_id) return null;
  return cnpjDaEmpresa(admin, lojaEmpresa.empresa_id);
}

// Achado real 2026-09-22 (chassi 95V1X00AARM000160, placa SXI9A07): o
// "código de segurança do CRV" muda a cada nova emissão do CLA/CRV digital
// pela CDT -- um CRLV anexado meses atrás pode estar com um código já
// invalidado, mesmo com o mesmo número de CRV (achado: CRLV emitido
// 17/02/2026 trazia 55846406138; o ATPV-e baixado agora da própria SERPRO
// trouxe 62570340173 pro MESMO número de CRV 244117127659). O ATPV-e é
// gerado pela SERPRO na hora do download e reflete o CRV vigente no RENAVAM
// -- por isso é a fonte usada pra entrada em estoque, não o CRLV anexado
// pelo usuário. Best-effort: se a extração falhar, mantém o que já estava
// em avaliacoes (não derruba o download do ATPV-e por isso).
// Também usada na saída de seminova (tipoDoc 'crv'): depois da entrada
// CONFIRMADA o Detran reemite o CRV no nome do estabelecimento, com código de
// segurança NOVO -- a saída exige esse código atual, que só vem no PDF
// `pdfCodigoSegurancaCrvBase64` do CRLV-e (a SERPRO não devolve em campo).
async function extrairCodigoSegurancaDoAtpv(pdfBase64: string, tipoDoc: 'atpv' | 'crv' = 'atpv'): Promise<{ codigoSegurancaCrv: string | null; numeroCrv: string | null }> {
  const instrucao = tipoDoc === 'crv'
    ? 'Este é o PDF do código de segurança do CRV (Certificado de Registro de Veículo) emitido pela SERPRO/Detran. Leia exatamente o "CÓDIGO DE SEGURANÇA" do CRV (11 dígitos) e, se aparecer, o "NÚMERO DO CRV" (12 dígitos), e registre-os. Nunca invente — se algum não estiver legível ou não existir no documento, devolva string vazia "".'
    : 'Este é um ATPV-e (Autorização para Transferência de Propriedade de Veículo digital) da SERPRO. Leia exatamente os campos "CÓDIGO DE SEGURANÇA CRV" (11 dígitos) e "NÚMERO CRV" (12 dígitos) e registre-os. Nunca invente — se algum não estiver legível, devolva string vazia "".';
  const vazio = { codigoSegurancaCrv: null, numeroCrv: null };
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return vazio;
  try {
    const workspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        tools: [{
          name: 'registrar_codigo_seguranca',
          description: 'Registra o código de segurança do CRV lido do documento.',
          input_schema: {
            type: 'object',
            properties: {
              codigo_seguranca_crv: { type: 'string', description: 'Valor do campo "CÓDIGO DE SEGURANÇA CRV" do ATPV-e (11 dígitos). String vazia "" se não estiver legível.' },
              numero_crv: { type: 'string', description: 'Valor do campo "NÚMERO CRV" do ATPV-e (12 dígitos). String vazia "" se não estiver legível.' },
            },
            required: ['codigo_seguranca_crv', 'numero_crv'],
          },
        }],
        tool_choice: { type: 'tool', name: 'registrar_codigo_seguranca' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: instrucao },
          ],
        }],
      }),
    });
    if (!res.ok) { console.warn('extrairCodigoSegurancaDoAtpv HTTP', res.status, await res.text()); return vazio; }
    const data = await res.json();
    const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
    if (!toolUse) return vazio;
    const codigo = String(toolUse.input?.codigo_seguranca_crv ?? '').replace(/\D/g, '');
    const numero = String(toolUse.input?.numero_crv ?? '').replace(/\D/g, '');
    return {
      codigoSegurancaCrv: codigo.length === 11 ? codigo : null,
      numeroCrv: numero.length === 12 ? numero : null,
    };
  } catch (e) {
    console.warn('extrairCodigoSegurancaDoAtpv falhou:', e);
    return vazio;
  }
}

/**
 * Comprador da saída de estoque (0km e seminova usam o mesmo formato) a partir
 * do cliente do atendimento da venda. Resolve o município IBGE pela API da
 * SERPRO quando não vem `codigoMunicipioInformado`.
 */
async function montarComprador(
  admin: any, atendimentoId: string, ctx: RenaveLogCtx, codigoMunicipioInformado?: number,
): Promise<{ comprador?: any; error?: string }> {
  const { data: at } = await admin.from('atendimentos_motos')
    .select('id, cliente:clientes_fornecedores(nome_razao_social, cpf_cnpj, tipo_pessoa, email, clientes_fornecedores_enderecos(tipo, cep, logradouro, numero, bairro, complemento, cidade, uf))')
    .eq('id', atendimentoId).maybeSingle();
  const cli = (at as any)?.cliente;
  if (!cli?.cpf_cnpj) return { error: 'Comprador sem CPF/CNPJ no cadastro.' };
  // Endereço COMERCIAL (tipo='fiscal') — o cliente pode ter mais de uma
  // linha em clientes_fornecedores_enderecos; nunca confiar "na primeira".
  const enderecosCli = (cli.clientes_fornecedores_enderecos || []) as Array<{ tipo?: string }>;
  const end: any = enderecosCli.find((e) => e.tipo === 'fiscal') || enderecosCli[0] || {};

  let codigoMunicipio: number | undefined = codigoMunicipioInformado || undefined;
  if (!codigoMunicipio && end.cidade && end.uf) {
    const mun = await municipios(end.cidade, end.uf, ctx);
    const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const hit = Array.isArray(mun.body) ? mun.body.find((m: any) => norm(m.nome) === norm(end.cidade)) || mun.body[0] : null;
    if (hit?.id) codigoMunicipio = Number(hit.id);
  }
  if (!codigoMunicipio) return { error: 'Código IBGE do município do comprador não resolvido — informe codigo_municipio.' };

  const docDigits = String(cli.cpf_cnpj).replace(/\D/g, '');
  return {
    comprador: {
      tipoDocumento: docDigits.length > 11 ? 'CNPJ' : 'CPF',
      numeroDocumento: docDigits,
      nome: cli.nome_razao_social || undefined,
      email: cli.email || undefined,
      endereco: {
        codigoMunicipio,
        cep: end.cep ? String(end.cep).replace(/\D/g, '') : undefined,
        logradouro: end.logradouro || undefined,
        numero: end.numero || undefined,
        // SERPRO rejeita bairro com mais de 20 caracteres ("Bairro deve
        // conter no máximo 20 caracteres") — bairros do cadastro do
        // cliente costumam vir mais longos que isso.
        bairro: end.bairro ? String(end.bairro).slice(0, 20) : undefined,
        complemento: end.complemento || undefined,
      },
    },
  };
}

/**
 * Avaliação da moto SEMINOVA vendida num atendimento — mesmo caminho do
 * pós-venda: motos_interesse (estoque_moto_id, não 0km) -> estoque_motos.avaliacao_id.
 * É na avaliação que vive o estoque RENAVE da seminova (renave_id_estoque).
 */
async function avaliacaoDaVenda(admin: any, atendimentoId: string): Promise<string | null> {
  const { data: mi } = await admin.from('motos_interesse')
    .select('estoque_moto_id, estoque_tipo').eq('atendimento_id', atendimentoId)
    // `neq` sozinho descartaria estoque_tipo NULL (linhas antigas de seminova).
    .not('estoque_moto_id', 'is', null).or('estoque_tipo.is.null,estoque_tipo.neq.0km').limit(1).maybeSingle();
  if (!mi?.estoque_moto_id) return null;
  const { data: em } = await admin.from('estoque_motos').select('avaliacao_id').eq('id', mi.estoque_moto_id).maybeSingle();
  return em?.avaliacao_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const admin: any = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller }, error: authError } = await asUser.auth.getUser();
  if (authError || !caller) return json({ error: 'Unauthorized' }, 401);
  const { data: roleData } = await admin.from('user_roles')
    .select('app_role, nome').eq('user_id', caller.id).eq('projeto_id', BPM_PROJETO_ID).eq('ativo', true).maybeSingle();
  if (!roleData) return json({ error: 'Forbidden: usuário sem acesso a este sistema' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const acao: string = body.acao;

  try {
    if (acao === 'cliente') {
      // empresa_id opcional -- testa o certificado daquele CNPJ especifico em
      // vez do padrao (slot 1). Util pra diagnosticar 401 por CNPJ sem
      // depender do payload real de entrada/saida.
      const ctx: RenaveLogCtx = {
        admin, operacao: acao, usuarioId: caller.id,
        cnpjEstabelecimento: body.empresa_id ? await cnpjDaEmpresa(admin, body.empresa_id) : undefined,
      };
      const r = await clienteAutenticado(ctx);
      return json({ status: r.status, cliente: r.body });
    }

    if (acao === 'pendentes') {
      const ctx: RenaveLogCtx = { admin, operacao: acao, chassi: body.chassi, usuarioId: caller.id };
      const r = await pendentesEntrada(body.chassi, ctx);
      return json({ status: r.status, pendentes: r.body });
    }

    // ------ ENTRADA EM ESTOQUE 0KM (TEV) ------
    if (acao === 'entrada') {
      const emnId: string = body.estoque_moto_nova_id;
      if (!emnId) return json({ error: 'estoque_moto_nova_id é obrigatório' }, 400);

      const { data: emn } = await admin.from('estoque_motos_novas')
        .select('id, chassi, renave_id_estoque, empresa_id').eq('id', emnId).maybeSingle();
      if (!emn) return json({ error: 'Moto 0km não encontrada' }, 404);
      if (emn.renave_id_estoque) return json({ error: 'Este 0km já tem entrada no RENAVE (idEstoque ' + emn.renave_id_estoque + ')' }, 409);

      // NF-e de faturamento da montadora (operacao='compra', xml completo em xml_raw).
      let { data: nfCompra } = await admin.from('nfe_entradas')
        .select('id, chave_nfe, valor_total, xml_raw')
        .eq('estoque_moto_nova_id', emnId).eq('operacao', 'compra')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      // Fallback por chassi — achado real 2026-09-15: várias NF de montadora
      // chegam em nfe_entradas sem o vínculo estoque_moto_nova_id (o SisFin só
      // grava isso ao "liberar estoque" da NF; muitas nunca passaram por lá).
      // Casa pelo chassi exato no XML e só vincula se achar EXATAMENTE um
      // candidato — ambíguo ou nenhum mantém o erro de sempre.
      if (!nfCompra?.chave_nfe && emn.chassi) {
        const chassiNorm = String(emn.chassi).trim().toUpperCase();
        const { data: candidatos } = await admin.from('nfe_entradas')
          .select('id, chave_nfe, valor_total, xml_raw')
          .eq('operacao', 'compra').is('estoque_moto_nova_id', null)
          .ilike('xml_raw', `%${chassiNorm}%`)
          .order('created_at', { ascending: false });
        const exatos = ((candidatos as any[]) || []).filter((c) => {
          const ch = tag(String(c.xml_raw ?? ''), 'chassi') || tag(String(c.xml_raw ?? ''), 'cProd');
          return ch && String(ch).trim().toUpperCase() === chassiNorm;
        });
        if (exatos.length === 1) {
          nfCompra = exatos[0];
          await admin.from('nfe_entradas').update({ estoque_moto_nova_id: emnId })
            .eq('id', nfCompra.id).is('estoque_moto_nova_id', null);
        }
      }
      if (!nfCompra?.chave_nfe) return json({ error: 'NF-e de faturamento da montadora não encontrada para este 0km (nfe_entradas operacao=compra).' }, 409);

      const xml = String(nfCompra.xml_raw ?? '');
      const chassi = emn.chassi || tag(xml, 'chassi') || tag(xml, 'cProd');
      if (!chassi) return json({ error: 'Chassi não encontrado (nem no estoque nem no XML da NF).' }, 409);

      const valorCompra = Number(body.valor_compra ?? nfCompra.valor_total ?? tag(xml, 'vNF') ?? 0);
      if (!valorCompra) return json({ error: 'valorCompra não determinado.' }, 409);

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi, estoqueMotoNovaId: emnId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresa(admin, emn.empresa_id),
      };

      const r = await entrarEstoqueZeroKm({
        chassi: chassi.toUpperCase().replace(/\s/g, ''),
        chaveNotaFiscal: soChave(nfCompra.chave_nfe),
        valorCompra,
        dataEntradaEstoque: brasiliaNaiveIso(body.data_entrada_estoque),
        dataHoraMedicaoHodometro: brasiliaNaiveIso(body.data_hora_medicao_hodometro),
        quilometragemHodometro: Number.isFinite(Number(body.quilometragem_hodometro)) ? Number(body.quilometragem_hodometro) : 0,
        cpfOperadorResponsavel: body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : undefined,
      }, ctx);

      if (r.status !== 201 && r.status !== 200) {
        const msg = erroRenave(r);
        // Achado real 2026-09-15 (chassi 95V4F00AAPM000003): SERPRO recusa a
        // entrada dizendo que o chassi "possui um estoque ativo" — ou seja,
        // uma tentativa anterior nossa já criou o registro do lado da SERPRO,
        // mas a resposta nunca chegou a ser gravada aqui (renave_id_estoque
        // ficou null). Nesse caso específico, consulta os pendentes por
        // chassi pra tentar recuperar o idEstoque já existente e resincroniza
        // em vez de só devolver o erro de novo.
        if (/possui um estoque ativo/i.test(msg)) {
          const chassiUp = chassi.toUpperCase().replace(/\s/g, '');
          const p = await pendentesEntrada(chassiUp, ctx);
          const lista = Array.isArray(p.body) ? p.body : (Array.isArray(p.body?.content) ? p.body.content : []);
          let achado = lista.find((v: any) => String(v?.chassi ?? '').toUpperCase() === chassiUp)
            ?? (lista.length === 1 ? lista[0] : null);

          // "pendentes" só lista quem AINDA NÃO deu entrada -- por definição
          // nunca inclui um chassi com "estoque ativo" (achado real
          // 2026-09-15, chassi 95V4F00AAPM000003: pendentes sempre voltou []
          // nesse caso, o resync original nunca achava nada). Segunda
          // tentativa: consulta direta de veículo por chassi (catálogo #66,
          // não verificada -- só leitura, se falhar cai no erro de sempre).
          if (!achado) {
            try {
              const v = await consultarVeiculoPorChassi(chassiUp, ctx);
              const lv = Array.isArray(v.body) ? v.body
                : Array.isArray(v.body?.content) ? v.body.content
                : (v.body?.id || v.body?.idEstoque) ? [v.body] : [];
              achado = lv.find((x: any) => String(x?.chassi ?? '').toUpperCase() === chassiUp)
                ?? (lv.length === 1 ? lv[0] : null);
            } catch { /* best-effort -- endpoint não verificado */ }
          }

          const idRecuperado = achado?.id ?? achado?.idEstoque ?? null;
          if (idRecuperado) {
            await persistir(admin, emnId, {
              renave_id_estoque: idRecuperado,
              renave_estado: achado?.estado ?? null,
              renave_placa: achado?.placa ?? emn.renave_placa ?? null,
              renave_renavam: achado?.renavam ?? emn.renave_renavam ?? null,
              renave_ultimo_erro: null,
            });
            return json({ ok: true, resincronizado: true, estoque: achado });
          }

          // Nem pendentes nem a consulta de veículo acharam o idEstoque --
          // não dá pra resincronizar sozinho. Mensagem diferente da genérica
          // (que sugere "repita a operação", e vai falhar do mesmo jeito de
          // novo) pra deixar claro que precisa de checagem manual.
          const msgManual = `${msg} — resync automático não encontrou o idEstoque (nem em pendentes, nem na consulta de veículo); requer verificação manual junto à SERPRO/despachante.`;
          await persistir(admin, emnId, { renave_ultimo_erro: msgManual });
          return json({ error: msgManual, status: r.status, detalhe: r.body }, 422);
        }
        await persistir(admin, emnId, { renave_ultimo_erro: msg });
        return json({ error: msg, status: r.status, detalhe: r.body }, 422);
      }

      const est = r.body || {};
      await persistir(admin, emnId, {
        renave_id_estoque: est.id ?? null,
        renave_estado: est.estado ?? null,
        renave_renavam: est.renavam ?? null,
        renave_placa: est.placa ?? null,
        renave_numero_crv: est.numeroCrv ?? null,
        renave_tipo_crv: est.tipoCrv ?? null,
        renave_num_termo_entrada: est.entradaEstoque?.numeroTermoEntradaEstoque ?? null,
        renave_ultimo_erro: null,
      });

      // Vincula a NF de compra ao estoque (best-effort).
      if (est.id) {
        const nf = await enviarNotaFiscal(soChave(nfCompra.chave_nfe), 'COMPRA', est.id, ctx);
        if (nf.status >= 400) console.warn('renave notas-fiscais COMPRA:', erroRenave(nf));
      }

      return json({ ok: true, estoque: est });
    }

    // ------ ENTRADA EM ESTOQUE — MOTO SEMINOVA (veículo próprio) ------
    // Schema confirmado 2026-09-22 direto no OpenAPI da SERPRO (grupo
    // "Estabelecimento") e validado batendo o payload real em homologação —
    // ver renave.ts (EntradaVeiculoProprio). Diferente do 0km: não usa
    // chassi/chaveNotaFiscal/valorCompra no payload, usa dados do CRLV
    // (código de segurança + tipo). Ação separada da 'entrada' 0km porque a
    // resolução de CNPJ, a fonte de dados (avaliacoes, não
    // estoque_motos_novas) e o payload são todos diferentes.
    if (acao === 'entrada-usado') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);

      const { data: av } = await admin.from('avaliacoes')
        .select('id, atendimento_id, chassi, renavam, placa, numero_crv, codigo_seguranca_crv, tipo_crv, km, renave_id_estoque')
        .eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (av.renave_id_estoque) return json({ error: 'Esta moto já tem entrada no RENAVE (idEstoque ' + av.renave_id_estoque + ')' }, 409);
      if (!av.codigo_seguranca_crv || !av.tipo_crv) {
        return json({ error: 'Código de segurança do CRV e/ou tipo do CRV não cadastrados nesta avaliação.' }, 409);
      }

      // Documento do VENDEDOR (proprietário atual, ainda no CRV) — vem do
      // cliente do atendimento (quem está vendendo a moto pro estabelecimento).
      // Endpoint genérico exige isso e rejeita se for o próprio CNPJ do
      // estabelecimento (ver comentário em renave.ts sobre os 2 endpoints).
      const { data: atendimento } = av.atendimento_id
        ? await admin.from('atendimentos_motos').select('cliente_id').eq('id', av.atendimento_id).maybeSingle()
        : { data: null };
      const { data: vendedor } = atendimento?.cliente_id
        ? await admin.from('clientes_fornecedores').select('cpf_cnpj, tipo_pessoa, email').eq('id', atendimento.cliente_id).maybeSingle()
        : { data: null };
      if (!vendedor?.cpf_cnpj) {
        return json({ error: 'Cliente vendedor (CPF/CNPJ) não encontrado no atendimento — necessário pra declarar a entrada.' }, 409);
      }
      // Achado real 2026-09-23: a SERPRO rejeita a entrada sem e-mail do
      // vendedor ("E-mail do vendedor é obrigatório") — precisa estar
      // cadastrado no cliente do atendimento (quem está vendendo a moto).
      if (!vendedor.email) {
        return json({ error: 'Cliente vendedor sem e-mail cadastrado — a SERPRO exige e-mail do vendedor pra declarar a entrada. Complete o cadastro do cliente.' }, 409);
      }

      // Valor e data de compra — vêm da NF-e de compra já emitida (fonte
      // real da transação; não estimamos/inventamos pra um sistema federal).
      const { data: nfCompra } = await admin.from('nfe_entradas')
        .select('chave_nfe, data_emissao, valor_total').eq('avaliacao_id', avaliacaoId).eq('operacao', 'compra')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!nfCompra?.valor_total || !nfCompra?.data_emissao) {
        return json({ error: 'NF-e de compra não encontrada (ou sem valor/data) — emita a NF-e de compra antes de dar entrada no RENAVE.' }, 409);
      }

      const cpfOperador = body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : '';
      if (!cpfOperador) return json({ error: 'cpf_operador é obrigatório' }, 400);

      const quilometragem = Number.isFinite(Number(body.quilometragem_hodometro))
        ? Number(body.quilometragem_hodometro)
        : Number.isFinite(Number(av.km)) ? Number(av.km) : 0;

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };

      const payloadEntrada: EntradaEstoque = {
        cpfOperadorResponsavel: cpfOperador,
        dataCompra: brasiliaNaiveIso(nfCompra.data_emissao).slice(0, 10),
        valorCompra: Number(nfCompra.valor_total),
        emailVendedor: vendedor.email,
        emailEstabelecimento: EMAIL_ESTABELECIMENTO_PADRAO,
        veiculo: {
          codigoSegurancaCrv: String(av.codigo_seguranca_crv).replace(/\D/g, ''),
          dataHoraMedicaoHodometro: brasiliaNaiveIso(body.data_hora_medicao_hodometro),
          quilometragemHodometro: quilometragem,
          tipoCrv: av.tipo_crv,
          documentoProprietarioAtual: String(vendedor.cpf_cnpj).replace(/\D/g, ''),
          tipoDocumentoProprietarioAtual: vendedor.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF',
          numeroCrv: av.numero_crv ? String(av.numero_crv).replace(/\D/g, '') : undefined,
          placa: av.placa ? String(av.placa).toUpperCase().replace(/\s|-/g, '') : undefined,
          renavam: av.renavam ? String(av.renavam).replace(/\D/g, '') : undefined,
        },
      };
      let r = await entrarEstoque(payloadEntrada, ctx);

      // Achado real 2026-09-23 (placa JCC6E84): a SERPRO rejeita dataCompra
      // anterior à emissão do último CRV ("...do último CRV (16/07/2026)") --
      // acontece quando a NF de compra saiu antes do vendedor concluir a
      // transferência pra ele. Não temos a data do CRV guardada, então usa a
      // que a própria SERPRO devolve e repete a chamada uma vez.
      if (r.status !== 201 && r.status !== 200) {
        const m = erroRenave(r).match(/anterior à data de emissão do último CRV \((\d{2})\/(\d{2})\/(\d{4})\)/i);
        if (m) {
          const dataCrv = `${m[3]}-${m[2]}-${m[1]}`;
          if (dataCrv > payloadEntrada.dataCompra) {
            r = await entrarEstoque({ ...payloadEntrada, dataCompra: dataCrv }, ctx);
          }
        }
      }

      if (r.status !== 201 && r.status !== 200) {
        const msg = erroRenave(r);
        // Achado real 2026-09-22 (chassi 95VHA00AAHM000135): mesmo padrão já
        // visto no 0km ("possui um estoque ativo") -- a SERPRO recusa dizendo
        // que o veículo já está em estoque, mas nunca tivemos uma chamada de
        // entrada bem-sucedida registrada aqui (renave_id_estoque ficou
        // null). `consultarVeiculoPorChassi` (/api/veiculos) NÃO serve pra
        // recuperar nesse caso -- exige estoque já CONFIRMADO, rejeita com
        // "Veículo deve estar em estoque (CONFIRMADO)" pra SOLICITADO/
        // TRANSFERIDO (achado real, mesmo chassi). `listarEstoques`
        // (/api/estoques) é o certo -- lista o estoque do próprio
        // estabelecimento em qualquer estado.
        if (/já está em estoque|possui um estoque ativo/i.test(msg)) {
          const chassiUp = String(av.chassi).toUpperCase().replace(/\s/g, '');
          let achado: any = null;
          try {
            const le = await listarEstoques({ chassi: chassiUp }, ctx);
            const lista = Array.isArray(le.body) ? le.body : (Array.isArray(le.body?.content) ? le.body.content : []);
            achado = lista.find((x: any) => String(x?.chassi ?? '').toUpperCase() === chassiUp)
              ?? (lista.length === 1 ? lista[0] : null);
          } catch { /* best-effort */ }
          if (!achado) {
            try {
              const v = await consultarVeiculoPorChassi(chassiUp, ctx);
              const lv = Array.isArray(v.body) ? v.body
                : Array.isArray(v.body?.content) ? v.body.content
                : (v.body?.id || v.body?.idEstoque) ? [v.body] : [];
              achado = lv.find((x: any) => String(x?.chassi ?? '').toUpperCase() === chassiUp)
                ?? (lv.length === 1 ? lv[0] : null);
            } catch { /* best-effort -- só serve se já CONFIRMADO */ }
          }

          const idRecuperado = achado?.id ?? achado?.idEstoque ?? null;
          if (idRecuperado) {
            await persistirAvaliacao(admin, avaliacaoId, {
              renave_id_estoque: idRecuperado,
              renave_estado: achado?.estado ?? null,
              renave_num_termo_entrada: achado?.entradaEstoque?.numeroTermoEntradaEstoque ?? null,
              // numeroCrv já vem certo (sem máscara) nessa resposta -- backfill
              // aproveitando, já que o CRLV anexado pode ter esse campo mascarado.
              ...(achado?.numeroCrv ? { numero_crv: String(achado.numeroCrv).replace(/\D/g, '') } : {}),
              renave_ultimo_erro: null,
            });
            return json({ ok: true, resincronizado: true, estoque: achado });
          }

          const msgManual = `${msg} — resync automático não encontrou o idEstoque; requer verificação manual junto à SERPRO/despachante.`;
          await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: msgManual });
          return json({ error: msgManual, status: r.status, detalhe: r.body }, 422);
        }
        await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: msg });
        return json({ error: msg, status: r.status, detalhe: r.body }, 422);
      }

      const est = r.body || {};
      await persistirAvaliacao(admin, avaliacaoId, {
        renave_id_estoque: est.id ?? null,
        renave_estado: est.estado ?? null,
        renave_num_termo_entrada: est.entradaEstoque?.numeroTermoEntradaEstoque ?? null,
        renave_ultimo_erro: null,
      });

      // Vincula a NF-e de compra ao estoque — passo 4 (chave NF-e). A entrada
      // já foi confirmada acima; uma falha aqui não desfaz isso, só fica
      // registrada separadamente (renave_nf_vinculada_em) pra a tela não
      // assumir "feito" só porque o passo 2 deu certo (achado 2026-09-22:
      // essa chamada podia falhar silenciosamente, sem aparecer em lugar
      // nenhum além do log de renave_chamadas).
      let nfVinculada = false;
      if (est.id && nfCompra.chave_nfe) {
        const nf = await enviarNotaFiscal(soChave(nfCompra.chave_nfe), 'COMPRA', est.id, ctx);
        nfVinculada = nf.status < 400;
        if (!nfVinculada) {
          console.warn('renave notas-fiscais COMPRA (seminova):', erroRenave(nf));
          await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: `Entrada confirmada, mas vínculo da NF-e falhou: ${erroRenave(nf)}` });
        }
      }
      await persistirAvaliacao(admin, avaliacaoId, { renave_nf_vinculada_em: nfVinculada ? new Date().toISOString() : null });

      return json({ ok: true, estoque: est, nf_vinculada: nfVinculada });
    }

    // ------ ENTRADA DE SEMINOVA — PASSO 4: RETRY DO VÍNCULO DA NF-e ------
    // Se o vínculo automático (dentro do passo 2) falhar, essa ação deixa
    // tentar de novo sem precisar refazer a entrada inteira.
    if (acao === 'vincular-nf') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes').select('id, chassi, renave_id_estoque').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.renave_id_estoque) return json({ error: 'Esta moto ainda não tem entrada no RENAVE.' }, 409);

      const { data: nfCompra } = await admin.from('nfe_entradas')
        .select('chave_nfe').eq('avaliacao_id', avaliacaoId).eq('operacao', 'compra')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!nfCompra?.chave_nfe) return json({ error: 'NF-e de compra não encontrada.' }, 409);

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const nf = await enviarNotaFiscal(soChave(nfCompra.chave_nfe), 'COMPRA', av.renave_id_estoque, ctx);
      if (nf.status >= 400) {
        const msg = erroRenave(nf);
        await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: `Vínculo da NF-e falhou: ${msg}` });
        return json({ error: msg, status: nf.status, detalhe: nf.body }, 422);
      }
      await persistirAvaliacao(admin, avaliacaoId, { renave_nf_vinculada_em: new Date().toISOString(), renave_ultimo_erro: null });
      return json({ ok: true });
    }

    // ------ ENTRADA DE SEMINOVA — DOCUMENTO DO TERMO DE ENTRADA ------
    // A entrada (entrada-usado) só devolve numeroTermoEntradaEstoque (um
    // protocolo, sem PDF) -- o documento vem desse endpoint separado
    // (achado 2026-09-22, confirmado no OpenAPI oficial). Sobe pro storage e
    // grava o link, mesmo padrão do ATPV-e/CRLV-e.
    if (acao === 'termo-entrada-pdf') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes').select('id, chassi, renave_id_estoque, renave_atpv_assinatura_enviada_em').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.renave_id_estoque) return json({ error: 'Esta moto ainda não tem entrada no RENAVE.' }, 409);
      // Achado real 2026-09-22 (chassi 95VHA00AAHM000135): a SERPRO rejeita o
      // termo de entrada ("...estabelecimento ainda não enviou a assinatura
      // do ATPV...") até a assinatura (passo 3) ter sido enviada -- não basta
      // ter a entrada confirmada (passo 1).
      if (!av.renave_atpv_assinatura_enviada_em) {
        return json({ error: 'Envie a assinatura do ATPV (passo 3) antes de baixar o termo de entrada — a SERPRO exige isso primeiro.' }, 409);
      }

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const r = await termoEntradaEstoque(av.renave_id_estoque, ctx);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);

      const b64 = achaPdfBase64(r.body);
      if (!b64) return json({ error: 'A SERPRO não devolveu o PDF do termo de entrada nessa consulta.', detalhe: r.body }, 422);

      const patch: Record<string, unknown> = {};
      const bytes = Uint8Array.from(atob(b64), (c: string) => c.charCodeAt(0));
      const path = `renave/termo-entrada/TERMO ENTRADA - ${String(av.chassi || av.renave_id_estoque).toUpperCase()}.pdf`;
      const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (up.error) return json({ error: `Falha ao salvar o PDF: ${up.error.message}` }, 500);
      const { data: pub } = admin.storage.from('moto-fotos').getPublicUrl(path);
      patch.renave_termo_entrada_url = pub?.publicUrl ?? null;
      await persistirAvaliacao(admin, avaliacaoId, patch);
      return json({ ok: true, ...patch });
    }

    // ------ ENTRADA DE SEMINOVA — PASSO 2: DOWNLOAD DO ATPV-e ------
    // Baixa o ATPV-e em branco pra imprimir/assinar com o vendedor. Sobe pro
    // storage e grava o link em avaliacoes, mesmo padrão do fluxo de 0km
    // (estoque_motos_novas.renave_atpv_url).
    if (acao === 'atpv-pdf-usado') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes').select('id, chassi, renave_id_estoque').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.chassi) return json({ error: 'Avaliação sem chassi cadastrado' }, 400);
      // Achado real 2026-09-22 (chassi 95VHA00AAHM000135): a SERPRO rejeita o
      // download do ATPV-e ("Não existe intenção de venda disponível...")
      // antes da entrada -- a "intenção de venda" só existe depois que a
      // entrada (passo 1) cria ela como efeito colateral.
      if (!av.renave_id_estoque) {
        return json({ error: 'Dê entrada em estoque (passo anterior) antes de baixar o ATPV-e — a SERPRO exige a intenção de venda já criada, o que só acontece com a entrada confirmada.' }, 409);
      }

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const r = await pdfAtpvPorChassi(String(av.chassi).toUpperCase(), ctx);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);

      const patch: Record<string, unknown> = { renave_atpv_numero: r.body?.numeroAtpv ?? null };
      if (r.body?.pdfAtpvBase64) {
        const bytes = Uint8Array.from(atob(r.body.pdfAtpvBase64), (c: string) => c.charCodeAt(0));
        const path = `renave/atpv/ATPVE - ${String(av.chassi).toUpperCase()}.pdf`;
        const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (!up.error) {
          const { data: pub } = admin.storage.from('moto-fotos').getPublicUrl(path);
          patch.renave_atpv_url = pub?.publicUrl ?? null;
        }

        // O ATPV-e (gerado agora pela SERPRO) é a fonte do código de
        // segurança do CRV pra entrada em estoque — não o CRLV anexado, que
        // pode estar com um código já invalidado por uma reemissão posterior
        // (ver comentário em extrairCodigoSegurancaDoAtpv). Sobrescreve
        // sempre que a leitura funcionar; best-effort — falha na extração não
        // derruba o download do ATPV-e.
        const lido = await extrairCodigoSegurancaDoAtpv(r.body.pdfAtpvBase64);
        if (lido.codigoSegurancaCrv) patch.codigo_seguranca_crv = lido.codigoSegurancaCrv;
        if (lido.numeroCrv) patch.numero_crv = lido.numeroCrv;
      }
      await persistirAvaliacao(admin, avaliacaoId, patch);
      return json({ ok: true, ...patch });
    }

    // ------ ENTRADA DE SEMINOVA — PASSO 3: ATPV-e ASSINADO PELO VENDEDOR ------
    // É essa chamada que efetiva a transferência de propriedade no RENAVAM
    // pro CNPJ do estabelecimento — sem ela, o passo 3 (entrada-usado) é
    // rejeitado com "Proprietário do veículo deve ser um CNPJ ... diferente
    // do estabelecimento solicitante" (achado real 2026-09-23). Aceita 1 dos
    // 4 formatos da SERPRO (ver EnvioAssinaturaAtpv em renave.ts).
    if (acao === 'atpv-assinatura') {
      const avaliacaoId: string = body.avaliacao_id;
      const tipo: string = body.tipo;
      const arquivoBase64: string = body.arquivo_base64;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      if (!arquivoBase64) return json({ error: 'arquivo_base64 é obrigatório' }, 400);

      const MONTAR: Record<string, (b64: string) => Partial<EnvioAssinaturaAtpv>> = {
        proprio_punho_atpve: (b64) => ({ envioAssinaturaProprioPunhoAtpve: { fotoAtpveAssinadoDeProprioPunhoBase64: b64 } }),
        proprio_punho_papel_moeda: (b64) => ({ envioAssinaturaProprioPunhoAtpvPapelMoeda: { fotoAtpvPapelMoedaAssinadoBase64: b64 } }),
        qualificada_xml_atpve: (b64) => ({ envioAssinaturaQualificadaP7sSobreXmlAtpve: { assinaturaQualificadaP7sBase64: b64 } }),
        qualificada_foto_papel_moeda: (b64) => ({ envioAssinaturaQualificadaP7sSobreFotoAtpvPapelMoeda: { assinaturaQualificadaP7sBase64: b64 } }),
      };
      const montar = MONTAR[tipo];
      if (!montar) return json({ error: `tipo de assinatura inválido: ${tipo}` }, 400);

      const { data: av } = await admin.from('avaliacoes').select('id, chassi, renave_id_estoque').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      // Confirmado no manual oficial da SERPRO: a assinatura só é enviada
      // DEPOIS da entrada em estoque (idEstoque é obrigatório no payload).
      if (!av.renave_id_estoque) {
        return json({ error: 'Dê entrada em estoque (passo anterior) antes de enviar a assinatura — a SERPRO exige o idEstoque já existir.' }, 409);
      }

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const r = await enviarAssinaturaAtpv({
        idEstoque: av.renave_id_estoque,
        ...montar(arquivoBase64),
      }, ctx);
      if (r.status !== 200 && r.status !== 201) {
        await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: erroRenave(r) });
        return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);
      }

      // A assinatura só fica RECEBIDA aqui — a transferência de fato
      // (Solicitado -> Transferido -> Confirmado) é processada de forma
      // ASSÍNCRONA pelo Detran do lado da SERPRO (confirmado nos diagramas
      // oficiais do manual, achado 2026-09-23: transações 203/204 e 227 não
      // são disparadas na hora). Reconsulta o estoque já aqui pra refletir o
      // estado real se o Detran já tiver processado rápido — best-effort, não
      // falha a resposta se a consulta der erro ou ainda vier 'Solicitado'.
      // Consulta de status não entra no Histórico (renave_chamadas) -- não é
      // uma ação de negócio, só uma checagem interna; por isso ctx sem
      // `admin` aqui (registrarChamada só loga com admin presente).
      let estadoAtual: string | null = null;
      try {
        const consulta = await consultarEstoque(av.renave_id_estoque, { ...ctx, admin: undefined });
        if (consulta.status === 200) estadoAtual = consulta.body?.estado ?? null;
      } catch { /* best-effort */ }

      await persistirAvaliacao(admin, avaliacaoId, {
        renave_atpv_assinatura_enviada_em: new Date().toISOString(),
        ...(estadoAtual ? { renave_estado: estadoAtual } : {}),
        renave_ultimo_erro: null,
      });
      return json({ ok: true, estado: estadoAtual });
    }

    // ------ CONSULTAR ESTADO ATUAL DO ESTOQUE (polling manual) ------
    // O Detran processa a transferência de forma assíncrona depois da
    // assinatura (Solicitado -> Transferido -> Confirmado) — sem webhook, a
    // tela usa essa ação (botão de atualizar) pra reconsultar sob demanda.
    if (acao === 'estoque-status') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes').select('id, chassi, renave_id_estoque').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.renave_id_estoque) return json({ error: 'Esta moto ainda não tem entrada no RENAVE.' }, 409);

      // Não entra no Histórico (renave_chamadas) -- é uma checagem de status,
      // não uma ação de negócio, por isso ctx sem `admin` (ver comentário no
      // uso análogo dentro de atpv-assinatura).
      const ctx: RenaveLogCtx = {
        operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const r = await consultarEstoque(av.renave_id_estoque, ctx);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);

      await persistirAvaliacao(admin, avaliacaoId, { renave_estado: r.body?.estado ?? null });
      return json({ ok: true, estado: r.body?.estado ?? null, estoque: r.body });
    }

    // ------ CANCELAR ESTOQUE TRAVADO (recuperação manual) ------
    // Achado real 2026-09-22 (chassi 95VHA00AAHM000135): uma entrada pode
    // ficar órfã em SOLICITADO com a intenção de venda cancelada do lado da
    // SERPRO (fora dos estados 1/2 do ciclo de vida oficial) -- sem isso, o
    // ATPV-e nunca mais é obtido pra essa entrada. Cancela o estoque pra
    // permitir refazer do zero (gera intenção de venda nova).
    if (acao === 'cancelar-estoque') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes')
        .select('id, chassi, placa, renavam, numero_crv, codigo_seguranca_crv, renave_id_estoque').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.renave_id_estoque) return json({ error: 'Esta moto não tem entrada no RENAVE pra cancelar.' }, 409);
      // Achado real 2026-09-22: mesmo não estando documentado no OpenAPI
      // (só chassi/placa/renavam/numeroCrv listados no schema), a SERPRO
      // rejeita o cancelamento com 400 sem codigoSegurancaCrv.
      if (!av.codigo_seguranca_crv) {
        return json({ error: 'Código de segurança do CRV não cadastrado nesta avaliação — necessário pra cancelar o estoque.' }, 409);
      }

      // Achado real 2026-09-22: mesmo o schema do OpenAPI marcando
      // cpfOperadorResponsavel como opcional, a SERPRO rejeita em produção
      // sem ele ("CPF do operador responsável é obrigatório") -- na prática,
      // sempre exigir.
      const cpfOperador = body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : '';
      if (!cpfOperador) return json({ error: 'cpf_operador é obrigatório' }, 400);

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };

      // Achado real 2026-09-22: a SERPRO rejeitou com "Código de segurança do
      // CRV inválido" usando o código do CRLV atual (25165839948) -- porque a
      // entrada que estamos cancelando foi feita em 08/09 com um código
      // DIFERENTE (53950536180, tipoCrv VERDE), já visto na consulta de
      // resync. O CRV pode ter sido reemitido desde então (mesmo padrão do
      // achado da SXI9A07). Por isso consulta o estoque de novo aqui e usa o
      // codigoSegurancaCrv que está DE FATO registrado nessa entrada, em vez
      // do valor (possivelmente rotacionado) salvo na avaliação.
      const estoqueAtual = await consultarEstoque(av.renave_id_estoque, ctx);
      const codigoSegurancaCrvEstoque = estoqueAtual.status === 200 ? estoqueAtual.body?.codigoSegurancaCrv : null;
      const codigoSegurancaCrv = codigoSegurancaCrvEstoque
        ? String(codigoSegurancaCrvEstoque).replace(/\D/g, '')
        : String(av.codigo_seguranca_crv).replace(/\D/g, '');

      const r = await cancelarEstoque({
        dataCancelamentoEstoque: brasiliaNaiveIso().slice(0, 10),
        cpfOperadorResponsavel: cpfOperador,
        veiculo: {
          chassi: av.chassi ? String(av.chassi).toUpperCase().replace(/\s/g, '') : undefined,
          placa: av.placa ? String(av.placa).toUpperCase().replace(/\s|-/g, '') : undefined,
          renavam: av.renavam ? String(av.renavam).replace(/\D/g, '') : undefined,
          numeroCrv: av.numero_crv ? String(av.numero_crv).replace(/\D/g, '') : undefined,
          codigoSegurancaCrv,
        },
      }, ctx);
      if (r.status !== 201 && r.status !== 200) {
        const msg = erroRenave(r);
        await persistirAvaliacao(admin, avaliacaoId, { renave_ultimo_erro: `Cancelamento falhou: ${msg}` });
        return json({ error: msg, status: r.status, detalhe: r.body }, 422);
      }

      // Limpa o rastro RENAVE local -- a tela volta a mostrar a entrada como
      // não feita, pra refazer do zero com uma intenção de venda nova.
      await persistirAvaliacao(admin, avaliacaoId, {
        renave_id_estoque: null,
        renave_estado: null,
        renave_num_termo_entrada: null,
        renave_termo_entrada_url: null,
        renave_atpv_numero: null,
        renave_atpv_url: null,
        renave_atpv_assinatura_url: null,
        renave_atpv_assinatura_enviada_em: null,
        renave_nf_vinculada_em: null,
        renave_crlve_url: null,
        renave_ultimo_erro: null,
      });
      return json({ ok: true, estoque: r.body });
    }

    // ------ ENTRADA DE SEMINOVA — PASSO 5: DOWNLOAD DO CRLV-e ------
    // Documento já com a empresa como proprietária, depois da entrada
    // confirmada. Sobe pro storage e grava o link.
    if (acao === 'crlve') {
      const avaliacaoId: string = body.avaliacao_id;
      if (!avaliacaoId) return json({ error: 'avaliacao_id é obrigatório' }, 400);
      const { data: av } = await admin.from('avaliacoes').select('id, chassi, placa, renavam').eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.placa || !av.renavam) return json({ error: 'Placa e/ou RENAVAM não cadastrados' }, 400);

      const placa = String(av.placa).toUpperCase().replace(/\s|-/g, '');
      const renavam = String(av.renavam).replace(/\D/g, '');
      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      const r = await consultarCrlve(placa, renavam, ctx);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);

      const patch: Record<string, unknown> = {};
      if (r.body?.pdfBase64) {
        const bytes = Uint8Array.from(atob(r.body.pdfBase64), (c: string) => c.charCodeAt(0));
        const path = `renave/crlve/CRLVe - ${String(av.chassi || placa).toUpperCase()}.pdf`;
        const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (!up.error) {
          const { data: pub } = admin.storage.from('moto-fotos').getPublicUrl(path);
          patch.renave_crlve_url = pub?.publicUrl ?? null;
          await persistirAvaliacao(admin, avaliacaoId, patch);
        }
      }
      return json({ ok: true, ...patch });
    }

    // ------ SAÍDA DE ESTOQUE + ATPV-e (na venda) ------
    if (acao === 'saida') {
      const emnId: string = body.estoque_moto_nova_id;
      const atendimentoId: string = body.atendimento_id;
      if (!emnId || !atendimentoId) return json({ error: 'estoque_moto_nova_id e atendimento_id são obrigatórios' }, 400);

      const { data: emn } = await admin.from('estoque_motos_novas')
        .select('id, chassi, renave_id_estoque, renave_placa, renave_renavam, empresa_id').eq('id', emnId).maybeSingle();
      if (!emn?.renave_id_estoque) return json({ error: 'Este 0km ainda não tem entrada no RENAVE.' }, 409);

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: emn.chassi, estoqueMotoNovaId: emnId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresa(admin, emn.empresa_id),
      };

      // NF-e de venda 0km autorizada em produção.
      const { data: nfVenda } = await admin.from('nfe_entradas')
        .select('chave_nfe, valor_total, data_emissao')
        .eq('estoque_moto_nova_id', emnId).eq('operacao', 'venda_0km')
        .eq('status', 'processada').eq('ambiente', 'producao')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!nfVenda?.chave_nfe) return json({ error: 'NF-e de venda 0km autorizada em produção não encontrada.' }, 409);

      const { comprador, error: erroComprador } = await montarComprador(
        admin, atendimentoId, ctx, body.codigo_municipio ? Number(body.codigo_municipio) : undefined,
      );
      if (!comprador) return json({ error: erroComprador }, 409);

      const chaveVenda = soChave(nfVenda.chave_nfe);

      // Vincula a NF de venda ao estoque.
      const nfLink = await enviarNotaFiscal(chaveVenda, 'VENDA', emn.renave_id_estoque, ctx);
      if (nfLink.status >= 400) console.warn('renave notas-fiscais VENDA:', erroRenave(nfLink));

      const r = await sairEstoqueZeroKm({
        idEstoque: emn.renave_id_estoque,
        dataVenda: brasiliaNaiveIso(body.data_venda || nfVenda.data_emissao),
        valorVenda: Number(body.valor_venda ?? nfVenda.valor_total ?? 0),
        chaveNotaFiscal: chaveVenda,
        cpfOperadorResponsavel: body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : undefined,
        emailEstabelecimento: body.email_estabelecimento || EMAIL_ESTABELECIMENTO_PADRAO,
        comprador,
      }, ctx);
      if (r.status !== 200 && r.status !== 201) {
        await persistir(admin, emnId, { renave_ultimo_erro: erroRenave(r) });
        return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);
      }

      const est = r.body || {};
      const patch: Record<string, unknown> = {
        renave_estado: est.estado ?? null,
        renave_placa: est.placa ?? emn.renave_placa,
        renave_renavam: est.renavam ?? emn.renave_renavam,
        renave_num_termo_saida: est.saidaEstoque?.numeroTermoSaidaEstoque ?? null,
        renave_ultimo_erro: null,
      };

      // Busca o PDF do ATPV-e e guarda no storage.
      const pdf = await pdfAtpvPorChassi(String(emn.chassi).toUpperCase(), ctx);
      if (pdf.status === 200 && pdf.body?.pdfAtpvBase64) {
        const bytes = Uint8Array.from(atob(pdf.body.pdfAtpvBase64), (c) => c.charCodeAt(0));
        // Nome do arquivo com o chassi (não o uuid do estoque) — facilita achar
        // o PDF certo na hora do download.
        const path = `renave/atpv/ATPVE - ${String(emn.chassi).toUpperCase()}.pdf`;
        const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (!up.error) {
          const { data: pub } = admin.storage.from('moto-fotos').getPublicUrl(path);
          patch.renave_atpv_url = pub?.publicUrl ?? null;
        }
        patch.renave_atpv_numero = pdf.body.numeroAtpv ?? null;
      }
      await persistir(admin, emnId, patch);

      return json({ ok: true, estoque: est, atpv_numero: patch.renave_atpv_numero ?? null });
    }

    // ------ SAÍDA DE SEMINOVA (venda) — etapa "SAÍDA RENAVE" do Pós-Venda ------
    // Sequência (manual oficial, renave-ws/manual/solicitar-saida-estoque e
    // enviar-nota-fiscal-saida): 1 saída (/api/solicitacoes-saida-estoque,
    // exige estoque CONFIRMADO + NF de entrada + assinatura do ATPV da
    // entrada) -> 2 NF-e de venda (evento VENDA, "deve ser feito após a saída")
    // -> 3 ATPV-e da venda (intenção de venda sistêmica, dispensa assinaturas)
    // -> 4 termo de saída (opcional, em extinção). Todas recebem
    // `atendimento_id` (da venda) e acham a avaliação da moto por ele.
    if (String(acao || '').startsWith('saida-usado')) {
      const atendimentoId: string = body.atendimento_id;
      if (!atendimentoId) return json({ error: 'atendimento_id é obrigatório' }, 400);
      const avaliacaoId = await avaliacaoDaVenda(admin, atendimentoId);
      if (!avaliacaoId) return json({ error: 'Moto seminova desta venda não encontrada (sem avaliação vinculada ao estoque).' }, 404);

      const { data: av } = await admin.from('avaliacoes')
        .select('id, chassi, placa, renavam, renave_id_estoque, renave_estado, renave_nf_vinculada_em, renave_atpv_assinatura_enviada_em, renave_crlve_url, renave_saida_em, renave_saida_atendimento_id')
        .eq('id', avaliacaoId).maybeSingle();
      if (!av) return json({ error: 'Avaliação não encontrada' }, 404);
      if (!av.renave_id_estoque) {
        return json({ error: 'Esta moto não tem entrada no RENAVE — faça a entrada no Pós-Compra antes da saída.' }, 409);
      }

      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi: av.chassi, avaliacaoId, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresaPorAvaliacao(admin, avaliacaoId),
      };
      // Consultas de apoio (estado/CRLV-e) não entram no Histórico -- mesmo
      // critério do estoque-status (ctx sem `admin` não loga).
      const ctxSemLog: RenaveLogCtx = { ...ctx, admin: undefined };
      const placa = av.placa ? String(av.placa).toUpperCase().replace(/\s|-/g, '') : '';
      const renavam = av.renavam ? String(av.renavam).replace(/\D/g, '') : '';

      const nfVendaProducao = async () => {
        const { data } = await admin.from('nfe_entradas')
          .select('chave_nfe, valor_total, data_emissao')
          .eq('atendimento_id', atendimentoId).eq('operacao', 'venda_seminova')
          .eq('status', 'processada').eq('ambiente', 'producao')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data;
      };

      // ATPV-e da venda — gerado pela intenção de venda sistêmica da saída.
      // Arquivo separado do ATPV-e da entrada (mesma moto, documentos diferentes).
      const baixarAtpvVenda = async (): Promise<{ patch: Record<string, unknown>; error?: string }> => {
        const pdf = await pdfAtpvPorChassi(String(av.chassi).toUpperCase(), ctx);
        if (pdf.status !== 200) return { patch: {}, error: erroRenave(pdf) };
        const patch: Record<string, unknown> = { renave_saida_atpv_numero: pdf.body?.numeroAtpv ?? null };
        if (pdf.body?.pdfAtpvBase64) {
          const bytes = Uint8Array.from(atob(pdf.body.pdfAtpvBase64), (c: string) => c.charCodeAt(0));
          const path = `renave/atpv/ATPVE VENDA - ${String(av.chassi).toUpperCase()}.pdf`;
          const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
          if (!up.error) {
            const { data: pub } = admin.storage.from('moto-fotos').getPublicUrl(path);
            patch.renave_saida_atpv_url = pub?.publicUrl ?? null;
          }
        }
        return { patch };
      };

      if (acao === 'saida-usado') {
        if (av.renave_saida_em) return json({ error: 'A saída desta moto já foi registrada no RENAVE.' }, 409);
        if (!placa || !renavam) return json({ error: 'Placa e/ou RENAVAM não cadastrados na avaliação.' }, 409);
        const cpfOperador = body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : '';
        if (!cpfOperador) return json({ error: 'cpf_operador é obrigatório' }, 400);

        // Pré-requisitos da SERPRO (manual): NF de entrada e assinatura do ATPV
        // da entrada já enviadas, e estoque CONFIRMADO pelo Detran.
        if (!av.renave_nf_vinculada_em) return json({ error: 'A NF-e de compra ainda não foi vinculada à entrada no RENAVE — conclua a entrada no Pós-Compra.' }, 409);
        if (!av.renave_atpv_assinatura_enviada_em) return json({ error: 'A assinatura do ATPV da entrada ainda não foi enviada — conclua a entrada no Pós-Compra.' }, 409);
        let estado: string | null = av.renave_estado ?? null;
        try {
          const est = await consultarEstoque(av.renave_id_estoque, ctxSemLog);
          if (est.status === 200 && est.body?.estado) estado = est.body.estado;
        } catch { /* best-effort -- fica o estado salvo */ }
        if (estado && estado !== av.renave_estado) await persistirAvaliacao(admin, avaliacaoId, { renave_estado: estado });
        if (String(estado ?? '').toUpperCase() !== 'CONFIRMADO') {
          return json({ error: `A SERPRO só aceita a saída com o estoque CONFIRMADO pelo Detran (estado atual: ${estado || 'desconhecido'}).` }, 409);
        }

        const nfVenda = await nfVendaProducao();
        if (!nfVenda?.chave_nfe || !nfVenda.valor_total || !nfVenda.data_emissao) {
          return json({ error: 'NF-e de venda autorizada em produção não encontrada — emita a NF-e de venda antes da saída.' }, 409);
        }

        const { comprador, error: erroComprador } = await montarComprador(
          admin, atendimentoId, ctx, body.codigo_municipio ? Number(body.codigo_municipio) : undefined,
        );
        if (!comprador) return json({ error: erroComprador }, 409);

        // Código de segurança do CRV ATUAL: com o estoque CONFIRMADO o Detran
        // reemitiu o CRV no nome do estabelecimento -- o código salvo na
        // avaliação (do CRV do vendedor, usado na entrada) já não vale. A
        // SERPRO só devolve o código novo dentro do PDF pdfCodigoSegurancaCrvBase64
        // do CRLV-e; lê de lá (mesmo leitor usado no ATPV-e da entrada).
        const crlve = await consultarCrlve(placa, renavam, ctxSemLog);
        if (crlve.status !== 200) {
          const msg = `Falha ao consultar o CRLV-e atual (necessário pro código de segurança do CRV): ${erroRenave(crlve)}`;
          await persistirAvaliacao(admin, avaliacaoId, { renave_saida_ultimo_erro: msg });
          return json({ error: msg, status: crlve.status, detalhe: crlve.body }, 422);
        }
        const patchCrlve: Record<string, unknown> = {};
        if (crlve.body?.pdfBase64 && !av.renave_crlve_url) {
          const bytes = Uint8Array.from(atob(crlve.body.pdfBase64), (c: string) => c.charCodeAt(0));
          const path = `renave/crlve/CRLVe - ${String(av.chassi || placa).toUpperCase()}.pdf`;
          const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
          if (!up.error) patchCrlve.renave_crlve_url = admin.storage.from('moto-fotos').getPublicUrl(path).data?.publicUrl ?? null;
        }
        const lido = crlve.body?.pdfCodigoSegurancaCrvBase64
          ? await extrairCodigoSegurancaDoAtpv(crlve.body.pdfCodigoSegurancaCrvBase64, 'crv')
          : { codigoSegurancaCrv: null, numeroCrv: null };
        if (!lido.codigoSegurancaCrv) {
          const msg = 'Não foi possível ler o código de segurança do CRV atual no documento da SERPRO — tente novamente em instantes.';
          await persistirAvaliacao(admin, avaliacaoId, { ...patchCrlve, renave_saida_ultimo_erro: msg });
          return json({ error: msg }, 422);
        }

        const r = await sairEstoque({
          dataVenda: brasiliaNaiveIso(nfVenda.data_emissao).slice(0, 10),
          valorVenda: Number(nfVenda.valor_total),
          cpfOperadorResponsavel: cpfOperador,
          emailEstabelecimento: EMAIL_ESTABELECIMENTO_PADRAO,
          comprador,
          veiculo: {
            codigoSegurancaCrv: lido.codigoSegurancaCrv,
            // Só o número lido do CRV novo -- o da avaliação é do CRV do vendedor.
            numeroCrv: lido.numeroCrv ?? undefined,
            placa,
            renavam,
          },
        }, ctx);
        if (r.status !== 201 && r.status !== 200) {
          const msg = erroRenave(r);
          await persistirAvaliacao(admin, avaliacaoId, { ...patchCrlve, renave_saida_ultimo_erro: msg });
          return json({ error: msg, status: r.status, detalhe: r.body }, 422);
        }

        const est = r.body || {};
        const patch: Record<string, unknown> = {
          ...patchCrlve,
          renave_saida_em: new Date().toISOString(),
          renave_saida_atendimento_id: atendimentoId,
          renave_estado: est.estado ?? estado,
          renave_num_termo_saida: est.saidaEstoque?.numeroTermoSaidaEstoque ?? null,
          renave_saida_ultimo_erro: null,
        };

        // NF-e de venda (evento VENDA) — best-effort, a tela tem retry.
        const nf = await enviarNotaFiscal(soChave(nfVenda.chave_nfe), 'VENDA', av.renave_id_estoque, ctx);
        if (nf.status < 400) patch.renave_nf_venda_vinculada_em = new Date().toISOString();
        else console.warn('renave notas-fiscais VENDA (seminova):', erroRenave(nf));

        // ATPV-e da venda — best-effort, a tela tem retry.
        const atpv = await baixarAtpvVenda();
        Object.assign(patch, atpv.patch);
        if (atpv.error) console.warn('renave pdf-atpv (saída seminova):', atpv.error);

        await persistirAvaliacao(admin, avaliacaoId, patch);
        return json({ ok: true, estoque: est, atpv_numero: patch.renave_saida_atpv_numero ?? null });
      }

      // Daqui pra baixo: passos depois da saída (retry/documentos/cancelamento).
      if (!av.renave_saida_em) return json({ error: 'A saída desta moto ainda não foi registrada no RENAVE.' }, 409);

      if (acao === 'saida-usado-atpv') {
        const atpv = await baixarAtpvVenda();
        if (atpv.error) return json({ error: atpv.error }, 422);
        await persistirAvaliacao(admin, avaliacaoId, atpv.patch);
        return json({ ok: true, ...atpv.patch });
      }

      if (acao === 'saida-usado-nf') {
        const nfVenda = await nfVendaProducao();
        if (!nfVenda?.chave_nfe) return json({ error: 'NF-e de venda autorizada em produção não encontrada.' }, 409);
        const nf = await enviarNotaFiscal(soChave(nfVenda.chave_nfe), 'VENDA', av.renave_id_estoque, ctx);
        if (nf.status >= 400) {
          const msg = erroRenave(nf);
          await persistirAvaliacao(admin, avaliacaoId, { renave_saida_ultimo_erro: `Vínculo da NF-e de venda falhou: ${msg}` });
          return json({ error: msg, status: nf.status, detalhe: nf.body }, 422);
        }
        await persistirAvaliacao(admin, avaliacaoId, { renave_nf_venda_vinculada_em: new Date().toISOString(), renave_saida_ultimo_erro: null });
        return json({ ok: true });
      }

      if (acao === 'saida-usado-termo') {
        const r = await termoSaidaEstoque(av.renave_id_estoque, ctx);
        if (r.status !== 200) return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);
        const b64 = r.body?.pdfBase64 || achaPdfBase64(r.body);
        if (!b64) return json({ error: 'A SERPRO não devolveu o PDF do termo de saída nessa consulta.', detalhe: r.body }, 422);
        const bytes = Uint8Array.from(atob(b64), (c: string) => c.charCodeAt(0));
        const path = `renave/termo-saida/TERMO SAIDA - ${String(av.chassi || av.renave_id_estoque).toUpperCase()}.pdf`;
        const up = await admin.storage.from('moto-fotos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (up.error) return json({ error: `Falha ao salvar o PDF: ${up.error.message}` }, 500);
        const patch: Record<string, unknown> = {
          renave_termo_saida_url: admin.storage.from('moto-fotos').getPublicUrl(path).data?.publicUrl ?? null,
          ...(r.body?.numeroTermoSaidaEstoque ? { renave_num_termo_saida: r.body.numeroTermoSaidaEstoque } : {}),
        };
        await persistirAvaliacao(admin, avaliacaoId, patch);
        return json({ ok: true, ...patch });
      }

      // Cancelamento de saída (recuperação de saída indevida). Só enquanto o
      // Detran não transferiu pro comprador. A SERPRO gera um NOVO estoque
      // CONFIRMADO (novo idEstoque) -- troca o id salvo pra moto voltar a
      // ficar disponível pra uma saída nova.
      if (acao === 'saida-usado-cancelar') {
        const cpfOperador = body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : '';
        if (!cpfOperador) return json({ error: 'cpf_operador é obrigatório' }, 400);
        const r = await cancelarSaidaEstoque({
          idEstoque: av.renave_id_estoque,
          dataCancelamentoSaidaEstoque: brasiliaNaiveIso().slice(0, 10),
          cpfOperadorResponsavel: cpfOperador,
        }, ctx);
        if (r.status !== 201 && r.status !== 200) {
          const msg = erroRenave(r);
          await persistirAvaliacao(admin, avaliacaoId, { renave_saida_ultimo_erro: `Cancelamento da saída falhou: ${msg}` });
          return json({ error: msg, status: r.status, detalhe: r.body }, 422);
        }

        const b = r.body || {};
        let novoId: number | null = b.saidaEstoque?.cancelamentoSaidaEstoque?.idEstoqueGeradoNoCancelamentoSaida
          ?? (b.id && b.id !== av.renave_id_estoque ? b.id : null);
        if (!novoId && av.chassi) {
          // Resposta sem o id novo -- procura o estoque CONFIRMADO da moto.
          try {
            const le = await listarEstoques({ chassi: String(av.chassi).toUpperCase(), estadoEstoque: 'CONFIRMADO' }, ctxSemLog);
            const lista = Array.isArray(le.body) ? le.body : (Array.isArray(le.body?.content) ? le.body.content : []);
            novoId = lista.find((x: any) => x?.id && x.id !== av.renave_id_estoque)?.id ?? null;
          } catch { /* best-effort */ }
        }

        await persistirAvaliacao(admin, avaliacaoId, {
          renave_id_estoque: novoId ?? av.renave_id_estoque,
          renave_estado: 'CONFIRMADO',
          renave_saida_em: null,
          renave_saida_atendimento_id: null,
          renave_num_termo_saida: null,
          renave_termo_saida_url: null,
          renave_saida_atpv_numero: null,
          renave_saida_atpv_url: null,
          renave_nf_venda_vinculada_em: null,
          renave_saida_ultimo_erro: novoId ? null : 'Saída cancelada, mas o novo idEstoque gerado pela SERPRO não foi identificado — confira antes de uma nova saída.',
        });
        return json({ ok: true, novo_id_estoque: novoId, estoque: b });
      }

      return json({ error: `ação desconhecida: ${acao}` }, 400);
    }

    if (acao === 'atpv-pdf') {
      const chassi = String(body.chassi || '').toUpperCase();
      if (!chassi) return json({ error: 'chassi é obrigatório' }, 400);
      const { data: emnPdf } = await admin.from('estoque_motos_novas').select('empresa_id').eq('chassi', chassi).maybeSingle();
      const ctx: RenaveLogCtx = {
        admin, operacao: acao, chassi, usuarioId: caller.id,
        cnpjEstabelecimento: await cnpjDaEmpresa(admin, emnPdf?.empresa_id),
      };
      const r = await pdfAtpvPorChassi(chassi, ctx);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status }, 422);
      return json({ ok: true, atpv: r.body });
    }

    return json({ error: `ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
