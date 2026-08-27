-- Marcas e modelos de exemplo, para popular os dropdowns de moto
-- (useMarcasModelos) enquanto o catalogo real nao e cadastrado.

insert into public.marcas_motos (nome) values
  ('Honda'),
  ('Yamaha'),
  ('Ducati'),
  ('BMW'),
  ('Kawasaki'),
  ('Suzuki'),
  ('Harley-Davidson'),
  ('Triumph'),
  ('Royal Enfield'),
  ('Aprilia')
on conflict do nothing;

insert into public.modelos_motos (marca_id, nome)
select m.id, v.nome
from (values
  ('Honda', 'CB 500F'),
  ('Honda', 'CB 500X'),
  ('Honda', 'CB 650R'),
  ('Honda', 'CBR 650R'),
  ('Honda', 'XRE 300'),
  ('Honda', 'PCX 160'),
  ('Yamaha', 'MT-03'),
  ('Yamaha', 'MT-07'),
  ('Yamaha', 'MT-09'),
  ('Yamaha', 'Fazer 250'),
  ('Yamaha', 'Tenere 250'),
  ('Yamaha', 'XMAX 250'),
  ('Ducati', 'Monster 937'),
  ('Ducati', 'Panigale V2'),
  ('Ducati', 'Panigale V4'),
  ('Ducati', 'Multistrada V4'),
  ('Ducati', 'Scrambler Icon'),
  ('BMW', 'G 310 R'),
  ('BMW', 'F 850 GS'),
  ('BMW', 'R 1250 GS'),
  ('BMW', 'S 1000 RR'),
  ('Kawasaki', 'Ninja 400'),
  ('Kawasaki', 'Ninja 650'),
  ('Kawasaki', 'Z400'),
  ('Kawasaki', 'Versys 650'),
  ('Suzuki', 'GSX-S750'),
  ('Suzuki', 'GSX-R1000'),
  ('Suzuki', 'V-Strom 650'),
  ('Harley-Davidson', 'Iron 883'),
  ('Harley-Davidson', 'Fat Boy'),
  ('Harley-Davidson', 'Sportster S'),
  ('Triumph', 'Street Triple 765'),
  ('Triumph', 'Tiger 900'),
  ('Triumph', 'Bonneville T120'),
  ('Royal Enfield', 'Meteor 350'),
  ('Royal Enfield', 'Interceptor 650'),
  ('Aprilia', 'RS 660'),
  ('Aprilia', 'Tuono 660')
) as v(marca_nome, nome)
join public.marcas_motos m on m.nome = v.marca_nome
on conflict do nothing;
