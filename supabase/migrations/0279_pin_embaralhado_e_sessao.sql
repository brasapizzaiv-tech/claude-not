-- PIN embaralhado no banco e celular sem o PIN (auditoria SEC-05, 09/11/2026).
--
-- 1) colaboradores.pin deixa de guardar os 4 números: guarda "h1:" + HMAC-SHA256
--    do PIN com uma pimenta secreta (privado.colab_pin_pimenta) e o id da pessoa.
--    Quem lê a tabela pela API (qualquer login da empresa, SEC-04) não vê o PIN e
--    não consegue testar os 10 mil sem a pimenta, que fica num esquema que a API
--    não enxerga.
-- 2) O cookie eu_{token} do celular deixa de guardar o PIN: guarda uma chave de
--    acesso "s1.<64 hex>" (privado.colab_sessoes, só o hash). Trocar/zerar o PIN,
--    desligar a pessoa ou trocar o link derruba as chaves. Cookie antigo (com o
--    PIN) ainda entra e é trocado sozinho pela tela inicial do app.
-- Toda conferência continua passando por colab_pin_ok (0278); com a chave de
-- acesso válida a pessoa entra mesmo se alguém travou o PIN dela de propósito.

create schema if not exists privado;
revoke all on schema privado from public;
revoke all on schema privado from anon, authenticated;

create table if not exists privado.colab_pin_pimenta (
  id int primary key default 1 check (id = 1),
  valor text not null
);
insert into privado.colab_pin_pimenta (id, valor)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create table if not exists privado.colab_sessoes (
  segredo_hash text primary key,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists colab_sessoes_colab_idx on privado.colab_sessoes (colaborador_id);

create or replace function privado.colab_pin_hash(p_id uuid, p_pin text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'h1:' || encode(extensions.hmac(p_pin, (select valor from privado.colab_pin_pimenta where id = 1) || ':' || p_id::text, 'sha256'), 'hex');
$$;
revoke all on function privado.colab_pin_hash(uuid, text) from public, anon, authenticated;

-- Os 35 PINs de hoje viram hash (os 4 números somem do banco).
update public.colaboradores set pin = privado.colab_pin_hash(id, pin) where pin ~ '^\d{4}$';

-- Conferência única: PIN (conta erro, trava) ou chave de acesso do celular.
create or replace function public.colab_pin_ok(p_token text, p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid; v_pin text; v_trava timestamptz; v_erros int;
begin
  select id, pin into v_id, v_pin from colaboradores where token = p_token and ativo;
  if v_id is null then return true; end if;   -- quem chama já trata "não achou"
  if v_pin is null then return true; end if;  -- ainda sem PIN: regra antiga

  if coalesce(p_pin, '') = '' then return false; end if;

  -- Chave de acesso do celular: 64 hex aleatórios, não dá pra chutar; errada só recusa.
  if left(p_pin, 3) = 's1.' then
    return exists (select 1 from privado.colab_sessoes s
                    where s.colaborador_id = v_id
                      and s.segredo_hash = encode(extensions.digest(p_pin, 'sha256'), 'hex'));
  end if;

  select travado_ate into v_trava from colaborador_pin_tentativas where colaborador_id = v_id;
  if v_trava is not null and v_trava > now() then return false; end if;

  if p_pin ~ '^\d{4}$' and v_pin = privado.colab_pin_hash(v_id, p_pin) then
    delete from colaborador_pin_tentativas where colaborador_id = v_id;
    return true;
  end if;

  insert into colaborador_pin_tentativas as t (colaborador_id, erros, travado_ate, atualizado_em)
  values (v_id, 1, null, now())
  on conflict (colaborador_id) do update
    set erros = case when t.travado_ate is not null or t.atualizado_em < now() - interval '15 minutes'
                     then 1 else t.erros + 1 end,
        travado_ate = null,
        atualizado_em = now()
  returning erros into v_erros;

  if v_erros >= 5 then
    update colaborador_pin_tentativas set travado_ate = now() + interval '15 minutes'
     where colaborador_id = v_id;
  end if;
  return false;
end;
$$;

-- Criar o PIN (primeira vez): guarda já embaralhado.
create or replace function public.colaborador_definir_pin(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if coalesce(p_pin, '') !~ '^\d{4}$' then return jsonb_build_object('ok', false); end if;
  update colaboradores set pin = privado.colab_pin_hash(id, p_pin)
   where token = p_token and ativo and pin is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end; $$;

-- Troca o PIN digitado por uma chave de acesso pro cookie do celular.
-- PIN errado conta tentativa (passa pela colab_pin_ok).
create or replace function public.colab_criar_sessao(p_token text, p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid; v_pin text; v_seg text;
begin
  if coalesce(p_pin, '') !~ '^\d{4}$' then return null; end if;
  select id, pin into v_id, v_pin from colaboradores where token = p_token and ativo;
  if v_id is null or v_pin is null then return null; end if;
  if not public.colab_pin_ok(p_token, p_pin) then return null; end if;
  v_seg := 's1.' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into privado.colab_sessoes (segredo_hash, colaborador_id)
  values (encode(extensions.digest(v_seg, 'sha256'), 'hex'), v_id);
  -- Faxina: chave com mais de 1 ano não vale mais.
  delete from privado.colab_sessoes where colaborador_id = v_id and criado_em < now() - interval '365 days';
  return v_seg;
end;
$$;

-- "Sair deste aparelho": a chave deste celular deixa de valer.
create or replace function public.colab_encerrar_sessao(p_token text, p_segredo text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from privado.colab_sessoes s
   using colaboradores c
   where c.id = s.colaborador_id and c.token = p_token
     and s.segredo_hash = encode(extensions.digest(coalesce(p_segredo, ''), 'sha256'), 'hex');
$$;

-- Zerar/trocar o PIN, desligar ou trocar o link: as chaves dos celulares caem.
create or replace function privado.colab_derruba_sessoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin is distinct from old.pin or new.token is distinct from old.token or (old.ativo and not new.ativo) then
    delete from privado.colab_sessoes where colaborador_id = new.id;
    delete from colaborador_pin_tentativas where colaborador_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists colab_derruba_sessoes on public.colaboradores;
create trigger colab_derruba_sessoes after update on public.colaboradores
  for each row execute function privado.colab_derruba_sessoes();
