-- ETAPA 2 DO MULTIEMPRESA — bloco 2: notas e fiscal
--
-- Cada linha destas tabelas passa a ter dono. Duas coisas por tabela:
--
--   1. a coluna `empresa_id`, que já nasce preenchida com a Brasa (é o que
--      `empresa_atual()` responde hoje), então NENHUM dado muda de lugar;
--   2. a regra de leitura e escrita deixa de ser "quem está logado vê tudo" e
--      passa a ser "quem está logado vê o da empresa dele".
--
-- O `with check` é tão importante quanto o `using`: sem ele dá pra LER só o
-- seu e mesmo assim GRAVAR uma linha carimbada com a empresa de outro.
--
-- Atenção: isto protege quem entra com login. Os apps por link (cotação do
-- fornecedor, contagem da equipe) falam com o banco pela chave administrativa,
-- que passa por cima destas regras — lá o filtro é no código, e vai junto
-- neste mesmo commit.

-- notas_fiscais (688 linhas)
alter table public.notas_fiscais
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists notas_fiscais_empresa_idx on public.notas_fiscais (empresa_id);
drop policy if exists "nf_all" on public.notas_fiscais;
create policy notas_fiscais_empresa on public.notas_fiscais for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- nota_itens (2585 linhas)
alter table public.nota_itens
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists nota_itens_empresa_idx on public.nota_itens (empresa_id);
drop policy if exists "ni_all" on public.nota_itens;
create policy nota_itens_empresa on public.nota_itens for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- nota_parcelas (18 linhas)
alter table public.nota_parcelas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists nota_parcelas_empresa_idx on public.nota_parcelas (empresa_id);
drop policy if exists "np_all" on public.nota_parcelas;
create policy nota_parcelas_empresa on public.nota_parcelas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- notas_emitidas (23984 linhas)
alter table public.notas_emitidas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists notas_emitidas_empresa_idx on public.notas_emitidas (empresa_id);
drop policy if exists "ne_all" on public.notas_emitidas;
create policy notas_emitidas_empresa on public.notas_emitidas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- nfce_emitidas (535 linhas)
alter table public.nfce_emitidas
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists nfce_emitidas_empresa_idx on public.nfce_emitidas (empresa_id);
drop policy if exists "nfce_all" on public.nfce_emitidas;
create policy nfce_emitidas_empresa on public.nfce_emitidas for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- nfce_pendentes (516 linhas)
alter table public.nfce_pendentes
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists nfce_pendentes_empresa_idx on public.nfce_pendentes (empresa_id);
drop policy if exists "nfce_pendentes_all" on public.nfce_pendentes;
create policy nfce_pendentes_empresa on public.nfce_pendentes for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- config_fiscal (22 linhas)
alter table public.config_fiscal
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists config_fiscal_empresa_idx on public.config_fiscal (empresa_id);
drop policy if exists "cf_all" on public.config_fiscal;
create policy config_fiscal_empresa on public.config_fiscal for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- config_sefaz (1 linhas)
alter table public.config_sefaz
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists config_sefaz_empresa_idx on public.config_sefaz (empresa_id);
drop policy if exists "sefaz_all" on public.config_sefaz;
create policy config_sefaz_empresa on public.config_sefaz for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- perfis_fiscais (12 linhas)
alter table public.perfis_fiscais
  add column if not exists empresa_id uuid not null
    default public.empresa_atual() references public.empresas (id);
create index if not exists perfis_fiscais_empresa_idx on public.perfis_fiscais (empresa_id);
drop policy if exists "perfis_fiscais_auth" on public.perfis_fiscais;
create policy perfis_fiscais_empresa on public.perfis_fiscais for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());


-- ---------- A configuração fiscal é por empresa ----------
-- `config_fiscal` guarda ajustes por nome ("nfce_auto", "emissor_token"…) e a
-- regra de unicidade era só o nome. Com dois restaurantes no mesmo banco, o
-- segundo não conseguiria ter o interruptor dele: o nome já estaria usado.
-- Agora o nome é único DENTRO da empresa.
drop index if exists config_fiscal_chave_key;
alter table public.config_fiscal drop constraint if exists config_fiscal_chave_key;
create unique index if not exists config_fiscal_empresa_chave_key
  on public.config_fiscal (empresa_id, chave);

-- A chave de 44 dígitos da nota (em `notas_fiscais` e `notas_emitidas`)
-- continua única no banco inteiro, de propósito: ela carrega o CNPJ de quem
-- emitiu, então duas empresas nunca geram a mesma. Deixar global é o que
-- impede a MESMA nota de entrar duas vezes.

-- ---------- Duas funções que enxergavam o banco inteiro ----------
-- Estas rodavam como SECURITY DEFINER, ou seja, por cima das regras. Como
-- quem chama as duas é uma tela do painel (sempre alguém logado), elas não
-- precisam disso: rodando em nome de quem chamou, as regras valem e o
-- resultado já sai filtrado pela empresa — e continua certo sozinho conforme
-- os próximos blocos forem carimbando as outras tabelas.
create or replace function public.notas_com_itens(p_ids uuid[])
returns setof uuid
language sql
stable
set search_path to 'public'
as $function$
  select distinct ni.nota_id from nota_itens ni where ni.nota_id = any(p_ids);
$function$;

-- `painel_resumo` somava faturamento, despesas e etiquetas de TODAS as
-- empresas. Nenhuma tela do sistema chama ela hoje (procurei), mas enquanto
-- existir é uma porta aberta. Passa a rodar em nome de quem chamou.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'painel_resumo') then
    execute 'alter function public.painel_resumo() security invoker';
  end if;
end $$;
