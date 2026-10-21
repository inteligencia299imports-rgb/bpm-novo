-- Moto do estoque em "Serviço" (voltou pra preparação/oficina) pode ser vendida,
-- mas o status do estoque CONTINUA "Serviço" até a conclusão; só então vira
-- Sinal/Vendido conforme o atendimento (pedido do usuário, 2026-10-21 —
-- achado RER3A16). Vale pra qualquer tela que grave o estoque.

create or replace function public.estoque_moto_servico_segura_venda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_situacao text;
begin
  if old.status is distinct from 'servico' then
    return new;
  end if;

  -- 1) Sinal/venda registrados com a moto ainda em serviço: grava o vínculo e
  --    os valores, mas o status segue "Serviço".
  if new.status in ('sinal', 'vendido') then
    new.status := 'servico';
    return new;
  end if;

  if new.status = 'disponivel' then
    -- 2) Atendimento perdido/cancelado (vínculo removido) com a moto ainda em
    --    serviço: continua em serviço, só sem a venda.
    if old.atendimento_venda_id is not null and new.atendimento_venda_id is null then
      new.status := 'servico';
      return new;
    end if;
    -- 3) Conclusão do serviço com venda/sinal pendente: aplica o status do atendimento.
    if new.atendimento_venda_id is not null then
      select situacao into v_situacao from public.atendimentos_motos where id = new.atendimento_venda_id;
      new.status := case v_situacao when 'vendido' then 'vendido' when 'sinal' then 'sinal' else 'disponivel' end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estoque_moto_servico_segura_venda on public.estoque_motos;
create trigger trg_estoque_moto_servico_segura_venda
  before update of status, atendimento_venda_id on public.estoque_motos
  for each row execute function public.estoque_moto_servico_segura_venda();

-- Conclusão do serviço: a preparação voltou pra "estoque" (Concluir preparação
-- no BPM ou O.S. finalizada no ofc via mover_moto_frota_oficina) → libera a
-- moto que estava em "Serviço"; o gatilho acima aplica Sinal/Vendido se houver.
create or replace function public.estoque_moto_libera_servico_na_conclusao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.preparacao_status = 'estoque' and old.preparacao_status is distinct from 'estoque' then
    update public.estoque_motos
       set status = 'disponivel', observacoes = null, updated_at = now()
     where avaliacao_id = new.id and status = 'servico';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estoque_moto_libera_servico on public.avaliacoes;
create trigger trg_estoque_moto_libera_servico
  after update of preparacao_status on public.avaliacoes
  for each row execute function public.estoque_moto_libera_servico_na_conclusao();
