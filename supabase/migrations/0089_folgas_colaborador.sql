-- Unifica a lista de pessoas: colaboradores passa a ser a lista mestre e a
-- folga vira um "perfil" ligado ao colaborador. Mantém folgas_pedidos apontando
-- para folgas_funcionarios (não quebra nada); só acrescenta o vínculo.
alter table public.folgas_funcionarios
  add column if not exists colaborador_id uuid references public.colaboradores (id) on delete set null;

create index if not exists idx_folgas_func_colaborador
  on public.folgas_funcionarios (colaborador_id);
