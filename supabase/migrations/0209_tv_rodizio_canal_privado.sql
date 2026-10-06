-- O aviso "mudou" mandado pelo banco (realtime.send, migration 0207) só chega
-- em CANAL PRIVADO do Realtime — canal público não recebe nada vindo do
-- banco (testado em 06/10/2026). Canal privado exige uma regra em
-- realtime.messages dizendo quem pode ler o tópico: aqui, qualquer um
-- (anon) pode ouvir "tv-rodizio:*", porque o aviso não carrega dado nenhum —
-- a fila continua saindo só pela rota protegida pela chave da TV.
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
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop policy if exists tv_rodizio_ouvir on realtime.messages;
create policy tv_rodizio_ouvir on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() like 'tv-rodizio:%' and extension = 'broadcast');
