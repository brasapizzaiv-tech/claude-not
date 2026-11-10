-- Segredos fora do alcance da sessão (auditoria SEC-04, fase A, Onda 3).
--
-- Antes: qualquer login da empresa (até o do quiosque da balança) lia pela API
--   * o token dos agentes (impressao_config.token) → forjava batida de ponto e
--     lia a fila de impressão;
--   * a configuração do app das marmitas (mkt_config, com as senhas);
--   * o token do link pessoal, o PIN e o código de ativação de cada
--     colaborador e entregador → entrava no /eu ou no app do entregador de
--     qualquer um.
-- Agora:
--   * impressao_config e mkt_config: só o dono pela sessão (o resto passa
--     pelo servidor, que confere a permissão da tela);
--   * colaboradores.token/pin/codigo e entregadores.token/codigo: a sessão
--     não lê essas colunas (permissão por coluna). As telas que mostram o link
--     ou o código leem pelo servidor depois de conferir a permissão. Gravar
--     continua igual. O scripts/migrate.mjs reaplica isso depois de cada rodada.

-- Quem tem a permissão do módulo (mesma regra do podeAcessar em
-- src/lib/permissoes.ts). Pra fase B (permissão por tabela).
create or replace function public.tem_permissao(p_mod text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (
         p.papel = 'dono'
         or p_mod = any (coalesce(p.permissoes, '{}'))
         or (p_mod = 'garcom' and 'salao' = any (coalesce(p.permissoes, '{}')))
         or (p_mod = 'contas' and 'financeiro' = any (coalesce(p.permissoes, '{}')))
       )
  );
$function$;

-- Configuração dos agentes e das marmitas: só o dono pela sessão.
drop policy if exists impressao_config_empresa on public.impressao_config;
drop policy if exists impressao_config_dono on public.impressao_config;
create policy impressao_config_dono on public.impressao_config for all to authenticated
  using (empresa_id = public.empresa_atual() and public.sou_dono())
  with check (empresa_id = public.empresa_atual() and public.sou_dono());

drop policy if exists mkt_config_empresa on public.mkt_config;
drop policy if exists mkt_config_dono on public.mkt_config;
create policy mkt_config_dono on public.mkt_config for all to authenticated
  using (empresa_id = public.empresa_atual() and public.sou_dono())
  with check (empresa_id = public.empresa_atual() and public.sou_dono());

-- Colunas secretas: a sessão (authenticated) lê todas as colunas MENOS estas.
-- (O mesmo bloco roda no fim de cada "npm run migrate", porque lá se devolve
-- a permissão de tabela inteira.)
do $$
declare t text; secretas text[]; cols text;
begin
  for t, secretas in select * from (values
      ('colaboradores', array['token', 'pin', 'codigo']),
      ('entregadores', array['token', 'codigo'])
    ) as v(t, s)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name <> all (secretas);
    execute format('revoke select on public.%I from authenticated', t);
    execute format('grant select (%s) on public.%I to authenticated', cols, t);
  end loop;
end $$;
