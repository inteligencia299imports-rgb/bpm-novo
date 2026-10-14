import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  /** Data do contrato editável junto (ex.: proposta de compra de moto convertida,
   *  criada depois da NF sem data — achado QKG8B90, 2026-10-14). */
  data?: Date;
  setData?: (d: Date | undefined) => void;
  /** Coluna da data no contrato (contratos: data_sinal). */
  colunaData?: string;
}

const ObservacoesEditaveis: React.FC<Props> = ({ tabela, contratoId, obsInternas, obsContrato, setObsInternas, setObsContrato, criarContrato, data, setData, colunaData }) => {
  const comData = !!setData && !!colunaData;
  const dataStr = data ? format(data, 'yyyy-MM-dd') : null;
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Valores gravados — o botão só habilita quando há alteração.
  const salvo = useRef({ internas: obsInternas, contrato: obsContrato, data: dataStr });
  const [, forceRender] = useState(0);
  useEffect(() => {
    salvo.current = { internas: obsInternas, contrato: obsContrato, data: dataStr };
    forceRender((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);
  const alterado = obsInternas !== salvo.current.internas || obsContrato !== salvo.current.contrato
    || (comData && dataStr !== salvo.current.data);

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
        .update({
          observacoes_internas: obsInternas.trim() || null,
          observacoes_contrato: obsContrato.trim() || null,
          ...(comData ? { [colunaData!]: dataStr } : {}),
        } as any)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || (data as any[]).length === 0) throw new Error('Sem permissão para alterar esta proposta.');
      salvo.current = { internas: obsInternas, contrato: obsContrato, data: dataStr };
      toast.success('Salvo. Gere o PDF de novo para sair atualizado.');
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
      {comData && (
        <div className="space-y-1.5 max-w-xs">
          <Label>Data do Contrato</Label>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !data && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {data ? format(data, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar data'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={data} onSelect={(d) => { setData!(d); setCalOpen(false); }} disabled={{ after: new Date() }} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={saving || !alterado || (!contratoId && !criarContrato)} onClick={salvar}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {comData ? 'Salvar' : 'Salvar observações'}
        </Button>
      </div>
    </div>
  );
};

export default ObservacoesEditaveis;
