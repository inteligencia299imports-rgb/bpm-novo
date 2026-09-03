import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquarePlus, FileText, Plus, User, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { BPM_PROJETO_ID } from '@/lib/projeto';
import { firstLastName } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Nota {
  id: string;
  observacao: string;
  created_at: string;
  created_by: string | null;
  usuario_nome: string;
}

interface Props {
  idOperacao: string;
}

const AtendimentoObservacoes: React.FC<Props> = ({ idOperacao }) => {
  const { user, userName, role } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNotas = async () => {
    const { data } = await supabase
      .from('observacoes')
      .select('id, observacao, created_at, created_by')
      .eq('id_operacao', idOperacao)
      .order('created_at', { ascending: false });
    if (!data) return;
    const userIds = [...new Set(data.map(n => n.created_by).filter(Boolean))] as string[];
    let nomeMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', userIds).eq('projeto_id', BPM_PROJETO_ID);
      nomeMap = Object.fromEntries((roles || []).map((r) => [r.user_id, firstLastName(r.nome)]));
    }
    setNotas(data.map(n => ({ ...n, usuario_nome: (n.created_by && nomeMap[n.created_by]) || 'Usuário' })));
  };

  useEffect(() => {
    fetchNotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idOperacao]);

  const handleSave = async () => {
    if (!texto.trim()) {
      toast.error('Digite uma observação');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('observacoes').insert({
      id_operacao: idOperacao,
      observacao: texto.trim(),
      created_by: user?.id || null,
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
            <Button size="icon" variant="ghost" onClick={() => setDialogOpen(true)} className="h-7 w-7" title="Adicionar observação">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notas.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada.</p>
          ) : (
            <div>
              {notas.map((n, idx) => (
                <React.Fragment key={n.id}>
                  {idx > 0 && <Separator className="my-3" />}
                  <div className="space-y-1">
                    <p className="text-xs whitespace-pre-wrap">{n.observacao}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(n.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {n.usuario_nome}
                        </span>
                      </div>
                      {(role === 'master' || n.created_by === user?.id) && (
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
                </React.Fragment>
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
