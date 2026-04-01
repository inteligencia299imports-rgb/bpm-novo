import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquarePlus, MessageSquare, User, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Observacao {
  id: string;
  texto: string;
  usuario_nome: string;
  usuario_id: string;
  created_at: string;
}

interface Props {
  entityId: string;
  entityType: string;
}

const ObservacoesProcesso: React.FC<Props> = ({ entityId, entityType }) => {
  const { user, userName } = useAuth();
  const [observacoes, setObservacoes] = useState<Observacao[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchObservacoes = async () => {
    const { data } = await supabase
      .from('observacoes_processo')
      .select('*')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('created_at', { ascending: false });
    if (data) setObservacoes(data);
  };

  useEffect(() => {
    fetchObservacoes();
  }, [entityId, entityType]);

  const handleSave = async () => {
    if (!texto.trim()) {
      toast.error('Digite uma observação');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('observacoes_processo').insert({
      entity_id: entityId,
      entity_type: entityType,
      texto: texto.trim(),
      usuario_id: user?.id || '',
      usuario_nome: userName || 'Usuário',
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar observação');
      return;
    }
    toast.success('Observação registrada');
    setTexto('');
    setDialogOpen(false);
    fetchObservacoes();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('observacoes_processo').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover observação');
      return;
    }
    setObservacoes(prev => prev.filter(o => o.id !== id));
  };

  return (
    <>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Observações do Processo
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5 h-7 text-xs">
              <MessageSquarePlus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {observacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada.</p>
          ) : (
            <div className="space-y-3">
              {observacoes.map((obs) => (
                <div key={obs.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                  <p className="text-sm">{obs.texto}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{obs.usuario_nome}</span>
                      <span>·</span>
                      <span>{format(new Date(obs.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    {user?.id === obs.usuario_id && (
                      <button
                        onClick={() => handleDelete(obs.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" /> Nova Observação
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Digite a observação..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ObservacoesProcesso;
