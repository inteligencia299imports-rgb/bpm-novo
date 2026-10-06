import React, { useState, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
import { FileText, User, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { BPM_PROJETO_ID } from '@/lib/projeto';
import { firstLastName } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Observações da preparação (tabela observacoes_preparacao). Mesmo layout de
// AtendimentoObservacoes, sem botão de adicionar: o registro vem do botão
// "Observação" das Ações da tela de Preparação, com o texto de "Detalhes da
// movimentação". Não mexe em status nem no histórico de movimentações.

interface Nota {
  id: string;
  observacao: string;
  created_at: string;
  created_by: string | null;
  usuario_nome: string;
}

interface Props {
  avaliacaoId: string;
  /** Muda a cada observação registrada, para recarregar a lista. */
  refreshKey?: number;
}

const PreparacaoObservacoes: React.FC<Props> = ({ avaliacaoId, refreshKey }) => {
  const { user, role } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);

  const fetchNotas = async () => {
    // Tabela nova, ainda fora dos tipos gerados do Supabase -> cast.
    const { data } = await (supabase as any)
      .from('observacoes_preparacao')
      .select('id, observacao, created_at, created_by')
      .eq('avaliacao_id', avaliacaoId)
      .order('created_at', { ascending: false });
    if (!data) return;
    const userIds = [...new Set((data as any[]).map(n => n.created_by).filter(Boolean))] as string[];
    let nomeMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: roles } = await supabase.from('user_roles').select('user_id, nome').in('user_id', userIds).eq('projeto_id', BPM_PROJETO_ID);
      nomeMap = Object.fromEntries((roles || []).map((r) => [r.user_id, firstLastName(r.nome)]));
    }
    setNotas((data as any[]).map(n => ({ ...n, usuario_nome: (n.created_by && nomeMap[n.created_by]) || 'Usuário' })));
  };

  useEffect(() => {
    if (avaliacaoId) fetchNotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avaliacaoId, refreshKey]);

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from('observacoes_preparacao').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover observação');
      return;
    }
    setNotas(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Observações</span>
      </div>
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
    </div>
  );
};

export default PreparacaoObservacoes;
