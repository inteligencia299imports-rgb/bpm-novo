-- =====================================================================
-- avaliacoes / motos_interesse: marca e modelo passam a ser FK
-- (marca_id -> marcas_motos, modelo_id -> modelos_motos) em vez de texto
-- livre. O catalogo ja existe e as telas ja gravam via <Select> dele;
-- aqui a FK vira a unica representacao e as colunas texto sao removidas.
--
-- Rodar statement a statement (Supabase SQL Editor faz isso). O DO-block
-- de guarda aborta se sobrar qualquer linha sem match no catalogo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Semear o unico modelo ausente no catalogo
--    (avaliacoes: BMW / "R 1300 GS ADVENTURE", 1 linha)
-- ---------------------------------------------------------------------
insert into public.modelos_motos (marca_id, nome)
select mm.id, 'R 1300 GS ADVENTURE'
from public.marcas_motos mm
where upper(trim(mm.nome)) = 'BMW'
on conflict (marca_id, nome) do nothing;

-- ---------------------------------------------------------------------
-- 1) avaliacoes: colunas + backfill + NOT NULL + FK + indices
-- ---------------------------------------------------------------------
alter table public.avaliacoes
  add column if not exists marca_id  uuid,
  add column if not exists modelo_id uuid;

update public.avaliacoes a
set marca_id = mm.id
from public.marcas_motos mm
where a.marca_id is null
  and upper(trim(mm.nome)) = upper(trim(a.marca));

update public.avaliacoes a
set modelo_id = md.id
from public.modelos_motos md
where a.modelo_id is null
  and md.marca_id = a.marca_id
  and upper(trim(md.nome)) = upper(trim(a.modelo));

do $$
begin
  if (select count(*) from public.avaliacoes where marca_id is null or modelo_id is null) > 0 then
    raise exception 'avaliacoes: backfill marca_id/modelo_id incompleto (% linhas sem match)',
      (select count(*) from public.avaliacoes where marca_id is null or modelo_id is null);
  end if;
end $$;

alter table public.avaliacoes
  alter column marca_id  set not null,
  alter column modelo_id set not null;

alter table public.avaliacoes
  add constraint avaliacoes_marca_id_fkey  foreign key (marca_id)  references public.marcas_motos(id),
  add constraint avaliacoes_modelo_id_fkey foreign key (modelo_id) references public.modelos_motos(id);

create index if not exists idx_avaliacoes_marca_id  on public.avaliacoes (marca_id);
create index if not exists idx_avaliacoes_modelo_id on public.avaliacoes (modelo_id);

-- ---------------------------------------------------------------------
-- 2) motos_interesse: idem, porem NULLABLE (marca/modelo sao opcionais;
--    origem 'estoque' grava sem marca/modelo)
-- ---------------------------------------------------------------------
alter table public.motos_interesse
  add column if not exists marca_id  uuid,
  add column if not exists modelo_id uuid;

update public.motos_interesse mi
set marca_id = mm.id
from public.marcas_motos mm
where mi.marca_id is null
  and mi.marca is not null
  and upper(trim(mm.nome)) = upper(trim(mi.marca));

update public.motos_interesse mi
set modelo_id = md.id
from public.modelos_motos md
where mi.modelo_id is null
  and mi.modelo is not null
  and md.marca_id = mi.marca_id
  and upper(trim(md.nome)) = upper(trim(mi.modelo));

do $$
begin
  -- so falha se uma linha TINHA texto e nao achou id
  if (select count(*) from public.motos_interesse
      where (marca is not null and marca_id is null)
         or (modelo is not null and modelo_id is null)) > 0 then
    raise exception 'motos_interesse: backfill incompleto';
  end if;
end $$;

alter table public.motos_interesse
  add constraint motos_interesse_marca_id_fkey  foreign key (marca_id)  references public.marcas_motos(id),
  add constraint motos_interesse_modelo_id_fkey foreign key (modelo_id) references public.modelos_motos(id);

create index if not exists idx_motos_interesse_marca_id  on public.motos_interesse (marca_id);
create index if not exists idx_motos_interesse_modelo_id on public.motos_interesse (modelo_id);

-- ---------------------------------------------------------------------
-- 3) buscar_avaliacao_por_placa: passa a resolver os nomes via catalogo
--    (assinatura inalterada). Funcao sem callers hoje, mantida por API.
-- ---------------------------------------------------------------------
create or replace function public.buscar_avaliacao_por_placa(_placa text)
 returns table(marca text, modelo text, ano_fabricacao text, ano_modelo text, km text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select mm.nome, md.nome, a.ano_fabricacao, a.ano_modelo, a.km
  from avaliacoes a
  join marcas_motos  mm on mm.id = a.marca_id
  join modelos_motos md on md.id = a.modelo_id
  where regexp_replace(upper(a.placa), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(_placa), '[^A-Z0-9]', '', 'g')
  order by a.created_at desc
  limit 1;
$function$;

-- ---------------------------------------------------------------------
-- 4) relatorio_showroom_sinais / relatorio_showroom_vendidas: DROP.
--    Ja estavam quebradas (referenciam a tabela "estoque", removida ao
--    virar "estoque_motos") e sem nenhum caller -- o front usa
--    src/lib/showroomMetrics.ts. Removidas para nao deixar codigo morto
--    referenciando colunas que vao sumir.
-- ---------------------------------------------------------------------
drop function if exists public.relatorio_showroom_sinais(timestamp with time zone, timestamp with time zone, text, text);
drop function if exists public.relatorio_showroom_vendidas(timestamp with time zone, timestamp with time zone, text, text);

-- ---------------------------------------------------------------------
-- 5) Derrubar as colunas texto
-- ---------------------------------------------------------------------
alter table public.avaliacoes      drop column marca, drop column modelo;
alter table public.motos_interesse drop column marca, drop column modelo;
