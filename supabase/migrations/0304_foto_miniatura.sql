-- Miniatura das fotos do cardápio (DES-006 parte 2, Onda 4). O app do cliente
-- (/pedir) mostra a foto em 48 a 144 px, mas baixava a original (~130 KB cada,
-- 6,4 MB no total; 23,5 s no 4G). A miniatura (400 px, ~20 KB) é gerada no
-- servidor quando a foto é cadastrada; sem ela, a tela usa a foto grande.
alter table public.pdv_itens add column if not exists foto_mini_url text;
alter table public.pdv_pizza_sabores add column if not exists foto_mini_url text;

notify pgrst, 'reload schema';
