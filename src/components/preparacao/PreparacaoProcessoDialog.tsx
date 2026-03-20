import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Loader2, Save, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PREPARACAO_COLUMNS } from '@/types/crm';


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacaoId: string;
  currentStatus: string;
  onStatusChanged?: (newStatus: string) => void;
}

interface HistoryEntry {
  id: string;
  status_from: string;
  status_to: string;
  observacoes: string | null;
  changed_by_name: string | null;
  created_at: string;
}

const getStatusLabel = (value: string) => PREPARACAO_COLUMNS.find(c => c.value === value)?.label || value;
const getStatusHex = (value: string) => PREPARACAO_COLUMNS.find(c => c.value === value)?.hex || '#888';

const PreparacaoProcessoDialog: React.FC<Props> = ({ open, onOpenChange, avaliacaoId, currentStatus, onStatusChanged }) => {
  const { userRole } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [detalhes, setDetalhes] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedStatus(currentStatus);
    setDetalhes('');
    const loadHistory = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('status_history')
        .select('*')
        .eq('entity_id', avaliacaoId)
        .eq('entity_type', 'preparacao')
        .order('created_at', { ascending: false });
      setHistory((data as HistoryEntry[]) || []);
      setLoading(false);
    };
    loadHistory();
  }, [open, avaliacaoId, currentStatus]);

  const handleSave = async () => {
    if (selectedStatus === currentStatus && !detalhes.trim()) {
      toast.error('Selecione um novo status ou adicione detalhes');
      return;
    }
    setSaving(true);
    try {
      // Get user info
      const { data: { user } } = await supabase.auth.getUser();
      let userName = 'Usuário';
      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('nome')
          .eq('user_id', user.id)
          .maybeSingle();
        if (roleData?.nome) userName = roleData.nome;
      }

      // Update status if changed
      if (selectedStatus !== currentStatus) {
        await supabase
          .from('avaliacoes')
          .update({ preparacao_status: selectedStatus } as any)
          .eq('id', avaliacaoId);
      }

      // Insert history entry
      await supabase.from('status_history').insert({
        entity_id: avaliacaoId,
        entity_type: 'preparacao',
        status_from: currentStatus,
        status_to: selectedStatus,
        observacoes: detalhes.trim() || null,
        changed_by: user?.id || null,
        changed_by_name: userName,
      });

      toast.success('Processo salvo com sucesso!');
      onStatusChanged?.(selectedStatus);
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar processo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Processo de Preparação
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Status Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREPARACAO_COLUMNS.map(col => (
                    <SelectItem key={col.value} value={col.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.hex }} />
                        {col.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Detalhes</label>
              <Textarea
                placeholder="Descreva os detalhes da movimentação..."
                value={detalhes}
                onChange={e => setDetalhes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>

            <Separator />

            {/* History */}
            <div className="space-y-2 min-h-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Histórico de Movimentações</span>
              </div>

              <div className="overflow-y-auto max-h-[200px] space-y-2 pr-1" style={{ scrollbarWidth: 'thin', scrollbarGutter: 'stable' }}>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="bg-muted/50 rounded-lg p-3 space-y-1 border border-border/50">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]" style={{ borderColor: getStatusHex(h.status_from), color: getStatusHex(h.status_from) }}>
                            {getStatusLabel(h.status_from)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">→</span>
                          <Badge className="text-[10px]" style={{ backgroundColor: `${getStatusHex(h.status_to)}20`, color: getStatusHex(h.status_to) }}>
                            {getStatusLabel(h.status_to)}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(h.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {h.observacoes && (
                        <p className="text-xs text-muted-foreground">{h.observacoes}</p>
                      )}
                      {h.changed_by_name && (
                        <p className="text-[10px] text-muted-foreground/70">por {h.changed_by_name}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PreparacaoProcessoDialog;
