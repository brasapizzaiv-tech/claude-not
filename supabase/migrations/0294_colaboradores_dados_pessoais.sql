-- Dados pessoais da equipe só pra quem tem a permissão "Colaboradores"
-- (auditoria SEC-04, fase B, lote 1, Onda 3). PARTE 1: a visão. As colunas
-- saem da sessão na 0295, depois que o código novo estiver no ar (o código
-- antigo ainda lê da tabela).
--
-- Antes: qualquer login da empresa lia pela API o CPF, RG, PIS, CTPS, CNH,
-- endereço, telefone, nascimento, nome dos pais, tipo sanguíneo, filhos e o
-- salário/diária de cada pessoa. Hoje 12 áreas do sistema leem a tabela de
-- colaboradores, mas fora da área de Colaboradores todas precisam só do nome
-- (e de alguns campos de função/turno).
-- Agora:
--   * a sessão não lê essas colunas na tabela (permissão por coluna, igual ao
--     token/PIN da 0292; o migrate.mjs reaplica depois de cada rodada);
--   * a área de Colaboradores (ponto, semana, relatórios) lê pela visão
--     colaboradores_dados, que só devolve linhas pra quem tem a permissão;
--   * o que outras áreas precisam (telefone pro entregador, aniversário no
--     mural) passa pelo servidor.

create or replace view public.colaboradores_dados
with (security_barrier = true) as
select
  c.id, c.nome, c.nome_social, c.whatsapp, c.ativo, c.criado_em, c.empresa_id,
  c.funcao, c.turno, c.vinculo, c.vinculo_noite, c.esporadico, c.bate_ponto,
  c.dias_dia, c.dias_noite, c.recebe_10, c.peso_10,
  c.salario_base, c.valor_dia, c.valor_noite, c.valor_free,
  c.cpf, c.rg, c.pis, c.ctps, c.cnh, c.cnh_categoria, c.cnh_validade,
  c.nascimento, c.cep, c.endereco, c.endereco_numero, c.bairro, c.cidade, c.uf,
  c.telefone, c.telefone_emergencia, c.nome_pai, c.nome_mae, c.genero, c.tipo_sanguineo,
  c.conjuge, c.filhos, c.matricula, c.numero_folha, c.admissao, c.obs_cartao_ponto,
  c.departamento_id, c.cargo_id, c.superior_id, c.motivo_demissao_id,
  c.desligado_em, c.desligado_motivo
from public.colaboradores c
where c.empresa_id = public.empresa_atual()
  and public.tem_permissao('colaboradores')
with local check option;

comment on view public.colaboradores_dados is
  'Ficha completa do colaborador (menos token/PIN/código), só pra quem tem a permissão Colaboradores. SEC-04.';

-- Só leitura: a visão é do dono do banco e gravar por ela pularia o RLS da
-- tabela. (O migrate.mjs dá tudo a "authenticated" em toda tabela/visão e
-- depois tira a escrita desta de novo.)
revoke all on public.colaboradores_dados from anon, public, authenticated;
grant select on public.colaboradores_dados to authenticated;

-- A visão faz join com departamentos pelo PostgREST? Não: quem precisa do nome
-- do departamento busca à parte. (O join embutido usa a chave estrangeira da
-- tabela, que a visão não tem.)

notify pgrst, 'reload schema';
