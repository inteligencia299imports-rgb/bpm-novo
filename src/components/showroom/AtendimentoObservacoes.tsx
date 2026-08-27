import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquarePlus, FileText, User, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Nota {
  id: string;
  observacao: string;
  created_at: string;
  user_id: string | null;
  usuario_nome: string;
}

interface Props {
  atendimentoId: string;
}

const AtendimentoObservacoes: React.FC<Props> = ({ atendimentoId }) => {
  const { user, userName, role } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNotas = async () => {
    const { data } = await supabase
      .from('observacoes')
      .select('id, observacao, created_at, user_id')
      .eq('id_operacao', atendimentoId)
      .order('created_at', { ascending: false });
    if (!data) return;
    const userIds = [...new Set(data.map(n => n.user_id).filter(Boolean))] as string[];
    let nomeMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', userIds);
      nomeMap = Object.fromEntries((roles || []).map((r) => [r.user_id, r.nome]));
    }
    setNotas(data.map(n => ({ ...n, usuario_nome: (n.user_id && nomeMap[n.user_id]) || 'Usuário' })));
  };

  useEffect(() => {
    fetchNotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendimentoId]);

  const handleSave = async () => {
    if (!texto.trim()) {
      toast.error('Digite uma observação');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('observacoes').insert({
      id_operacao: atendimentoId,
      observacao: texto.trim(),
      user_id: user?.id || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar observação');
      return;
    }
    toast.success('Observação registrada');
    setTexto('');
    setDialogOpen(false);
    fetchNotas();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('observacoes').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover observação');
      return;
    }
    setNotas(prev => prev.filter(n => n.id !== id));
  };

  return (
    <>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Observações
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5 h-7 text-xs">
              <MessageSquarePlus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notas.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada.</p>
          ) : (
            <div className="space-y-3">
              {notas.map((n) => (
                <div key={n.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                  <p className="text-sm whitespace-pre-wrap">{n.observacao}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{n.usuario_nome}</span>
                      <span>·</span>
                      <span>{format(new Date(n.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    {role === 'master' && (
                      <button
                        onClick={() => handleDelete(n.id)}
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

export default AtendimentoObservacoes;
