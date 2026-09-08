-- Agregados passam a ser por empresa.
alter table agregados_motos
  add column if not exists empresa_id uuid references empresas(id);

create index if not exists idx_agregados_motos_empresa on agregados_motos(empresa_id);

-- Os agregados de exemplo (seed inicial, valor 0, sem empresa) não fazem mais
-- sentido sem empresa — remove os que ninguém usou.
delete from agregados_motos a
where a.empresa_id is null
  and not exists (select 1 from contratos_agregados ca where ca.agregado_id = a.id);
