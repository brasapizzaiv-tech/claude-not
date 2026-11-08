-- Configuração fiscal só do dono (auditoria, 08/11/2026).
-- Antes: qualquer pessoa logada da empresa lia e gravava config_fiscal pela API,
-- inclusive o token da Focus (emite e cancela nota em nome da empresa) e o CSC.
-- Agora:
--   * funcionário LÊ só as chaves que não são segredo;
--   * funcionário GRAVA só o liga/desliga da nota automática (botão do caixa/PDV);
--   * o dono lê e grava tudo.
-- O servidor (emissão da nota, fila automática) lê com a chave administrativa,
-- sempre filtrando pela empresa: nada disso depende de quem está logado.

create or replace function public.sou_dono()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.papel = 'dono');
$$;
revoke all on function public.sou_dono() from public;
grant execute on function public.sou_dono() to authenticated, service_role;

drop policy if exists config_fiscal_empresa on public.config_fiscal;
drop policy if exists config_fiscal_ler on public.config_fiscal;
drop policy if exists config_fiscal_dono on public.config_fiscal;
drop policy if exists config_fiscal_nota_auto on public.config_fiscal;

create policy config_fiscal_ler on public.config_fiscal for select to authenticated
  using (empresa_id = public.empresa_atual()
         and (chave not in ('emissor_token', 'emissor_token_homologacao', 'csc') or public.sou_dono()));

create policy config_fiscal_dono on public.config_fiscal for all to authenticated
  using (empresa_id = public.empresa_atual() and public.sou_dono())
  with check (empresa_id = public.empresa_atual() and public.sou_dono());

create policy config_fiscal_nota_auto on public.config_fiscal for all to authenticated
  using (empresa_id = public.empresa_atual() and chave in ('nfce_auto', 'nfce_auto_minutos'))
  with check (empresa_id = public.empresa_atual() and chave in ('nfce_auto', 'nfce_auto_minutos'));
