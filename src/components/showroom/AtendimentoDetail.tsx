import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Edit, Trash2, Phone, MapPin, Tag, User, Thermometer, Store, Calendar, Bike, FileText, MessageCircle } from 'lucide-react';
import type { Atendimento, MotoInteresse, MotoAvaliacao } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  atendimento: Atendimento;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value;
};

const formatKm = (km: string | null) => {
  if (!km) return null;
  const num = parseInt(km.replace(/\D/g, ''), 10);
  if (isNaN(num)) return km;
  return num.toLocaleString('pt-BR') + ' km';
};

const AtendimentoDetail: React.FC<Props> = ({ atendimento, onClose, onEdit, onDeleted }) => {
  const [motosInteresse, setMotosInteresse] = useState<MotoInteresse[]>([]);
  const [motosAvaliacao, setMotosAvaliacao] = useState<MotoAvaliacao[]>([]);
  const [loading, setLoading] = useState(true);

  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);
      const [resInt, resAv] = await Promise.all([
        supabase.from('motos_interesse').select('*').eq('atendimento_id', atendimento.id),
        supabase.from('motos_avaliacao').select('*').eq('atendimento_id', atendimento.id),
      ]);
      setMotosInteresse((resInt.data as unknown as MotoInteresse[]) || []);
      setMotosAvaliacao((resAv.data as unknown as MotoAvaliacao[]) || []);
      setLoading(false);
    };
    fetchRelated();
  }, [atendimento.id]);

  const handleDelete = async () => {
    await supabase.from('avaliacoes').delete().eq('atendimento_id', atendimento.id);
    await supabase.from('motos_interesse').delete().eq('atendimento_id', atendimento.id);
    const { data: motos } = await supabase.from('motos_avaliacao').select('id').eq('atendimento_id', atendimento.id);
    if (motos) {
      for (const m of motos) {
        await supabase.from('moto_fotos').delete().eq('moto_avaliacao_id', m.id);
      }
    }
    await supabase.from('motos_avaliacao').delete().eq('atendimento_id', atendimento.id);
    const { error } = await supabase.from('atendimentos').delete().eq('id', atendimento.id);
    if (error) {
      toast.error('Erro ao excluir atendimento');
    } else {
      toast.success('Atendimento excluído');
      onDeleted();
    }
  };

  const InfoItem = ({ label, value }: { label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    ) : null
  );

  const whatsappUrl = (() => {
    const digits = atendimento.telefone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold truncate">{atendimento.nome_cliente}</h1>
              {sit && <Badge className={`${sit.color} text-[10px] shrink-0`}>{sit.label}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => onEdit(atendimento.id)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-14rem)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={atendimento.nome_cliente} />
                <InfoItem label="Telefone" value={formatPhone(atendimento.telefone)} />
                <InfoItem label="Sexo" value={atendimento.sexo} />
                <InfoItem label="UF" value={atendimento.uf} />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 text-green-600 border-green-600 hover:bg-green-50"
                onClick={() => window.open(whatsappUrl, '_blank')}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </CardContent>
          </Card>

          {/* Dados do Atendimento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Dados do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Loja" value={atendimento.loja} />
                <InfoItem label="Tipo de Atendimento" value={atendimento.tipo_atendimento} />
                <InfoItem label="Interesse" value={int?.label} />
                <InfoItem label="Origem" value={atendimento.origem} />
                <InfoItem label="Temperatura" value={atendimento.temperatura} />
                <InfoItem label="Situação" value={sit?.label} />
              </div>
            </CardContent>
          </Card>

          {/* Motos de Interesse (Compra) */}
          {motosInteresse.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bike className="h-4 w-4 text-primary" /> Moto de Interesse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {motosInteresse.map((moto, idx) => (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Origem" value={moto.origem === 'estoque' ? 'Estoque' : 'Externo'} />
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano" value={moto.ano} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Motos de Avaliação (Venda/Troca) */}
          {motosAvaliacao.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" /> Moto do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {motosAvaliacao.map((moto, idx) => (
                  <div key={moto.id} className="space-y-3">
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Marca" value={moto.marca} />
                      <InfoItem label="Modelo" value={moto.modelo} />
                      <InfoItem label="Ano Fabricação" value={moto.ano_fabricacao} />
                      <InfoItem label="Ano Modelo" value={moto.ano_modelo} />
                      <InfoItem label="Categoria" value={moto.categoria} />
                      <InfoItem label="Cor" value={moto.cor} />
                      <InfoItem label="Placa" value={moto.placa} />
                      <InfoItem label="KM" value={formatKm(moto.km)} />
                      <InfoItem label="Enviada p/ Avaliação" value={moto.enviada_avaliacao ? 'Sim' : 'Não'} />
                    </div>
                    {moto.observacoes && (
                      <div className="mt-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações da Moto</span>
                        <p className="text-sm mt-1">{moto.observacoes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {atendimento.observacoes && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{atendimento.observacoes}</p>
              </CardContent>
            </Card>
          )}

          {/* Excluir */}
          <div className="md:col-span-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full gap-1.5">
                  <Trash2 className="h-4 w-4" /> Excluir Atendimento
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O atendimento de <strong>{atendimento.nome_cliente}</strong> e todos os dados relacionados serão permanentemente excluídos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>