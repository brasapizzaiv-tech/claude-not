-- ETAPA 1 DO MULTIEMPRESA — de quem é este acesso?
--
-- Até aqui a função `empresa_atual()` respondia "Brasa" e ponto (migration
-- 0175). Isso bastava enquanto só existia uma empresa. Agora ela passa a
-- responder de verdade: pelo perfil de quem entrou.
--
-- Nada de dado muda nesta migration. Todo mundo que existe hoje continua na
-- Brasa, e todas as regras que já usam `empresa_atual()` continuam devolvendo
-- exatamente o mesmo resultado. É só o caminho da resposta que fica pronto.

-- ---------- 1. De quem é cada pessoa ----------
-- `profiles` é quem entra com e-mail e senha (dono, caixa, gestão).
-- `colaboradores` é quem entra por link pessoal (garçom, cozinha, entregador).
-- Os dois precisam dizer de que empresa são.
alter table public.profiles
  add column if not exists empresa_id uuid
    not null default public.empresa_atual()
    references public.empresas (id);

alter table public.colaboradores
  add column if not exists empresa_id uuid
    not null default public.empresa_atual()
    references public.empresas (id);

create index if not exists profiles_empresa_idx      on public.profiles (empresa_id);
create index if not exists colaboradores_empresa_idx on public.colaboradores (empresa_id);

-- ---------- 2. A resposta de verdade ----------
-- `security definer` porque a função precisa ler o perfil de quem chamou sem
-- depender das regras de leitura da própria tabela `profiles` — se dependesse,
-- daria voltas em círculo (a regra chama a função que chama a regra).
create or replace function public.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1º: a empresa de quem está logado.
    (select p.empresa_id from public.profiles p where p.id = auth.uid()),

    -- 2º: rede de segurança que SE DESARMA SOZINHA. Enquanto existe uma única
    -- empresa cadastrada, um acesso sem perfil continua enxergando a Brasa —
    -- que é exatamente o comportamento de hoje, e é o que impede esta
    -- migration de quebrar alguma coisa.
    --
    -- No instante em que a segunda empresa for criada, este trecho para de
    -- devolver valor e o acesso sem perfil passa a não enxergar nada. É de
    -- propósito: um esquecimento aqui vira "ninguém vê" e não "todo mundo vê".
    (select e.id from public.empresas e
      where (select count(*) from public.empresas) = 1)
  )
$$;

grant execute on function public.empresa_atual() to anon, authenticated, service_role;

comment on function public.empresa_atual() is
  'Empresa do acesso atual, pelo perfil de quem entrou. Devolve nulo quando não dá pra saber e existe mais de uma empresa. Etapa 1 do multiempresa.';

-- ---------- 3. O usuário novo nasce na empresa certa ----------
-- Quem cria usuário é o dono, pela tela de Usuários, e isso roda com a chave
-- administrativa — que não tem "quem sou eu". Então `empresa_atual()` não
-- serve aqui: a empresa vem escrita junto com o convite.
--
-- Sem isto, no dia em que existir a segunda empresa, criar usuário quebraria
-- com um erro incompreensível. Melhor resolver agora, que é barato.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  emp uuid;
begin
  emp := coalesce(
    nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid,
    public.empresa_atual()
  );
  if emp is null then
    raise exception 'Usuário novo sem empresa: quem convidou precisa informar a empresa.';
  end if;
  insert into public.profiles (id, nome, empresa_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email), emp);
  return new;
end;
$$;

-- ---------- 4. A fachada da loja é pública ----------
-- A política de 0184 abria a leitura de `empresas` pra quem não está logado,
-- porque o cardápio do cliente (/pedir) e os apps por link precisam da cor e
-- do logo. Continua valendo, com duas correções: vale também pra quem ESTÁ
-- logado (a política antiga só cobria anônimo, e a de logado só deixava ver a
-- própria — o que impede o dono de escolher entre empresas mais adiante), e
-- some a empresa desativada.
--
-- O que a tabela guarda é nome, apelido, cores e logo: a fachada da loja, que
-- é pública por natureza. Segredo nenhum mora aqui.
drop policy if exists empresas_leitura_publica on public.empresas;
drop policy if exists empresas_propria on public.empresas;
create policy empresas_leitura_publica on public.empresas
  for select to anon, authenticated using (ativo);
