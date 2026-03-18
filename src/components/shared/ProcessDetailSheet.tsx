import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Phone, Calendar, MapPin, Bike, User, FileText, DollarSign, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatKm = (km: string | null | undefined) => {
  if (!km) return null;
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR') + ' km';
};

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="text-muted-foreground mt-0.5">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value || '-'}</p>
    </div>
  </div>
);

export interface ProcessDetailData {
  clientName?: string;
  phone?: string;
  loja?: string;
  date?: string;
  statusLabel?: string;
  statusColor?: string;
  // Moto info
  motoMarca?: string;
  motoModelo?: string;
  motoPlaca?: string;
  motoCor?: string;
  motoAno?: string;
  motoKm?: string;
  motoCategoria?: string;
  // Financial
  valorFipe?: number | null;
  avaliacaoCompra?: number | null;
  avaliacaoConsignacao?: number | null;
  valorFechamento?: number | null;
  quantoPede?: number | null;
  quantoVende?: number | null;
  previsaoCustosLoja?: number | null;
  previsaoCustosCliente?: number | null;
  // Extra
  tipoAquisicao?: string | null;
  negociacao?: string | null;
  observacoes?: string | null;
  observacaoAvaliador?: string | null;
  extras?: { label: string; value: React.ReactNode }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: ProcessDetailData | null;
  title?: string;
}

const ProcessDetailSheet: React.FC<Props> = ({ open, onClose, data, title = 'Detalhes' }) => {
  if (!data) return null;

  const hasMoto = data.motoMarca || data.motoModelo;
  const hasFinancial = [data.valorFipe, data.avaliacaoCompra, data.avaliacaoConsignacao, data.valorFechamento, data.quantoPede, data.quantoVende, data.previsaoCustosLoja, data.previsaoCustosCliente].some(v => v !== null && v !== undefined);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            {data.statusColor && <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: data.statusColor }} />}
            {title}
          </SheetTitle>
        </SheetHeader>

        {/* Status badge */}
        {data.statusLabel && (
          <div className="mb-4">
            <Badge variant="secondary" className="text-xs" style={{ borderColor: data.statusColor, color: data.statusColor }}>
              {data.statusLabel}
            </Badge>
          </div>
        )}

        {/* Client info */}
        <div className="space-y-0">
          <InfoRow icon={<User className="h-4 w-4" />} label="Cliente" value={data.clientName} />
          {data.phone && <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={formatPhone(data.phone)} />}
          {data.loja && <InfoRow icon={<MapPin className="h-4 w-4" />} label="Loja" value={data.loja} />}
          {data.date && (
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Data"
              value={format(new Date(data.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            />
          )}
        </div>

        {/* Moto info */}
        {hasMoto && (
          <>
            <Separator className="my-4" />
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Bike className="h-4 w-4 text-primary" /> Moto
            </h3>
            <div className="space-y-0">
              <InfoRow icon={<Tag className="h-4 w-4" />} label="Marca / Modelo" value={`${data.motoMarca || ''} ${data.motoModelo || ''}`.trim() || '-'} />
              {data.motoPlaca && <InfoRow icon={<FileText className="h-4 w-4" />} label="Placa" value={data.motoPlaca} />}
              {data.motoAno && <InfoRow icon={<Calendar className="h-4 w-4" />} label="Ano" value={data.motoAno} />}
              {data.motoCor && <InfoRow icon={<Tag className="h-4 w-4" />} label="Cor" value={data.motoCor} />}
              {data.motoKm && <InfoRow icon={<Tag className="h-4 w-4" />} label="KM" value={formatKm(data.motoKm)} />}
              {data.motoCategoria && <InfoRow icon={<Tag className="h-4 w-4" />} label="Categoria" value={data.motoCategoria} />}
            </div>
          </>
        )}

        {/* Financial info */}
        {hasFinancial && (
          <>
            <Separator className="my-4" />
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Valores
            </h3>
            <div className="space-y-0">
              {data.valorFipe != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="FIPE" value={formatCurrency(data.valorFipe)} />}
              {data.avaliacaoCompra != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Avaliação Compra" value={formatCurrency(data.avaliacaoCompra)} />}
              {data.avaliacaoConsignacao != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Avaliação Consignação" value={formatCurrency(data.avaliacaoConsignacao)} />}
              {data.quantoPede != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Quanto Pede" value={formatCurrency(data.quantoPede)} />}
              {data.quantoVende != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Quanto Vende" value={formatCurrency(data.quantoVende)} />}
              {data.valorFechamento != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Valor Fechamento" value={formatCurrency(data.valorFechamento)} />}
              {data.previsaoCustosLoja != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Custos Loja" value={formatCurrency(data.previsaoCustosLoja)} />}
              {data.previsaoCustosCliente != null && <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Custos Cliente" value={formatCurrency(data.previsaoCustosCliente)} />}
            </div>
          </>
        )}

        {/* Extra info */}
        {(data.tipoAquisicao || data.negociacao || data.observacoes || data.observacaoAvaliador) && (
          <>
            <Separator className="my-4" />
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Informações Adicionais
            </h3>
            <div className="space-y-0">
              {data.tipoAquisicao && <InfoRow icon={<Tag className="h-4 w-4" />} label="Tipo Aquisição" value={data.tipoAquisicao === 'propria' ? 'Própria' : 'Consignada'} />}
              {data.negociacao && <InfoRow icon={<Tag className="h-4 w-4" />} label="Negociação" value={data.negociacao === 'compra' ? 'Compra' : 'Consignação'} />}
              {data.observacoes && (
                <div className="py-2">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-2">{data.observacoes}</p>
                </div>
              )}
              {data.observacaoAvaliador && (
                <div className="py-2">
                  <p className="text-xs text-muted-foreground mb-1">Observação do Avaliador</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-2">{data.observacaoAvaliador}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Custom extras */}
        {data.extras && data.extras.length > 0 && (
          <>
            <Separator className="my-4" />
            {data.extras.map((e, i) => (
              <InfoRow key={i} icon={<Tag className="h-4 w-4" />} label={e.label} value={e.value} />
            ))}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ProcessDetailSheet;
