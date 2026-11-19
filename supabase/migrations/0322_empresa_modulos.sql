-- Módulos contratados por empresa (19/11/2026).
--
-- Primeiro cliente de fora (uma hamburgueria) quer só Compras e estoque +
-- Equipe. As permissões de `profiles.permissoes` são por PESSOA; esta lista é
-- por EMPRESA: o que ela não contratou some do menu, do app da equipe e do
-- Ajudante, e as telas ficam fechadas até pro dono (src/lib/permissoes.ts,
-- `podeAcessar(..., modulos)` e `empresaTem`).
--
-- NULL = todos os módulos. A Brasa fica NULL: nada muda pra ela.
-- Os valores são as chaves de ModuloKey (ex.: 'cotacoes', 'folgas', 'cmv').
--
-- Quem grava: só a chave administrativa. `empresas` não tem política de
-- escrita (só a leitura pública da 0185), então o dono de uma empresa não
-- consegue ligar módulo sozinho pela API.

alter table public.empresas add column if not exists modulos text[];

comment on column public.empresas.modulos is
  'Módulos contratados (chaves de ModuloKey em src/lib/permissoes.ts). NULL = todos.';

-- Nome curto da empresa: o que aparece no app da equipe, no menu, nos títulos
-- e nas mensagens ("Beeis · Equipe", "Pedido - Beeis"). O `nome` continua sendo
-- o nome completo do cadastro. Vazio = usa o `nome`.
alter table public.empresas add column if not exists nome_curto text;

update public.empresas set nome_curto = 'Brasa'
 where slug = 'brasa' and nome_curto is null;
