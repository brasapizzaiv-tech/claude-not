-- Perfis e colaboradores protegidos (auditoria, Etapa 5, 08/11/2026).
-- Antes: profiles e colaboradores tinham a regra `using (true) with check (true)`
-- (migrations 0001 e 0005). Qualquer pessoa logada gravava papel = 'dono' e as
-- próprias permissões direto pela API, e lia/alterava os colaboradores de
-- qualquer empresa.
-- Agora:
--   * profiles: lê a própria linha e as da mesma empresa; muda SÓ a própria
--     linha, e nunca papel, permissões, empresa ou id (trava abaixo). A tela
--     Usuários grava com a chave administrativa (service_role), que passa.
--   * colaboradores: presos à empresa, como as outras tabelas.

drop policy if exists acesso_autenticado on public.profiles;
drop policy if exists profiles_ler on public.profiles;
drop policy if exists profiles_proprio on public.profiles;

create policy profiles_ler on public.profiles for select to authenticated
  using (id = auth.uid() or empresa_id = public.empresa_atual());

create policy profiles_proprio on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Sem policy de insert/delete pra authenticated: o perfil nasce pelo gatilho
-- handle_new_user (security definer) e some junto com o usuário.

create or replace function public.profiles_protege_campos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.papel is distinct from old.papel
          or new.permissoes is distinct from old.permissoes
          or new.empresa_id is distinct from old.empresa_id
          or new.id is distinct from old.id) then
    raise exception 'Papel, permissões e empresa só mudam pela tela de Usuários.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protege_campos on public.profiles;
create trigger profiles_protege_campos
  before update on public.profiles
  for each row execute function public.profiles_protege_campos();

drop policy if exists acesso_autenticado on public.colaboradores;
drop policy if exists colaboradores_empresa on public.colaboradores;
create policy colaboradores_empresa on public.colaboradores for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
