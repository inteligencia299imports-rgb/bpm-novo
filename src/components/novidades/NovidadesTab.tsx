import React, { useState } from 'react';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, ArrowLeft, Phone, User, Bike, Calendar, Thermometer } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTipoAquisicaoLabel, getTipoAquisicaoBadgeClass } from '@/lib/tipoAquisicao';
import CidadeFilter, { matchesCidade, type CidadeFilterValue } from '@/components/shared/CidadeFilter';

interface EstoqueItem {
  id: string;
  marca: string;
  modelo: string;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  cor: string | null;
  placa: string | null;
  km: string | null;
  preco: number | null;
  preco_acao: number | null;
  data_entrada: string;
  tipo: string;
  classificacao: string | null;
  cilindrada: string | null;
  categoria: string | null;
  empresa: string | null;
  tem_manual: boolean | null;
  tem_chave_reserva: boolean | null;
  manutencao_vencida: boolean | null;
  loja_origem: string | null;
}

interface ClienteInteressado {
  atendimento_id: string;
  nome_cliente: string;
  telefone: string;
  vendedor_nome: string;
  vendedor_id: string;
  created_at: string;
  interesse: string;
  situacao: string;
  temperatura: string | null;
  loja: string;
}

interface NovidadesTabProps {
  onNavigateToShowroom?: (atendimentoId: string) => void;
}

