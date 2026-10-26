-- PONTO, ETAPA 3 (Rafael, 26/10/2026: sair do RHiD).
--
-- 1. TIPOS DE JUSTIFICATIVA (como no RHiD). Cada tipo diz o que faz no ponto:
--    'dia'    = abona o(s) dia(s) inteiro(s) (atestado, férias, licença...)
--    'horas'  = abona X minutos de falta no dia (saiu antes pro médico)
--    'ajuste' = soma (ou tira) X minutos no dia, à mão
--    e se tira o prêmio assiduidade. A justificativa lançada (tabela atestados)
--    ganha o tipo e os minutos.
create table if not exists public.justificativa_tipos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.empresa_atual() references public.empresas (id),
  nome        text not null,
  efeito      text not null default 'dia' check (efeito in ('dia', 'horas', 'ajuste')),
  tira_premio boolean not null default false,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome)
);
alter table public.atestados
  add column if not exists tipo_id uuid references public.justificativa_tipos (id),
  add column if not exists minutos integer;

-- 2. FECHAMENTO DO MÊS ("Arquivar cálculos" do RHiD): a gestão confere e fecha
--    o ciclo de cada pessoa; fechado, ninguém mexe nas batidas nem nas
--    justificativas daqueles dias, e só então o app pede a assinatura.
--    Reabrir não apaga: marca reaberto_em (o histórico fica).
create table if not exists public.ponto_fechamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  de             date not null,
  ate            date not null,
  fechado_em     timestamptz not null default now(),
  fechado_por    uuid,
  reaberto_em    timestamptz,
  reaberto_por   uuid
);
create index if not exists ponto_fechamentos_pessoa_idx on public.ponto_fechamentos (colaborador_id, de);
create unique index if not exists ponto_fechamentos_um_aberto on public.ponto_fechamentos (colaborador_id, de) where reaberto_em is null;

-- 3. TIPOS DE INCONSISTÊNCIA (como no RHiD): o que marca um dia como "tem
--    problema" no espelho, no Ponto Diário e no app. campo: falta (dia sem
--    batida), atraso (falta e atraso do dia em min), extra (extra do dia em
--    min), incompleto (batida faltando).
alter table public.assiduidade_config
  add column if not exists inconsistencias jsonb not null default
    '[{"nome":"Falta","campo":"falta","a_partir":1,"ativo":true},{"nome":"Atraso acima de 10 min","campo":"atraso","a_partir":10,"ativo":true},{"nome":"Extra acima de 10 min","campo":"extra","a_partir":10,"ativo":true},{"nome":"Batida faltando","campo":"incompleto","a_partir":1,"ativo":true}]';

do $$
declare t text;
begin
  foreach t in array array['justificativa_tipos', 'ponto_fechamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Os tipos do RHiD da Brasa (sem os de banco de horas, que não usam).
insert into public.justificativa_tipos (empresa_id, nome, efeito, tira_premio)
select e.id, v.nome, v.efeito, v.tira
from public.empresas e
cross join (values
  ('Atestado médico', 'dia', true),
  ('Abonar ausência no período', 'dia', false),
  ('Abonar quantidade de horas', 'horas', false),
  ('Ajuste quantidade de horas', 'ajuste', false),
  ('Férias', 'dia', false),
  ('Feriado', 'dia', false),
  ('Licença casamento', 'dia', false),
  ('Licença maternidade', 'dia', false),
  ('Licença paternidade', 'dia', false)
) as v(nome, efeito, tira)
on conflict (empresa_id, nome) do nothing;

-- Justificativas antigas (se houver) ganham o tipo equivalente.
update public.atestados a set tipo_id = t.id
from public.justificativa_tipos t
where a.tipo_id is null and t.empresa_id = a.empresa_id
  and t.nome = case when a.tipo = 'abono' then 'Abonar ausência no período' else 'Atestado médico' end;
