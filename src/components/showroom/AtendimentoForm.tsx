import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, SendHorizonal, CheckCircle, Briefcase, User, ClipboardList } from 'lucide-react';
import { LOJAS, INTERESSES, TEMPERATURAS, ORIGENS, UFS, TIPOS_ATENDIMENTO, SEXOS } from '@/types/crm';
import type { Interesse, SituacaoShowroom } from '@/types/crm';
import MotoVendaSection from './MotoVendaSection';
import MotoCompraSection from './MotoCompraSection';
import { useMarcasModelos } from '@/hooks/useMarcasModelos';
import { toast } from 'sonner';
import { cn, formatPersonName, firstLastName } from '@/lib/utils';
import { empresaCompraDireta } from '@/lib/tipoAquisicao';

// Phone mask utility
const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const unformatPhone = (value: string): string => value.replace(/\D/g, '');

const LOJA_GROUPS: Record<'299' | 'Ducati', string[]> = {
  '299': ['299i', '299s', '299f', '299p', 'Aventura'],
  Ducati: ['Ducati BSB', 'Ducati FLN', 'Ducati POA'],
};

const lojaUnidadeLabel = (loja: string): string =>
  loja.startsWith('Ducati ') ? loja.replace('Ducati ', '') : loja;

const BPM_PROJETO_ID = 'd007a2c2-7576-4a60-ba1b-c506a9c4fcac';

interface Props {
  atendimentoId: string | null;
  onClose: () => void;
}

