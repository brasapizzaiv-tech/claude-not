-- Permissões por módulo para os funcionários.
-- papel = 'dono'  -> acesso total (admin)
-- papel = 'funcionario' -> acesso apenas aos módulos em "permissoes"
alter table public.profiles
  add column if not exists permissoes text[] not null default '{}';

-- Libera o campo papel (o check antigo só permitia dono/comprador/conferente).
alter table public.profiles drop constraint if exists profiles_papel_check;
alter table public.profiles alter column papel set default 'funcionario';

-- Novos usuários entram sem nenhum acesso até o dono liberar.
-- (a trigger handle_new_user já cria o perfil; o default acima cuida do resto)

-- Garante que o Rafael (dono do sistema) tenha acesso total.
update public.profiles
   set papel = 'dono'
 where id in (select id from auth.users where email = 'rafael.loctelli@gmail.com');

-- Fallback: se ninguém for dono, promove o perfil mais antigo.
do $$
begin
  if not exists (select 1 from public.profiles where papel = 'dono') then
    update public.profiles
       set papel = 'dono'
     where id = (select id from public.profiles order by criado_em asc limit 1);
  end if;
end $$;
