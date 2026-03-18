import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, User, Phone, MapPin, RotateCw, Calendar, Palette, Tag, Clock, ArrowRight, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

interface Props {
  item: any;
  entityType: string;
  statusColumns: { value: string; label: string; hex: string }[];
  statusField: string;
  title: string;
  onClose: () => void;
}

const formatPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : v; };
const formatKm = (km: string | null | undefined) => { if (!km) return '-'; const n = parseInt(km.replace(/\D/g,''),10); return isNaN(n) ? km : n.toLocaleString('pt-BR'); };
const formatCurrency = (v: number | null | undefined) => v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const AvaliacaoProcessDetail: React.FC<Props> = ({ item, entityType, statusColumns, statusField, title, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const moto = item.moto || item.motos_avaliacao;
  const atendimento = item.atendimento || item.atendimentos;
  const statusValue = item[statusField] || 'em_aberto';
  const statusCol = statusColumns.find(c => c.value === statusValue);
  const ano = moto ? [moto.ano_fabricacao, moto.ano_modelo].filter(Boolean).join('/') : '';

  useEffect(() => {
    supabase
      .from('status_history')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', item.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistory(data || []));
  }, [item.id, entityType]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-muted-foreground">{title}</span>
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
              {moto ? `${moto.marca} ${moto.modelo}` : atendimento?.nome_cliente || 'N/A'}
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
                  <p className="text-sm font-semibold text-foreground">{atendimento?.nome_cliente || '-'}</p>
                </div>
              </div>
              {atendimento?.telefone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Telefone:</span>
                    <p className="text-sm font-semibold text-foreground">{formatPhone(atendimento.telefone)}</p>
                  </div>
                </div>
              )}
              {atendimento?.loja && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Loja:</span>
                    <p className="text-sm font-semibold text-foreground">{atendimento.loja}</p>
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

      {/* Financial values for avaliacoes-based items */}
      {(item.valor_fipe != null || item.avaliacao_compra != null || item.avaliacao_consignacao != null || item.quanto_pede != null) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Valores</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {item.valor_fipe != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">FIPE:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.valor_fipe)}</p></div>}
              {item.avaliacao_compra != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Avaliação Compra:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.avaliacao_compra)}</p></div>}
              {item.avaliacao_consignacao != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Avaliação Consignação:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.avaliacao_consignacao)}</p></div>}
              {item.quanto_pede != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Quanto Pede:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.quanto_pede)}</p></div>}
              {item.quanto_vende != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Quanto Vende:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.quanto_vende)}</p></div>}
              {item.valor_fechamento != null && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor Fechamento:</span><p className="text-sm font-bold text-foreground">{formatCurrency(item.valor_fechamento)}</p></div>}
            </div>
            {(item.tipo_aquisicao || item.negociacao) && (
              <>
                <Separator />
                <div className="flex gap-4">
                  {item.tipo_aquisicao && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo Aquisição:</span><p className="text-sm font-semibold text-foreground">{item.tipo_aquisicao === 'propria' ? 'Própria' : 'Consignada'}</p></div>}
                  {item.negociacao && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wide">Negociação:</span><p className="text-sm font-semibold text-foreground">{item.negociacao === 'compra' ? 'Compra' : 'Consignação'}</p></div>}
                </div>
              </>
            )}
            {item.observacao_avaliador && (
              <>
                <Separator />
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Observação do Avaliador:</span>
                  <p className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded-md p-2">{item.observacao_avaliador}</p>
                </div>
              </>
            )}
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

export default AvaliacaoProcessDetail;
