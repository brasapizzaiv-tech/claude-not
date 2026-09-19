-- A cor da marca precisa ser lida por quem NÃO está logado.
--
-- O cardápio que o cliente abre no celular (/pedir), o app do garçom e o do
-- entregador entram sem login do sistema. Sem isto eles caem na cor padrão e
-- a Etapa 3 não vale pra eles — que é justamente onde a marca mais aparece.
--
-- A tabela só tem nome, apelido, se está ativa, as três cores e o logo. Nada
-- disso é segredo: é o que qualquer pessoa vê ao abrir o cardápio.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'empresas' and policyname = 'empresas_leitura_publica'
  ) then
    create policy empresas_leitura_publica on public.empresas
      for select to anon using (true);
  end if;
end $$;
