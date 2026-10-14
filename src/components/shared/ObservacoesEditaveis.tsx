import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

/**
 * Observações da proposta sempre editáveis — inclusive depois da NF-e emitida,
 * quando o resto da proposta fica somente leitura (pedido do usuário,
 * 2026-10-14). Grava só observacoes_internas / observacoes_contrato da linha
 * do contrato, sem passar pelo salvar completo da proposta (que é bloqueado
 * após a NF e dispararia regeração de compromissos etc.).
 */
interface Props {
  tabela: 'contratos' | 'contratos_consignacao' | 'contratos_consignante';
  contratoId: string | null;
  obsInternas: string;
  obsContrato: string;
  setObsInternas: (v: string) => void;
  setObsContrato: (v: string) => void;
  /** Cria a linha do contrato quando ela ainda não existe (ex.: moto convertida
   *  pela transferência de estoque, que emite as NFs sem nunca salvar a proposta
   *  de compra — achado OVQ9B54, 2026-10-14). Devolve o id criado. */
  criarContrato?: () => Promise<string | null>;
}

const ObservacoesEditaveis: React.FC<Props> = ({ tabela, contratoId, obsInternas, obsContrato, setObsInternas, setObsContrato, criarContrato }) => {
  const [saving, setSaving] = useState(false);
  // Valores gravados — o botão só habilita quando há alteração.
  const salvo = useRef({ internas: obsInternas, contrato: obsContrato });
  const [, forceRender] = useState(0);
  useEffect(() => {
    salvo.current = { internas: obsInternas, contrato: obsContrato };
    forceRender((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);
  const alterado = obsInternas !== salvo.current.internas || obsContrato !== salvo.current.contrato;

  const salvar = async () => {
    if (!contratoId && !criarContrato) {
      toast.error('Proposta ainda não salva — não há onde gravar as observações.');
      return;
    }
    setSaving(true);
    try {
      const id = contratoId || (await criarContrato!());
      if (!id) throw new Error('não foi possível criar a proposta');
      const { data, error } = await supabase
        .from(tabela as any)
        .update({ observacoes_internas: obsInternas.trim() || null, observacoes_contrato: obsContrato.trim() || null } as any)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || (data as any[]).length === 0) throw new Error('Sem permissão para alterar esta proposta.');
      salvo.current = { internas: obsInternas, contrato: obsContrato };
      toast.success('Observações salvas. Gere o PDF de novo para sair com o texto atualizado.');
    } catch (e: any) {
      toast.error('Erro ao salvar observações: ' + (e?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Observações Internas</Label>
        <Textarea rows={3} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} placeholder="Observações internas..." />
      </div>
      <div className="space-y-1.5">
        <Label>Observações do Contrato</Label>
        <Textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} placeholder="Observações do contrato..." />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={saving || !alterado || (!contratoId && !criarContrato)} onClick={salvar}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar observações
        </Button>
      </div>
    </div>
  );
};

export default ObservacoesEditaveis;
