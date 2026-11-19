-- Robô de NPS: Instagram da loja na mensagem de agradecimento. Pedido do usuário, 2026-11-19.
alter table public.nps_bot_lojas add column if not exists instagram text;

update public.nps_bot_lojas set instagram = v.instagram
  from (values
    ('Ducati FLN', 'https://www.instagram.com/ducatifloripa/'),
    ('Ducati BSB', 'https://www.instagram.com/ducati.brasilia/'),
    ('Ducati POA', 'https://www.instagram.com/ducatipoa/'),
    ('299i',       'https://www.instagram.com/299imports/'),
    ('299s',       'https://www.instagram.com/299imports/'),
    ('299f',       'https://www.instagram.com/299imports/'),
    ('299p',       'https://www.instagram.com/299imports/'),
    -- Aventura divide a ficha do Google com a Ducati BSB.
    ('Aventura',   'https://www.instagram.com/ducati.brasilia/')
  ) v(loja, instagram)
 where nps_bot_lojas.loja = v.loja;