const AtendimentoForm: React.FC<Props> = ({ atendimentoId, onClose }) => {
  const { user, userName, lojaPrincipal, ufPrincipal } = useAuth();
  const isEditing = !!atendimentoId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [searchingPhone, setSearchingPhone] = useState(false);
  const [clientFound, setClientFound] = useState<boolean | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);

  // form state
  const [loja, setLoja] = useState('');
  const [lojaOriginal, setLojaOriginal] = useState('');
  const [lojaIdOriginal, setLojaIdOriginal] = useState('');
  const [lojaGroup, setLojaGroup] = useState<'299' | 'Ducati' | ''>('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [telefone, setTelefone] = useState('');
  const [sexo, setSexo] = useState('');
  const [uf, setUf] = useState('');
  const [tipoAtendimento, setTipoAtendimento] = useState('');
  const [origem, setOrigem] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [interesse, setInteresse] = useState<Interesse>('comprar');
  const [situacao, setSituacao] = useState<SituacaoShowroom>('em_aberto');

  const isDucati = loja.toLowerCase().startsWith('ducati');

  const detectedLojaGroup: '299' | 'Ducati' | '' =
    LOJA_GROUPS['299'].includes(loja) ? '299' :
    LOJA_GROUPS.Ducati.includes(loja) ? 'Ducati' : '';
  const lojaDisplayGroup = detectedLojaGroup || lojaGroup;
  const originalLojaGroup: '299' | 'Ducati' | '' =
    LOJA_GROUPS['299'].includes(lojaOriginal) ? '299' :
    LOJA_GROUPS.Ducati.includes(lojaOriginal) ? 'Ducati' : '';
  const lojaGroupLocked = isEditing && (situacao === 'sinal' || situacao === 'vendido') && !!originalLojaGroup;

  // Lojas ativas (sistema 'motos'); null enquanto carrega
  const [lojasAtivas, setLojasAtivas] = useState<Set<string> | null>(null);
  const [lojaIdMap, setLojaIdMap] = useState<Map<string, string>>(new Map());

  // Empresa <-> loja (bidirecional): loja escolhida define a empresa; empresa escolhida filtra as lojas.
  const [empresaId, setEmpresaId] = useState('');
  const [lojaEmpresaMap, setLojaEmpresaMap] = useState<Map<string, string>>(new Map());
  const [empresaLojasMap, setEmpresaLojasMap] = useState<Map<string, Set<string>>>(new Map());
  const [empresasList, setEmpresasList] = useState<{ id: string; nome: string; razao_social: string | null; cnpj: string | null }[]>([]);

  useEffect(() => {
    supabase
      .from('loja_empresas')
      .select('id, loja, empresa_id, empresas:empresa_id(id, nome, razao_social, cnpj)')
      .eq('sistema', 'motos')
      .eq('ativo', true)
      .then(({ data }) => {
        const rows = (data || []) as any[];
        setLojasAtivas(new Set(rows.map(r => r.loja)));
        setLojaIdMap(new Map(rows.map(r => [r.loja, r.id])));
        setLojaEmpresaMap(new Map(rows.filter(r => r.empresa_id).map(r => [r.loja, r.empresa_id])));

        const empLojas = new Map<string, Set<string>>();
        const empInfo = new Map<string, any>();
        for (const r of rows) {
          if (!r.empresa_id) continue;
          if (!empLojas.has(r.empresa_id)) empLojas.set(r.empresa_id, new Set());
          empLojas.get(r.empresa_id)!.add(r.loja);
          if (r.empresas && !empInfo.has(r.empresa_id)) empInfo.set(r.empresa_id, r.empresas);
        }
        setEmpresaLojasMap(empLojas);
        setEmpresasList(
          [...empInfo.values()].sort((a, b) =>
            (a.razao_social || a.nome).localeCompare(b.razao_social || b.nome, 'pt-BR'),
          ),
        );
      });
  }, []);

  // Loja escolhida -> empresa correspondente (loja_empresas.id = atendimento.loja_id -> empresa_id).
  useEffect(() => {
    if (!loja) return;
    const emp = lojaEmpresaMap.get(loja);
    if (emp && emp !== empresaId) setEmpresaId(emp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loja, lojaEmpresaMap]);

  // Empresa não faz compra direta -> sem "vender" no interesse.
  const permiteVender = empresaCompraDireta(empresaId);
  useEffect(() => {
    if (!permiteVender && interesse === 'vender') setInteresse('comprar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permiteVender, interesse]);

  // Grupos (299 / Ducati) que têm ao menos uma loja da empresa selecionada.
  const gruposDisponiveis = (['299', 'Ducati'] as const).filter(g => {
    if (!empresaId) return true;
    const lojasDaEmp = empresaLojasMap.get(empresaId);
    return !lojasDaEmp || LOJA_GROUPS[g].some(l => lojasDaEmp.has(l));
  });

  const handleEmpresaChange = (v: string) => {
    if (lojaGroupLocked) {
      const lojasDaEmp = empresaLojasMap.get(v);
      if (lojasDaEmp && originalLojaGroup && !LOJA_GROUPS[originalLojaGroup].some(l => lojasDaEmp.has(l))) {
        toast.error('Atendimentos com Sinal ou Vendido não podem trocar entre 299 e Ducati. Marque o atendimento como perdido primeiro.');
        return;
      }
    }
    setEmpresaId(v);
    const lojasDaEmp = empresaLojasMap.get(v);
    if (loja && lojasDaEmp && !lojasDaEmp.has(loja)) {
      setLoja('');
      if (lojaGroup && !LOJA_GROUPS[lojaGroup]?.some(l => lojasDaEmp.has(l))) setLojaGroup('');
    }
  };

  // Mantem a loja atual visivel mesmo se foi desativada depois (edicao).
  // Se há empresa selecionada, só mostra as lojas dessa empresa.
  const unidadeOptions = (group: '299' | 'Ducati') => {
    const all = LOJA_GROUPS[group];
    let opts = lojasAtivas ? all.filter(l => lojasAtivas.has(l) || l === loja) : all;
    if (empresaId) {
      const lojasDaEmp = empresaLojasMap.get(empresaId);
      if (lojasDaEmp) opts = opts.filter(l => lojasDaEmp.has(l) || l === loja);
    }
    return opts;
  };

  const unidadeInnerRef = useRef<HTMLDivElement>(null);
  const [unidadeWidth, setUnidadeWidth] = useState(0);

  useLayoutEffect(() => {
    if (unidadeInnerRef.current) {
      setUnidadeWidth(unidadeInnerRef.current.scrollWidth);
    }
  }, [lojaDisplayGroup, lojasAtivas]);

  useEffect(() => {
    if (!isEditing && lojaPrincipal && !loja) {
      setLoja(lojaPrincipal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, lojaPrincipal]);

  // Loja/empresa default do usuário, direto de user_roles.loja_id (novo atendimento).
  const [defaultLoja, setDefaultLoja] = useState<{ loja: string; empresa_id: string | null } | null>(null);
  useEffect(() => {
    if (isEditing || !user?.id) return;
    supabase
      .from('user_roles')
      .select('loja_id')
      .eq('user_id', user.id)
      .eq('projeto_id', BPM_PROJETO_ID)
      .eq('ativo', true)
      .maybeSingle()
      .then(async ({ data }) => {
        const lid = (data as any)?.loja_id;
        if (!lid) return;
        const { data: le } = await supabase
          .from('loja_empresas')
          .select('loja, empresa_id')
          .eq('id', lid)
          .maybeSingle();
        if ((le as any)?.loja) {
          setDefaultLoja({ loja: (le as any).loja, empresa_id: (le as any).empresa_id ?? null });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, user?.id]);

  useEffect(() => {
    if (isEditing || !defaultLoja) return;
    setLoja(prev => prev || defaultLoja.loja);
    if (defaultLoja.empresa_id) setEmpresaId(prev => prev || defaultLoja.empresa_id!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, defaultLoja]);

  // Default de UF: apenas sugestao inicial (loja_id -> loja_empresas -> empresas.uf),
  // o usuario pode trocar livremente a qualquer momento.
  useEffect(() => {
    if (!isEditing && ufPrincipal && !uf) {
      setUf(ufPrincipal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, ufPrincipal]);

  const { marcaIdByNome } = useMarcasModelos();

  // compra
  const [origemMoto, setOrigemMoto] = useState('estoque');
  const [compraMarcaId, setCompraMarcaId] = useState('');
  const [compraModeloId, setCompraModeloId] = useState('');
  const [compraAno, setCompraAno] = useState('');
  const [estoqueMotoId, setEstoqueMotoId] = useState('');
  const [estoqueTipo, setEstoqueTipo] = useState('');
  const [chassi, setChassi] = useState('');

  // venda
  const [vendaMarcaId, setVendaMarcaId] = useState('');
  const [vendaModeloId, setVendaModeloId] = useState('');
  const [vendaAnoFab, setVendaAnoFab] = useState('');
  const [vendaAnoMod, setVendaAnoMod] = useState('');
  const [vendaCategoria, setVendaCategoria] = useState('');
  const [vendaCor, setVendaCor] = useState('');
  const [vendaPlaca, setVendaPlaca] = useState('');
  const [vendaKm, setVendaKm] = useState('');
  const [vendaCilindrada, setVendaCilindrada] = useState('');
  const [vendaObs, setVendaObs] = useState('');
  const [temManual, setTemManual] = useState('');
  const [temChaveReserva, setTemChaveReserva] = useState('');
  const [manutencaoEmDia, setManutencaoEmDia] = useState('');
  const [motoAvaliacaoId, setMotoAvaliacaoId] = useState<string | null>(null);
  const [vendaCrlvUrl, setVendaCrlvUrl] = useState<string | null>(null);
  const [enviadaAvaliacao, setEnviadaAvaliacao] = useState(false);
  const [vendedorId, setVendedorId] = useState<string>('');
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  // Vendedores habilitados no projeto BPM, nome (primeiro + sobrenome) em ordem alfabética.
  useEffect(() => {
    supabase
      .from('user_roles')
      .select('user_id, nome')
      .eq('projeto_id', BPM_PROJETO_ID)
      .eq('ativo', true)
      .then(({ data }) => {
        const porId = new Map<string, string>();
        (data || []).forEach((r) => {
          if (r.user_id && !porId.has(r.user_id)) porId.set(r.user_id, r.nome || '');
        });
        setVendedores(
          [...porId.entries()]
            .map(([id, nome]) => ({ id, nome: firstLastName(nome) }))
            .filter((v) => v.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        );
      });
  }, []);

  // Ao criar, o vendedor é o usuário atual.
  useEffect(() => {
    if (!isEditing && user?.id) setVendedorId(user.id);
  }, [isEditing, user?.id]);

  useEffect(() => {
    if (!atendimentoId) return;
    const load = async () => {
      try {
        const { data: at } = await supabase.from('atendimentos_motos').select('*, loja_empresas:loja_id(loja), cliente:clientes_fornecedores(*, clientes_fornecedores_enderecos(*))').eq('id', atendimentoId).single();
        if (at) {
          const atLoja = at.loja_empresas?.loja || '';
          setLoja(atLoja);
          setLojaOriginal(atLoja);
          setLojaIdOriginal(at.loja_id);
          setEmpresaId((at as any).empresa_id || '');
          setVendedorId(at.vendedor_id || '');
          setClienteId(at.cliente_id);
          setNomeCliente(at.cliente?.nome_razao_social || '');
          setTelefone(formatPhone(at.cliente?.telefone || ''));
          setSexo(at.cliente?.sexo || '');
          setUf(at.cliente?.clientes_fornecedores_enderecos?.[0]?.uf || 'DF');
          setTipoAtendimento(at.tipo_atendimento);
          setOrigem(at.origem || '');
          setTemperatura(at.temperatura || '');
          setInteresse(at.interesse as Interesse);
          setSituacao(at.situacao as SituacaoShowroom);
        }
        if (at?.interesse === 'comprar' || at?.interesse === 'trocar') {
          const { data: mi } = await supabase.from('motos_interesse').select('*').eq('atendimento_id', atendimentoId).maybeSingle();
          if (mi) {
            setOrigemMoto(mi.origem);
            setCompraMarcaId((mi as any).marca_id || '');
            setCompraModeloId((mi as any).modelo_id || '');
            setCompraAno(mi.ano || '');
            setEstoqueMotoId(mi.estoque_moto_id || '');
            setEstoqueTipo((mi as any).estoque_tipo || '');
            setChassi((mi as any).chassi || '');
          }
        }
        if (at?.interesse === 'vender' || at?.interesse === 'trocar') {
          const { data: ma } = await supabase.from('avaliacoes').select('*').eq('atendimento_id', atendimentoId).maybeSingle();
          if (ma) {
            setMotoAvaliacaoId(ma.id);
            setVendaMarcaId((ma as any).marca_id || '');
            setVendaModeloId((ma as any).modelo_id || '');
            setVendaAnoFab(ma.ano_fabricacao || '');
            setVendaAnoMod(ma.ano_modelo || '');
            setVendaCategoria(ma.categoria || '');
            setVendaCor(ma.cor || '');
            setVendaPlaca(ma.placa || '');
            setVendaKm(ma.km || '');
            setVendaCilindrada((ma as any).cilindrada || '');
            setVendaObs(ma.observacoes || '');
            setTemManual((ma as any).tem_manual ? 'sim' : (ma as any).tem_manual === false ? 'nao' : '');
            setTemChaveReserva((ma as any).tem_chave_reserva ? 'sim' : (ma as any).tem_chave_reserva === false ? 'nao' : '');
            setManutencaoEmDia((ma as any).manutencao_vencida ? 'sim' : (ma as any).manutencao_vencida === false ? 'nao' : '');
            setEnviadaAvaliacao(ma.enviada_avaliacao || false);
            setVendaCrlvUrl((ma as any).crlv_url || null);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar atendimento:', err);
        toast.error('Erro ao carregar atendimento');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [atendimentoId]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setTelefone(formatted);
    setClientFound(null);
    // Auto-search when phone reaches 11 digits (only for new atendimentos)
    const digits = unformatPhone(formatted);
    if (digits.length === 11 && !isEditing) {
      // Trigger search after state update
      setTimeout(() => searchClientByPhoneDigits(digits), 100);
    }
  };

  const searchClientByPhoneDigits = useCallback(async (digits: string) => {
    if (digits.length !== 11) return;

    setSearchingPhone(true);
    try {
      const { data } = await supabase
        .from('clientes_fornecedores')
        .select('id, nome_razao_social, sexo, clientes_fornecedores_enderecos(uf)')
        .eq('telefone', digits)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setClienteId(data.id);
        setNomeCliente(data.nome_razao_social);
        setSexo(data.sexo || '');
        setUf(data.clientes_fornecedores_enderecos?.[0]?.uf || ufPrincipal || '');
        setClientFound(true);
      } else {
        setClienteId(null);
        setNomeCliente('');
        setSexo('');
        setUf(ufPrincipal || '');
        setClientFound(false);
      }
    } catch (err) {
      console.error('Erro ao buscar cliente:', err);
    } finally {
      setSearchingPhone(false);
    }
  }, [ufPrincipal]);


  const isPhoneValid = unformatPhone(telefone).length === 11;

  const handleSave = async () => {
    if (!nomeCliente.trim() || !isPhoneValid || !empresaId || !loja || !sexo || !uf || !tipoAtendimento || !origem || !temperatura) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (isEditing && (situacao === 'sinal' || situacao === 'vendido') && lojaOriginal) {
      const is299 = (l: string) => ['299i', '299s', '299f', '299p', 'Aventura'].includes(l);
      const isDuc = (l: string) => l.toLowerCase().startsWith('ducati');
      if ((is299(lojaOriginal) && isDuc(loja)) || (isDuc(lojaOriginal) && is299(loja))) {
        toast.error('Atendimentos com Sinal ou Vendido não podem trocar entre 299 e Ducati. Marque o atendimento como perdido primeiro.');
        return;
      }
    }
    if (nomeCliente.trim().split(/\s+/).length < 2) {
      toast.error('Informe o nome completo do cliente (nome e sobrenome)');
      return;
    }
    if (!permiteVender && interesse === 'vender') {
      toast.error('Esta empresa não faz compra direta de moto. O interesse deve ser "comprar" ou "trocar".');
      return;
    }
    if (isDucati && (interesse === 'comprar' || interesse === 'trocar') && (!compraModeloId || !compraAno)) {
      toast.error('Preencha o modelo e ano da moto Ducati');
      return;
    }
    if (isDucati && (interesse === 'comprar' || interesse === 'trocar') && chassi.replace(/\s/g, '').length > 0 && (chassi.replace(/\s/g, '').length < 6 || chassi.replace(/\s/g, '').length > 17)) {
      toast.error('O chassi deve ter entre 6 e 17 caracteres');
      return;
    }
    if (!isDucati && (interesse === 'comprar' || interesse === 'trocar') && origemMoto === 'externo' && (!compraMarcaId || !compraModeloId || !compraAno)) {
      toast.error('Preencha todos os campos da Moto de Interesse');
      return;
    }
    if ((interesse === 'vender' || interesse === 'trocar') && (!vendaMarcaId || !vendaModeloId || !vendaAnoFab || !vendaAnoMod || !vendaCategoria || !vendaCor || !vendaPlaca.trim() || !vendaKm.trim() || !vendaCilindrada.trim())) {
      toast.error('Preencha todos os campos da Moto do Cliente');
      return;
    }
    if ((interesse === 'vender' || interesse === 'trocar') && (!temManual || !temChaveReserva || !manutencaoEmDia)) {
      toast.error('Informe Manual, Chave Reserva e Revisão Vencida');
      return;
    }
    // Placa fora do padrao (7 caracteres / formato) nao bloqueia o salvamento --
    // apenas destaca o campo em vermelho (ver PlacaInput / MotoVendaSection).
    setSaving(true);

    // Cria ou atualiza o cliente antes de gravar o atendimento
    let finalClienteId = clienteId;
    if (finalClienteId) {
      // Cliente existente: telefone é imutável — não vai no update.
      const { error: clienteError } = await supabase.from('clientes_fornecedores')
        .update({ nome_razao_social: formatPersonName(nomeCliente), sexo })
        .eq('id', finalClienteId);
      if (clienteError) { toast.error('Erro ao salvar dados do cliente'); setSaving(false); return; }
    } else {
      const clientePayload = {
        nome_razao_social: formatPersonName(nomeCliente),
        telefone: unformatPhone(telefone),
        sexo,
      };
      const { data: novoCliente, error: clienteError } = await supabase.from('clientes_fornecedores').insert(clientePayload).select('id').single();
      if (clienteError || !novoCliente) { toast.error('Erro ao criar cliente'); setSaving(false); return; }
      finalClienteId = novoCliente.id;
      setClienteId(finalClienteId);
    }
    // Endereço mínimo (só UF, capturado neste formulário rápido)
    const { data: enderecoExistente } = await supabase.from('clientes_fornecedores_enderecos').select('id').eq('cliente_fornecedor_id', finalClienteId).eq('tipo', 'fiscal').maybeSingle();
    if (enderecoExistente) {
      await supabase.from('clientes_fornecedores_enderecos').update({ uf }).eq('id', enderecoExistente.id);
    } else {
      await supabase.from('clientes_fornecedores_enderecos').insert({ cliente_fornecedor_id: finalClienteId, tipo: 'fiscal', uf });
    }

    const lojaId = loja === lojaOriginal ? lojaIdOriginal : lojaIdMap.get(loja);
    if (!lojaId) {
      toast.error('Loja inválida, selecione novamente');
      setSaving(false);
      return;
    }

    const atData = {
      vendedor_id: vendedorId || user!.id,
      loja_id: lojaId, empresa_id: empresaId, cliente_id: finalClienteId as string, tipo_atendimento: tipoAtendimento,
      origem: origem || null, temperatura: temperatura || null,
      interesse, situacao: isEditing ? situacao : 'em_aberto' as SituacaoShowroom,
    };

    let atId = atendimentoId;

    if (isEditing) {
      const { error } = await supabase.from('atendimentos_motos').update(atData).eq('id', atendimentoId);
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('atendimentos_motos').insert(atData).select('id').single();
      if (error) { toast.error('Erro ao criar atendimento'); setSaving(false); return; }
      atId = data.id;

      // Register initial status in history
      await supabase.from('status_history').insert({
        entity_type: 'showroom',
        entity_id: atId,
        status: 'criado',
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
      });
    }

    if (interesse === 'comprar' || interesse === 'trocar') {
      const miData = isDucati
        ? {
            atendimento_id: atId!,
            origem: 'estoque' as const,
            marca_id: compraMarcaId || marcaIdByNome('DUCATI'),
            modelo_id: compraModeloId || null,
            ano: compraAno || null,
            estoque_moto_id: null,
            estoque_tipo: null,
            chassi: chassi.toUpperCase().replace(/\s/g, '') || null,
          }
        : {
            atendimento_id: atId!,
            origem: origemMoto,
            marca_id: origemMoto === 'externo' ? compraMarcaId || null : null,
            modelo_id: origemMoto === 'externo' ? compraModeloId || null : null,
            ano: origemMoto === 'externo' ? compraAno || null : null,
            estoque_moto_id: origemMoto === 'estoque' ? estoqueMotoId || null : null,
            estoque_tipo: origemMoto === 'estoque' ? (estoqueTipo || 'seminova') : null,
            chassi: null,
          };
      if (isEditing) {
        const { data: existing } = await supabase.from('motos_interesse').select('id').eq('atendimento_id', atId!).maybeSingle();
        if (existing) {
          await supabase.from('motos_interesse').update(miData as any).eq('id', existing.id);
        } else {
          await supabase.from('motos_interesse').insert(miData as any);
        }
      } else {
        await supabase.from('motos_interesse').insert(miData as any);
      }
    } else if (isEditing && interesse === 'vender') {
      // Se mudou para "vender", remover moto de interesse existente
      await supabase.from('motos_interesse').delete().eq('atendimento_id', atId!);
    }

    // Save moto avaliacao
    if (interesse === 'vender' || interesse === 'trocar') {
      if (vendaMarcaId && vendaModeloId) {
        const maData: any = {
          atendimento_id: atId!,
          marca_id: vendaMarcaId, modelo_id: vendaModeloId,
          ano_fabricacao: vendaAnoFab || null, ano_modelo: vendaAnoMod || null,
          categoria: vendaCategoria || null, cor: vendaCor || null,
          placa: vendaPlaca || null, km: vendaKm || null,
          cilindrada: vendaCilindrada || null,
          observacoes: vendaObs.trim() || null,
          tem_manual: temManual === 'sim',
          tem_chave_reserva: temChaveReserva === 'sim',
          manutencao_vencida: manutencaoEmDia === 'sim',
        };
        if (motoAvaliacaoId) {
          // Com CRLV anexado, os dados extraídos do documento são imutáveis.
          if (vendaCrlvUrl) {
            delete maData.marca_id;
            delete maData.modelo_id;
            delete maData.ano_fabricacao;
            delete maData.ano_modelo;
            delete maData.placa;
          }
          await supabase.from('avaliacoes').update(maData).eq('id', motoAvaliacaoId);
        } else {
          await supabase.from('avaliacoes').insert({ ...maData, enviada_avaliacao: false });
        }
      }
    } else if (isEditing && interesse === 'comprar') {
      // Se mudou para "comprar", remover moto do cliente (avaliação) existente
      if (motoAvaliacaoId) {
        await supabase.from('avaliacoes').delete().eq('id', motoAvaliacaoId);
      }
    }

    toast.success(isEditing ? 'Atendimento atualizado!' : 'Atendimento criado!');
    setSaving(false);
    onClose();
  };

  const handleEnviarAvaliacao = async () => {
    if (!motoAvaliacaoId) {
      toast.error('Salve o atendimento primeiro');
      return;
    }

    const { error } = await supabase.from('avaliacoes').update({ enviada_avaliacao: true }).eq('id', motoAvaliacaoId);
    if (error) {
      toast.error('Erro ao enviar para avaliação');
    } else {
      // Registrar no histórico
      await supabase.from('status_history').insert({
        entity_type: 'avaliacao',
        entity_id: motoAvaliacaoId,
        status: 'avaliacao_solicitada',
        changed_by: user?.id,
        changed_by_name: userName || user?.email || null,
      } as any);
      // Notificar avaliadores
      await supabase.rpc('notify_role', {
        _role: 'gerente' as any,
        _title: 'Avaliação Solicitada',
        _message: `Nova avaliação solicitada para o atendimento | Por: ${userName || user?.email || 'Usuário'}`,
        _entity_id: atendimentoId,
        _entity_type: 'avaliacao',
      });
      setEnviadaAvaliacao(true);
      toast.success('Moto enviada para avaliação!');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const ToggleButton = ({ label, value, selected, onSelect }: { label: string; value: string; selected: string; onSelect: (v: string) => void }) => (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "px-3 h-9 rounded-md text-sm font-medium border transition-colors",
        selected === value
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold">{isEditing ? 'Editar Atendimento' : 'Novo Atendimento'}</h1>
      </div>

      {/* Card: Empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Empresa *</Label>
            <Select value={empresaId} onValueChange={handleEmpresaChange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
              <SelectContent>
                {empresasList.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {(e.razao_social || e.nome)}{e.cnpj ? ` - ${e.cnpj}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Card: Dados do Cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Dados do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[220px_2fr_auto_auto] gap-4">
          <div className="space-y-1.5">
            <Label>Telefone *</Label>
            <div className="flex items-center gap-2">
              <Input
                value={telefone}
                onChange={handlePhoneChange}
                disabled={isEditing}
                title={isEditing ? 'Telefone do cliente não pode ser alterado' : undefined}
                placeholder="(61) 90000-0000"
                maxLength={15}
                className="flex-1"
              />
              {searchingPhone && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {!searchingPhone && clientFound === true && <CheckCircle className="h-5 w-5 text-primary" />}
            </div>
            {clientFound === true && (
              <p className="text-xs text-primary font-medium">Cliente encontrado!</p>
            )}
            {clientFound === false && (
              <p className="text-xs text-muted-foreground">Cliente não encontrado. Preencha os dados.</p>
            )}
            {telefone && !isPhoneValid && (
              <p className="text-xs text-destructive">Telefone deve ter 11 dígitos</p>
            )}
          </div>
          {(isEditing || isPhoneValid) && (
            <>
              <div className="space-y-1.5">
                <Label>Nome do Cliente *</Label>
                <Input
                  placeholder="Nome Sobrenome"
                  value={nomeCliente}
                  onChange={e => {
                    const formatted = e.target.value
                      .toLowerCase()
                      .replace(/(?:^|\s)\S/g, match => match.toUpperCase());
                    setNomeCliente(formatted);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF *</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sexo *</Label>
                <div className="flex flex-wrap gap-2">
                  {SEXOS.map(s => (
                    <ToggleButton key={s} label={s} value={s} selected={sexo} onSelect={setSexo} />
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card: Dados do Atendimento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Dados do Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing && (
            <div className="space-y-1.5 max-w-xs">
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
            <div className="space-y-1.5 col-start-1">
              <Label>Loja *</Label>
              <div className="flex flex-wrap gap-2 [&>button]:min-w-[90px]">
                {gruposDisponiveis.map(g => (
                  <ToggleButton
                    key={g}
                    label={g}
                    value={g}
                    selected={lojaDisplayGroup}
                    onSelect={(v) => {
                      if (lojaGroupLocked && v !== originalLojaGroup) {
                        toast.error('Atendimentos com Sinal ou Vendido não podem trocar entre 299 e Ducati. Marque o atendimento como perdido primeiro.');
                        return;
                      }
                      setLojaGroup(v as '299' | 'Ducati');
                      if (!LOJA_GROUPS[v as '299' | 'Ducati'].includes(loja)) setLoja('');
                    }}
                  />
                ))}
              </div>
            </div>
            {lojaDisplayGroup && (
              <div
                className="space-y-1.5 col-start-2 mx-auto overflow-hidden transition-[width] duration-300 ease-in-out"
                style={{ width: unidadeWidth || undefined }}
              >
                <Label>Unidade *</Label>
                <div ref={unidadeInnerRef} className="flex flex-nowrap gap-2 w-fit [&>button]:min-w-[90px]">
                  {unidadeOptions(lojaDisplayGroup as '299' | 'Ducati').map(l => (
                    <ToggleButton key={l} label={lojaUnidadeLabel(l)} value={l} selected={loja} onSelect={setLoja} />
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5 w-[220px] col-start-3">
              <Label>Origem *</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de Atendimento *</Label>
              <div className="flex flex-wrap gap-2 [&>button]:min-w-[90px]">
                {TIPOS_ATENDIMENTO.map(t => (
                  <ToggleButton key={t} label={t} value={t} selected={tipoAtendimento} onSelect={setTipoAtendimento} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temperatura *</Label>
              <div className="flex flex-wrap gap-2 [&>button]:min-w-[90px]">
                {TEMPERATURAS.map(t => (
                  <ToggleButton key={t} label={t} value={t} selected={temperatura} onSelect={setTemperatura} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5 w-[220px]">
              <Label>Interesse *</Label>
              <Select value={interesse} onValueChange={v => setInteresse(v as Interesse)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERESSES.filter(i => permiteVender || i.value !== 'vender').map(i => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditional sections */}
      {(interesse === 'comprar' || interesse === 'trocar') && (
        <MotoCompraSection
          origemMoto={origemMoto} setOrigemMoto={setOrigemMoto}
          marcaId={compraMarcaId} setMarcaId={setCompraMarcaId}
          modeloId={compraModeloId} setModeloId={setCompraModeloId}
          ano={compraAno} setAno={setCompraAno}
          estoqueMotoId={estoqueMotoId} setEstoqueMotoId={setEstoqueMotoId}
          estoqueTipo={estoqueTipo} setEstoqueTipo={setEstoqueTipo}
          loja={loja}
          chassi={chassi} setChassi={setChassi}
          disabled={isEditing && (situacao === 'sinal' || situacao === 'vendido')}
        />
      )}

      {(interesse === 'vender' || interesse === 'trocar') && (
        <>
          <MotoVendaSection
            marcaId={vendaMarcaId} setMarcaId={setVendaMarcaId}
            modeloId={vendaModeloId} setModeloId={setVendaModeloId}
            anoFab={vendaAnoFab} setAnoFab={setVendaAnoFab}
            anoMod={vendaAnoMod} setAnoMod={setVendaAnoMod}
            categoria={vendaCategoria} setCategoria={setVendaCategoria}
            cor={vendaCor} setCor={setVendaCor}
            placa={vendaPlaca} setPlaca={setVendaPlaca}
            km={vendaKm} setKm={setVendaKm}
            cilindrada={vendaCilindrada} setCilindrada={setVendaCilindrada}
            temManual={temManual} setTemManual={setTemManual}
            temChaveReserva={temChaveReserva} setTemChaveReserva={setTemChaveReserva}
            manutencaoEmDia={manutencaoEmDia} setManutencaoEmDia={setManutencaoEmDia}
            observacoes={vendaObs} setObservacoes={setVendaObs}
            motoAvaliacaoId={motoAvaliacaoId}
            atendimentoId={atendimentoId}
            interesse={interesse}
            isEditing={isEditing}
            crlvBloqueado={!!vendaCrlvUrl}
          />
          {!isEditing && motoAvaliacaoId && !enviadaAvaliacao && (
            <div className="flex justify-end">
              <Button variant="default" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleEnviarAvaliacao}>
                <SendHorizonal className="h-4 w-4" /> Enviar para Avaliação
              </Button>
            </div>
          )}
          {enviadaAvaliacao && (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="py-3 text-sm text-success font-medium text-center">
                ✓ Moto enviada para avaliação
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex gap-3 justify-end pt-2 pb-8">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default AtendimentoForm;
