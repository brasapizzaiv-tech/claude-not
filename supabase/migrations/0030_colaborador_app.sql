-- "App" pessoal do colaborador: link permanente (token) + PIN de 4 dígitos.
alter table public.colaboradores
  add column if not exists token text,
  add column if not exists pin text;

update public.colaboradores
   set token = substr(md5(random()::text || id::text), 1, 16)
 where token is null;

create unique index if not exists idx_colaboradores_token
  on public.colaboradores (token);

-- Status do colaborador pelo token (nome + se já tem PIN). Não expõe o PIN.
create or replace function public.colaborador_status(p_token text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('nome', nome, 'tem_pin', pin is not null)
  from colaboradores where token = p_token and ativo;
$$;

-- Define o PIN na primeira vez (só se ainda não tiver).
create or replace function public.colaborador_definir_pin(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update colaboradores set pin = p_pin
   where token = p_token and ativo and pin is null;
  get diagnostics v_ok = row_count;
  return jsonb_build_object('ok', v_ok > 0);
end; $$;

-- Home do colaborador: valida o PIN e devolve as contagens ativas dele.
create or replace function public.colaborador_home(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text; v_pin text;
begin
  select id, nome, pin into v_id, v_nome, v_pin
    from colaboradores where token = p_token and ativo;
  if not found then return null; end if;
  if v_pin is not null and v_pin <> p_pin then
    return jsonb_build_object('erro', 'pin');
  end if;
  return jsonb_build_object(
    'nome', v_nome,
    'contagens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token', cl.token, 'descricao', c.descricao, 'data', c.data
      ) order by c.criado_em desc)
      from contagem_links cl
      join contagens c on c.id = cl.contagem_id
      where cl.colaborador_id = v_id and c.status <> 'finalizada'
    ), '[]'::jsonb)
  );
end; $$;

grant execute on function public.colaborador_status(text) to anon, authenticated;
grant execute on function public.colaborador_definir_pin(text, text) to anon, authenticated;
grant execute on function public.colaborador_home(text, text) to anon, authenticated;
