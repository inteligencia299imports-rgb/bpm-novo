import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Edit, Trash2, Phone, MapPin, ShoppingCart, Tag, User, Thermometer, Store, Calendar } from 'lucide-react';
import type { Atendimento } from '@/types/crm';
import { SITUACOES_SHOWROOM, INTERESSES } from '@/types/crm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  atendimento: Atendimento | null;
  open: boolean;
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

const AtendimentoDetail: React.FC<Props> = ({ atendimento, open, onClose, onEdit, onDeleted }) => {
  if (!atendimento) return null;

  const sit = SITUACOES_SHOWROOM.find(s => s.value === atendimento.situacao);
  const int = INTERESSES.find(i => i.value === atendimento.interesse);

  const handleDelete = async () => {
    // Delete related records first
    await supabase.from('avaliacoes').delete().eq('atendimento_id', atendimento.id);
    await supabase.from('motos_interesse').delete().eq('atendimento_id', atendimento.id);

    // Delete moto_fotos via motos_avaliacao
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

  const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) => (
    value ? (
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{value}</span>
      </div>
    ) : null
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg">{atendimento.nome_cliente}</DialogTitle>
            {sit && <span className={`status-badge text-xs px-2 py-0.5 rounded-full ${sit.color}`}>{sit.label}</span>}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <InfoRow icon={User} label="Nome" value={atendimento.nome_cliente} />
              <InfoRow icon={Phone} label="Telefone" value={formatPhone(atendimento.telefone)} />
              <InfoRow icon={User} label="Sexo" value={atendimento.sexo} />
              <InfoRow icon={MapPin} label="UF" value={atendimento.uf} />
            </CardContent>
          </Card>

          {/* Dados do Atendimento */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Atendimento</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <InfoRow icon={Store} label="Loja" value={atendimento.loja} />
              <InfoRow icon={Tag} label="Tipo" value={atendimento.tipo_atendimento} />
              <InfoRow icon={ShoppingCart} label="Interesse" value={int?.label} />
              <InfoRow icon={Tag} label="Origem" value={atendimento.origem} />
              <InfoRow icon={Thermometer} label="Temperatura" value={atendimento.temperatura} />
              <InfoRow icon={Calendar} label="Criado em" value={format(new Date(atendimento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} />
            </CardContent>
          </Card>

          {/* Observações */}
          {atendimento.observacoes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{atendimento.observacoes}</p>
              </CardContent>
            </Card>
          )}

          {/* Ações */}
          <div className="flex gap-2 justify-end pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-4 w-4" /> Excluir
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
            <Button size="sm" className="gap-1.5" onClick={() => onEdit(atendimento.id)}>
              <Edit className="h-4 w-4" /> Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AtendimentoDetail;
