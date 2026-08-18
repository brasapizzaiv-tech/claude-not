-- Marmitas (Kern): janela de pedido do dia seguinte.
-- Abre às 14:00 da véspera e fecha às 08:30 do dia da entrega.
insert into public.mkt_config (chave, valor) values ('horaAbertura', '14:00')
  on conflict (chave) do nothing;
insert into public.mkt_config (chave, valor) values ('horaLimite', '08:30')
  on conflict (chave) do update set valor = excluded.valor;
