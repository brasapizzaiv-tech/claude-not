-- A TV do rodízio consultava a fila a cada 3 s (28 mil chamadas por dia na
-- Vercel). Agora o banco AVISA a TV quando um pedido muda, pelo Realtime
-- (broadcast num canal público "tv-rodizio:<empresa>"), e a TV só consulta
-- quando recebe o aviso, mais uma consulta de segurança a cada 30 s.
-- O aviso não carrega dado nenhum do pedido: só "mudou". Quem lê a fila
-- continua sendo a rota protegida pela chave da TV.
create or replace function public.pedidos_rodizio_avisar_tv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := coalesce(new.empresa_id, old.empresa_id);
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', coalesce(new.id, old.id), 'op', tg_op),
      'mudou',
      'tv-rodizio:' || coalesce(v_empresa::text, 'sem-empresa'),
      false
    );
  exception when others then
    -- Aviso é cortesia: nunca pode travar o pedido do garçom.
    null;
  end;
  return null;
end;
$$;

drop trigger if exists pedidos_rodizio_avisar_tv on public.pedidos_rodizio;
create trigger pedidos_rodizio_avisar_tv
  after insert or update or delete on public.pedidos_rodizio
  for each row execute function public.pedidos_rodizio_avisar_tv();
