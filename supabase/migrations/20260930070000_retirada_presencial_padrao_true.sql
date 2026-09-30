-- Retirada presencial passa a ser o padrão de toda venda de moto (pedido do usuário,
-- 2026-09-30). Atendimento presencial é sempre retirada presencial (a tela trava o checkbox e
-- a emissão força); só o online pode desmarcar ("Retirada não presencial gera DIFAL").
alter table public.atendimentos_motos alter column retirada_presencial set default true;

-- Atendimentos existentes viram retirada presencial, menos os que já têm NF-e de venda
-- autorizada em produção (não reescreve o que já foi declarado à SEFAZ).
update public.atendimentos_motos a set retirada_presencial = true
where a.retirada_presencial = false
  and not exists (
    select 1 from public.nfe_entradas n
    where n.atendimento_id = a.id and n.ambiente = 'producao' and n.status = 'processada'
      and n.operacao in ('venda_0km', 'venda_seminova')
  );