const NovidadesTab: React.FC<NovidadesTabProps> = ({ onNavigateToShowroom }) => {
  const { role, user } = useAuth();
  const [selectedMoto, setSelectedMoto] = useState<EstoqueItem | null>(null);

  const [filterCidade, setFilterCidade] = useState<CidadeFilterValue>('todos');

  const sevenDaysAgo = subDays(new Date(), 7).toISOString();

  const { data: motos = [], isLoading: loadingMotos } = useQuery({
    queryKey: ['novidades-estoque'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estoque')
        .select('id, marca, modelo, ano_fabricacao, ano_modelo, cor, placa, km, preco, preco_acao, data_entrada, tipo, classificacao, cilindrada, categoria, empresa, avaliacoes:avaliacao_id(tem_manual, tem_chave_reserva, manutencao_vencida, atendimentos:atendimento_id(loja_id, loja_empresas:loja_id(loja)))')
        .eq('status', 'disponivel')
        .gte('data_entrada', sevenDaysAgo)
        .order('data_entrada', { ascending: false });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        tem_manual: item.avaliacoes?.tem_manual ?? null,
        tem_chave_reserva: item.avaliacoes?.tem_chave_reserva ?? null,
        manutencao_vencida: item.avaliacoes?.manutencao_vencida ?? null,
        loja_origem: item.avaliacoes?.atendimentos?.loja_empresas?.loja ?? null,
      })) as EstoqueItem[];
    },
  });

  const motosFiltered = motos.filter(m => matchesCidade(m.loja_origem, filterCidade));

  const { data: interessados = [], isLoading: loadingInteressados } = useQuery({
    queryKey: ['novidades-interessados', selectedMoto?.id, selectedMoto?.marca, selectedMoto?.modelo],
    enabled: !!selectedMoto,
    queryFn: async () => {
      if (!selectedMoto) return [];

      // Build a partial model search: use the first 2 words as base
      // e.g. "DK 150 XRE" → search "%DK 150%" so "DK 150 S" also matches
      const modeloWords = selectedMoto.modelo.trim().split(/\s+/);
      const baseModelo = modeloWords.length >= 2
        ? modeloWords.slice(0, 2).join(' ')
        : modeloWords[0];

      // Find atendimentos with motos_interesse matching marca + modelo parcial
      const { data, error } = await supabase
        .from('motos_interesse')
        .select(`
          atendimento_id,
          modelo,
          atendimentos:atendimentos_motos!motos_interesse_atendimento_id_fkey (
            vendedor_id,
            created_at,
            interesse,
            situacao,
            temperatura,
            loja_id,
            loja_empresas:loja_id(loja),
            cliente:clientes_fornecedores(nome_razao_social, telefone)
          )
        `)
        .ilike('marca', selectedMoto.marca)
        .ilike('modelo', `%${baseModelo}%`);

      if (error) throw error;

      // Flatten and filter: exclude sinal/vendido
      const results: Array<{
        atendimento_id: string;
        nome_cliente: string;
        telefone: string;
        vendedor_id: string;
        created_at: string;
        interesse: string;
        situacao: string;
        temperatura: string | null;
        loja: string;
      }> = [];

      for (const mi of data || []) {
        const a = mi.atendimentos as any;
        if (!a) continue;
        if (a.situacao === 'sinal' || a.situacao === 'vendido') continue;
        if (role === 'vendedor' && a.vendedor_id !== user?.id) continue;
        results.push({
          atendimento_id: mi.atendimento_id,
          nome_cliente: a.cliente?.nome_razao_social,
          telefone: a.cliente?.telefone,
          vendedor_id: a.vendedor_id,
          created_at: a.created_at,
          interesse: a.interesse,
          situacao: a.situacao,
          temperatura: a.temperatura,
          loja: a.loja_empresas?.loja,
        });
      }

      // Get vendedor names
      const vendedorIds = [...new Set(results.map(r => r.vendedor_id))];
      let vendedorMap: Record<string, string> = {};
      if (vendedorIds.length > 0) {
        const { data: roles } = await (supabase as any)
          .from('user_roles')
          .select('user_id, nome')
          .in('user_id', vendedorIds);
        if (roles) {
          vendedorMap = Object.fromEntries(roles.map(r => [r.user_id, r.nome]));
        }
      }

      return results.map(r => ({
        ...r,
        vendedor_nome: vendedorMap[r.vendedor_id] || 'Desconhecido',
      })) as ClienteInteressado[];
    },
  });

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const tempColor = (temp: string | null) => {
    if (!temp) return '';
    if (temp === 'quente') return 'text-red-500';
    if (temp === 'morno') return 'text-orange-500';
    return 'text-blue-500';
  };

  const diasNoEstoque = (dataEntrada: string) => {
    const dias = differenceInDays(new Date(), new Date(dataEntrada));
    return dias === 0 ? 'Hoje' : dias === 1 ? '1 dia' : `${dias} dias`;
  };

  const formatCurrency = (value: number | null) => {
    if (value == null) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (selectedMoto) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedMoto(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {selectedMoto.marca} {selectedMoto.modelo}
            </h2>
            <p className="text-sm text-muted-foreground">
              Clientes interessados neste modelo
            </p>
          </div>
        </div>

        <Card className="bg-accent/30 border-accent">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><strong>Marca:</strong> {selectedMoto.marca}</span>
              <span><strong>Modelo:</strong> {selectedMoto.modelo}</span>
              {selectedMoto.ano_fabricacao && <span><strong>Ano:</strong> {selectedMoto.ano_fabricacao}/{selectedMoto.ano_modelo}</span>}
              {selectedMoto.cor && <span><strong>Cor:</strong> {selectedMoto.cor}</span>}
              {selectedMoto.placa && <span><strong>Placa:</strong> {selectedMoto.placa}</span>}
              {selectedMoto.preco && <span><strong>Preço:</strong> R$ {selectedMoto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
            </div>
          </CardContent>
        </Card>

        {loadingInteressados ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : interessados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum cliente interessado encontrado</p>
            <p className="text-sm">Não há atendimentos com interesse neste modelo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              {interessados.length} cliente{interessados.length !== 1 ? 's' : ''} interessado{interessados.length !== 1 ? 's' : ''}
            </p>
            {interessados.map((cli) => {
              const formatPhone = (value: string): string => {
                const digits = value.replace(/\D/g, '');
                if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                return value;
              };

              return (
                <div
                  key={cli.atendimento_id}
                  className="bg-card rounded-lg border border-border shadow-soft hover:shadow-card hover:bg-surface-hover transition-all cursor-pointer group overflow-hidden"
                  onClick={() => onNavigateToShowroom?.(cli.atendimento_id)}
                >
                  <div className="flex">
                    <div className="w-1 shrink-0 rounded-l-lg bg-primary" />
                    <div className="flex-1 p-3 space-y-2 min-w-0 overflow-hidden">
                      {/* Header: name + interesse badge */}
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">
                          {cli.nome_cliente}
                        </h3>
                        <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary whitespace-nowrap">
                          {capitalize(cli.interesse)}
                        </Badge>
                      </div>

                      {/* Vendedor */}
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary min-w-0">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate min-w-0">{cli.vendedor_nome}</span>
                      </div>

                      {/* Phone + Date */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhone(cli.telefone)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(cli.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>

                      {/* Loja + Temperatura */}
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">
                          {cli.loja}
                        </Badge>
                        {cli.temperatura && (
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${
                            cli.temperatura === 'Quente' || cli.temperatura === 'quente' ? 'text-destructive' :
                            cli.temperatura === 'Morno' || cli.temperatura === 'morno' ? 'text-yellow-600' :
                            'text-[#2EC5FF]'
                          }`}>
                            <Thermometer className="h-3 w-3" />
                            {capitalize(cli.temperatura)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Novidades</h2>
        <Badge variant="secondary" className="ml-auto">{motosFiltered.length} moto{motosFiltered.length !== 1 ? 's' : ''}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Motos disponíveis no estoque há até 7 dias</p>

      <CidadeFilter value={filterCidade} onChange={setFilterCidade} />

      {loadingMotos ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : motosFiltered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bike className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma novidade no momento</p>
          <p className="text-sm">Não há motos novas no estoque nos últimos 7 dias.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motosFiltered.map((moto) => (
            <Card
              key={moto.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
              onClick={() => setSelectedMoto(moto)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{moto.modelo}</p>
                    <p className="text-xs text-muted-foreground">
                      {[moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/')}
                      {moto.cilindrada ? ` · ${moto.cilindrada}cc` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs bg-primary/10 text-primary border-primary/30">
                    {diasNoEstoque(moto.data_entrada)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {moto.placa && (
                    <>
                      <span className="text-muted-foreground">Placa</span>
                      <span className="font-medium text-foreground">{moto.placa.replace(/-/g, '')}</span>
                    </>
                  )}
                  {moto.cor && (
                    <>
                      <span className="text-muted-foreground">Cor</span>
                      <span className="text-foreground">{moto.cor}</span>
                    </>
                  )}
                  {moto.categoria && (
                    <>
                      <span className="text-muted-foreground">Categoria</span>
                      <span className="text-foreground">{moto.categoria}</span>
                    </>
                  )}
                  {moto.classificacao && (
                    <>
                      <span className="text-muted-foreground">Classificação</span>
                      <span className="text-foreground">{moto.classificacao}</span>
                    </>
                  )}
                  {moto.km && (
                    <>
                      <span className="text-muted-foreground">Km</span>
                      <span className="text-foreground">{Number(moto.km).toLocaleString('pt-BR')}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="text-foreground">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTipoAquisicaoBadgeClass(moto.tipo)}`}>
                      {getTipoAquisicaoLabel(moto.tipo) || moto.tipo}
                    </Badge>
                  </span>
                  {moto.empresa && (
                    <>
                      <span className="text-muted-foreground">Empresa</span>
                      <span className="text-foreground">{moto.empresa}</span>
                    </>
                  )}
                </div>

                <MaintenanceBadges
                  temManual={moto.tem_manual}
                  temChaveReserva={moto.tem_chave_reserva}
                  manutencaoVencida={moto.manutencao_vencida}
                />

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Preço</p>
                    <p className="font-semibold text-foreground">{formatCurrency(moto.preco)}</p>
                  </div>
                  {moto.preco_acao != null && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Preço Ação</p>
                      <p className="font-semibold text-green-600">{formatCurrency(moto.preco_acao)}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Entrada: {format(new Date(moto.data_entrada), 'dd/MM/yyyy', { locale: ptBR })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default NovidadesTab;
