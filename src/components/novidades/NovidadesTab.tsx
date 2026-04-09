import React, { useState } from 'react';
import MaintenanceBadges from '@/components/shared/MaintenanceBadges';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, ArrowLeft, Phone, User, Bike, Calendar, Tag, BookOpen, Key, Wrench, Thermometer } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  data_entrada: string;
  tipo: string;
  classificacao: string | null;
  moto_avaliacao_id: string | null;
  tem_manual: boolean | null;
  tem_chave_reserva: boolean | null;
  manutencao_vencida: boolean | null;
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
}

interface NovidadesTabProps {
  onNavigateToShowroom?: (atendimentoId: string) => void;
}

const NovidadesTab: React.FC<NovidadesTabProps> = ({ onNavigateToShowroom }) => {
  const { role, user } = useAuth();
  const [selectedMoto, setSelectedMoto] = useState<EstoqueItem | null>(null);

  const sevenDaysAgo = subDays(new Date(), 7).toISOString();

  const { data: motos = [], isLoading: loadingMotos } = useQuery({
    queryKey: ['novidades-estoque'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estoque')
        .select('id, marca, modelo, ano_fabricacao, ano_modelo, cor, placa, km, preco, data_entrada, tipo, classificacao, moto_avaliacao_id, motos_avaliacao!estoque_moto_avaliacao_id_fkey(tem_manual, tem_chave_reserva, manutencao_vencida)')
        .eq('status', 'disponivel')
        .gte('data_entrada', sevenDaysAgo)
        .order('data_entrada', { ascending: false });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        tem_manual: item.motos_avaliacao?.tem_manual ?? null,
        tem_chave_reserva: item.motos_avaliacao?.tem_chave_reserva ?? null,
        manutencao_vencida: item.motos_avaliacao?.manutencao_vencida ?? null,
      })) as EstoqueItem[];
    },
  });

  const { data: interessados = [], isLoading: loadingInteressados } = useQuery({
    queryKey: ['novidades-interessados', selectedMoto?.id, selectedMoto?.marca, selectedMoto?.modelo],
    enabled: !!selectedMoto,
    queryFn: async () => {
      if (!selectedMoto) return [];

      // Find atendimentos with motos_interesse matching marca+modelo
      const { data, error } = await supabase
        .from('motos_interesse')
        .select(`
          atendimento_id,
          atendimentos!motos_interesse_atendimento_id_fkey (
            nome_cliente,
            telefone,
            vendedor_id,
            created_at,
            interesse,
            situacao,
            temperatura
          )
        `)
        .ilike('marca', selectedMoto.marca)
        .ilike('modelo', selectedMoto.modelo);

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
      }> = [];

      for (const mi of data || []) {
        const a = mi.atendimentos as any;
        if (!a) continue;
        if (a.situacao === 'sinal' || a.situacao === 'vendido') continue;
        // Vendedor only sees own
        if (role === 'vendedor' && a.vendedor_id !== user?.id) continue;
        results.push({
          atendimento_id: mi.atendimento_id,
          nome_cliente: a.nome_cliente,
          telefone: a.telefone,
          vendedor_id: a.vendedor_id,
          created_at: a.created_at,
          interesse: a.interesse,
          situacao: a.situacao,
          temperatura: a.temperatura,
        });
      }

      // Get vendedor names
      const vendedorIds = [...new Set(results.map(r => r.vendedor_id))];
      let vendedorMap: Record<string, string> = {};
      if (vendedorIds.length > 0) {
        const { data: roles } = await supabase
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
              {selectedMoto.preco && <span><strong>Preço:</strong> R$ {selectedMoto.preco.toLocaleString('pt-BR')}</span>}
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
            {interessados.map((cli) => (
              <Card
                key={cli.atendimento_id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onNavigateToShowroom?.(cli.atendimento_id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{cli.nome_cliente}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{cli.telefone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span>{cli.vendedor_nome}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>{format(new Date(cli.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      {cli.temperatura && (
                        <div className={`flex items-center gap-2 text-sm ${tempColor(cli.temperatura)}`}>
                          <Thermometer className="h-3.5 w-3.5 shrink-0" />
                          <span>{capitalize(cli.temperatura)}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {capitalize(cli.interesse)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
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
        <Badge variant="secondary" className="ml-auto">{motos.length} moto{motos.length !== 1 ? 's' : ''}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Motos disponíveis no estoque há até 7 dias</p>

      {loadingMotos ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : motos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bike className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma novidade no momento</p>
          <p className="text-sm">Não há motos novas no estoque nos últimos 7 dias.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motos.map((moto) => (
            <Card
              key={moto.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
              onClick={() => setSelectedMoto(moto)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{moto.marca}</p>
                    <p className="text-sm text-muted-foreground truncate">{moto.modelo}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs bg-primary/10 text-primary border-primary/30">
                    {diasNoEstoque(moto.data_entrada)}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {moto.ano_fabricacao && <span>{moto.ano_fabricacao}/{moto.ano_modelo}</span>}
                  {moto.cor && <span>{moto.cor}</span>}
                  {moto.km && <span>{moto.km} km</span>}
                </div>

                {moto.preco && (
                  <p className="text-sm font-bold text-primary">
                    R$ {moto.preco.toLocaleString('pt-BR')}
                  </p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {moto.classificacao && (
                    <Badge variant="secondary" className="text-[10px]">
                      {moto.classificacao}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {moto.tipo === 'propria' ? 'Própria' : 'Consignada'}
                  </Badge>
                  <MaintenanceBadges
                    temManual={moto.tem_manual}
                    temChaveReserva={moto.tem_chave_reserva}
                    manutencaoVencida={moto.manutencao_vencida}
                  />
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
