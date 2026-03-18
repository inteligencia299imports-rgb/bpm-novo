import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, User, Phone, MapPin, RotateCw, Calendar, Palette, Tag, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { POS_VENDA_COLUMNS } from '@/types/crm';

interface Props {
  item: any;
  onClose: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
};

const formatKm = (km: string | null | undefined) => {
  if (!km) return '-';
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR');
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const PosVendaDetail: React.FC<Props> = ({ item, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const moto = item.motos_avaliacao?.[0];
  const statusCol = POS_VENDA_COLUMNS.find(c => c.value === (item.pos_venda_status || 'em_aberto'));
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

  useEffect(() => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', 'pos_venda')
      .eq('entity_id', item.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistory(data || []));
  }, [item.id]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-muted-foreground">Pós-Venda</span>
          {statusCol && (
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: statusCol.hex, color: statusCol.hex }}>
              {statusCol.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground uppercase">
              {moto ? `${moto.marca} ${moto.modelo}` : item.nome_cliente}
            </h1>
            {moto?.placa && <p className="text-xs text-muted-foreground">{moto.placa}</p>}
          </div>
        </div>
      </div>

      <Card className="border-l-4" style={{ borderLeftColor: statusCol?.hex }}>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Status</p>
          <p className="text-sm font-bold text-foreground uppercase">{statusCol?.label || 'Em Aberto'}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Cliente</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Nome:</span>
                  <p className="text-sm font-semibold text-foreground">{item.nome_cliente}</p>
                </div>
              </div>
              {item.telefone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Telefone:</span>
                    <p className="text-sm font-semibold text-foreground">{formatPhone(item.telefone)}</p>
                  </div>
                </div>
              )}
              {item.loja && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Loja:</span>
                    <p className="text-sm font-semibold text-foreground">{item.loja}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {moto && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Dados da Moto</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5">
                  <RotateCw className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">KM:</span>
                    <p className="text-sm font-bold text-foreground">{formatKm(moto.km)}</p>
                  </div>
                </div>
                {ano && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Ano:</span>
                      <p className="text-sm font-bold text-foreground">{ano}</p>
                    </div>
                  </div>
                )}
                {moto.cor && (
                  <div className="flex items-center gap-2.5">
                    <Palette className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cor:</span>
                      <p className="text-sm font-bold text-foreground uppercase">{moto.cor}</p>
                    </div>
                  </div>
                )}
                {moto.categoria && (
                  <div className="flex items-center gap-2.5">
                    <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Categoria:</span>
                      <p className="text-sm font-bold text-foreground uppercase">{moto.categoria}</p>
                    </div>
                  </div>
                )}
              </div>
              {moto.observacoes && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">{moto.observacoes}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {(item.valor_venda != null || item.valor_sinal != null) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Valores</p>
            <div className="grid grid-cols-2 gap-3">
              {item.valor_venda != null && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor Venda:</span>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(item.valor_venda)}</p>
                </div>
              )}
              {item.valor_sinal != null && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor Sinal:</span>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(item.valor_sinal)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">Histórico de Movimentações</p>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-0">
              {history.map((h, i) => (
                <div key={h.id}>
                  <div className="flex items-start gap-3 py-3">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground uppercase">{h.status_from}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                        <span className="font-bold text-foreground uppercase">{h.status_to}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                        {h.changed_by_name && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{h.changed_by_name}</span>}
                      </div>
                    </div>
                  </div>
                  {i < history.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PosVendaDetail;
