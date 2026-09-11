// deno-lint-ignore-file no-explicit-any
// RENAVE (SERPRO) — entrada/saída de veículo 0km em estoque + ATPV-e.
// Ações: cliente | pendentes | entrada | saida | atpv-pdf
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  clienteAutenticado, pendentesEntrada, entrarEstoqueZeroKm, enviarNotaFiscal,
  consultarEstoque, municipios, sairEstoqueZeroKm, pdfAtpvPorChassi, erroRenave,
} from './renave.ts';

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

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

async function persistir(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from('estoque_motos_novas')
    .update({ ...patch, renave_atualizado_em: new Date().toISOString() })
    .eq('id', id);
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
      const r = await clienteAutenticado();
      return json({ status: r.status, cliente: r.body });
    }

    if (acao === 'pendentes') {
      const r = await pendentesEntrada(body.chassi);
      return json({ status: r.status, pendentes: r.body });
    }

    // ------ ENTRADA EM ESTOQUE 0KM (TEV) ------
    if (acao === 'entrada') {
      const emnId: string = body.estoque_moto_nova_id;
      if (!emnId) return json({ error: 'estoque_moto_nova_id é obrigatório' }, 400);

      const { data: emn } = await admin.from('estoque_motos_novas')
        .select('id, chassi, renave_id_estoque').eq('id', emnId).maybeSingle();
      if (!emn) return json({ error: 'Moto 0km não encontrada' }, 404);
      if (emn.renave_id_estoque) return json({ error: 'Este 0km já tem entrada no RENAVE (idEstoque ' + emn.renave_id_estoque + ')' }, 409);

      // NF-e de faturamento da montadora (operacao='compra', xml completo em xml_raw).
      const { data: nfCompra } = await admin.from('nfe_entradas')
        .select('chave_nfe, valor_total, xml_raw')
        .eq('estoque_moto_nova_id', emnId).eq('operacao', 'compra')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!nfCompra?.chave_nfe) return json({ error: 'NF-e de faturamento da montadora não encontrada para este 0km (nfe_entradas operacao=compra).' }, 409);

      const xml = String(nfCompra.xml_raw ?? '');
      const chassi = emn.chassi || tag(xml, 'chassi') || tag(xml, 'cProd');
      if (!chassi) return json({ error: 'Chassi não encontrado (nem no estoque nem no XML da NF).' }, 409);

      const valorCompra = Number(body.valor_compra ?? nfCompra.valor_total ?? tag(xml, 'vNF') ?? 0);
      if (!valorCompra) return json({ error: 'valorCompra não determinado.' }, 409);

      const agora = new Date().toISOString();
      const r = await entrarEstoqueZeroKm({
        chassi: chassi.toUpperCase().replace(/\s/g, ''),
        chaveNotaFiscal: soChave(nfCompra.chave_nfe),
        valorCompra,
        dataEntradaEstoque: body.data_entrada_estoque || agora,
        dataHoraMedicaoHodometro: body.data_hora_medicao_hodometro || agora,
        quilometragemHodometro: Number.isFinite(Number(body.quilometragem_hodometro)) ? Number(body.quilometragem_hodometro) : 0,
        cpfOperadorResponsavel: body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : undefined,
      });

      if (r.status !== 201 && r.status !== 200) {
        await persistir(admin, emnId, { renave_ultimo_erro: erroRenave(r) });
        return json({ error: erroRenave(r), status: r.status, detalhe: r.body }, 422);
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
        const nf = await enviarNotaFiscal(soChave(nfCompra.chave_nfe), 'COMPRA', est.id);
        if (nf.status >= 400) console.warn('renave notas-fiscais COMPRA:', erroRenave(nf));
      }

      return json({ ok: true, estoque: est });
    }

    // ------ SAÍDA DE ESTOQUE + ATPV-e (na venda) ------
    if (acao === 'saida') {
      const emnId: string = body.estoque_moto_nova_id;
      const atendimentoId: string = body.atendimento_id;
      if (!emnId || !atendimentoId) return json({ error: 'estoque_moto_nova_id e atendimento_id são obrigatórios' }, 400);

      const { data: emn } = await admin.from('estoque_motos_novas')
        .select('id, chassi, renave_id_estoque, renave_placa, renave_renavam').eq('id', emnId).maybeSingle();
      if (!emn?.renave_id_estoque) return json({ error: 'Este 0km ainda não tem entrada no RENAVE.' }, 409);

      // NF-e de venda 0km autorizada em produção.
      const { data: nfVenda } = await admin.from('nfe_entradas')
        .select('chave_nfe, valor_total, data_emissao')
        .eq('estoque_moto_nova_id', emnId).eq('operacao', 'venda_0km')
        .eq('status', 'processada').eq('ambiente', 'producao')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!nfVenda?.chave_nfe) return json({ error: 'NF-e de venda 0km autorizada em produção não encontrada.' }, 409);

      const { data: at } = await admin.from('atendimentos_motos')
        .select('id, cliente:clientes_fornecedores(nome_razao_social, cpf_cnpj, tipo_pessoa, email, clientes_fornecedores_enderecos(tipo, cep, logradouro, numero, bairro, complemento, cidade, uf))')
        .eq('id', atendimentoId).maybeSingle();
      const cli = (at as any)?.cliente;
      if (!cli?.cpf_cnpj) return json({ error: 'Comprador sem CPF/CNPJ no cadastro.' }, 409);
      // Endereço COMERCIAL (tipo='fiscal') — o cliente pode ter mais de uma
      // linha em clientes_fornecedores_enderecos; nunca confiar "na primeira".
      const enderecosCli = (cli.clientes_fornecedores_enderecos || []) as Array<{ tipo?: string }>;
      const end = enderecosCli.find((e) => e.tipo === 'fiscal') || enderecosCli[0] || {};

      let codigoMunicipio: number | undefined = body.codigo_municipio ? Number(body.codigo_municipio) : undefined;
      if (!codigoMunicipio && end.cidade && end.uf) {
        const mun = await municipios(end.cidade, end.uf);
        const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const hit = Array.isArray(mun.body) ? mun.body.find((m: any) => norm(m.nome) === norm(end.cidade)) || mun.body[0] : null;
        if (hit?.id) codigoMunicipio = Number(hit.id);
      }
      if (!codigoMunicipio) return json({ error: 'Código IBGE do município do comprador não resolvido — informe codigo_municipio.' }, 409);

      const docDigits = String(cli.cpf_cnpj).replace(/\D/g, '');
      const chaveVenda = soChave(nfVenda.chave_nfe);

      // Vincula a NF de venda ao estoque.
      const nfLink = await enviarNotaFiscal(chaveVenda, 'VENDA', emn.renave_id_estoque);
      if (nfLink.status >= 400) console.warn('renave notas-fiscais VENDA:', erroRenave(nfLink));

      const r = await sairEstoqueZeroKm({
        idEstoque: emn.renave_id_estoque,
        dataVenda: body.data_venda || nfVenda.data_emissao || new Date().toISOString(),
        valorVenda: Number(body.valor_venda ?? nfVenda.valor_total ?? 0),
        chaveNotaFiscal: chaveVenda,
        cpfOperadorResponsavel: body.cpf_operador ? String(body.cpf_operador).replace(/\D/g, '') : undefined,
        emailEstabelecimento: body.email_estabelecimento || undefined,
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
            bairro: end.bairro || undefined,
            complemento: end.complemento || undefined,
          },
        },
      });
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
      const pdf = await pdfAtpvPorChassi(String(emn.chassi).toUpperCase());
      if (pdf.status === 200 && pdf.body?.pdfAtpvBase64) {
        const bytes = Uint8Array.from(atob(pdf.body.pdfAtpvBase64), (c) => c.charCodeAt(0));
        const path = `renave/atpv/${emnId}.pdf`;
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

    if (acao === 'atpv-pdf') {
      const chassi = String(body.chassi || '').toUpperCase();
      if (!chassi) return json({ error: 'chassi é obrigatório' }, 400);
      const r = await pdfAtpvPorChassi(chassi);
      if (r.status !== 200) return json({ error: erroRenave(r), status: r.status }, 422);
      return json({ ok: true, atpv: r.body });
    }

    return json({ error: `ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
