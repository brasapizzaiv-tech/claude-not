-- Marca quem realmente faz contagem de estoque. Assim, no app /eu, quem só tem
-- folga não vê a parte de contagem.
alter table public.colaboradores
  add column if not exists faz_contagem boolean not null default true;

-- Quem foi trazido só por causa da folga (tem perfil de folga e nunca participou
-- de contagem) começa como "não faz contagem".
update public.colaboradores co
   set faz_contagem = false
 where exists (select 1 from public.folgas_funcionarios f where f.colaborador_id = co.id)
   and not exists (select 1 from public.contagem_links cl where cl.colaborador_id = co.id)
   and not exists (select 1 from public.contagem_atribuicoes ca where ca.colaborador_id = co.id);
