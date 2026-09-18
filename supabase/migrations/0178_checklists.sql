-- Checklists de rotina por setor (caixa, salão, cozinha, copa), com listas de
-- abertura / durante o turno / fechamento, execução pelo app da equipe e
-- apontamentos de correção que o dono publica na TV da cozinha.
--
-- Tudo nasce com empresa_id + policy por empresa (padrão da migration 0175).
-- Os apontamentos NÃO usam tv_recados: os recados continuam sendo recados; o
-- que é compartilhado é o caminho de exibição na TV (mesma rota, mesmo
-- componente), não a tabela.

-- ---------- Setores (lista editável, não fixa no código) ----------
create table if not exists public.checklist_setores (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome       text not null,
  cor        text,                                  -- destaque na TV (opcional)
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------- Modelos (o que eu cadastro) ----------
create table if not exists public.checklist_modelos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  setor_id   uuid not null references public.checklist_setores (id) on delete cascade,
  nome       text not null,
  momento    text not null default 'abertura' check (momento in ('abertura','turno','fechamento')),
  -- Quando vale: dias da semana (0=dom) e/ou tipo de serviço. Vazio = todo dia.
  dias       integer[] not null default '{}',
  servicos   text[]    not null default '{}',       -- almoco | rodizio | delivery
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  -- Previsto e DESLIGADO: um dia a lista pode travar o fechamento do caixa etc.
  bloqueia   boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists checklist_modelos_setor_idx on public.checklist_modelos (empresa_id, setor_id, momento);

create table if not exists public.checklist_modelo_itens (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.empresa_atual() references public.empresas (id),
  modelo_id   uuid not null references public.checklist_modelos (id) on delete cascade,
  texto       text not null,
  instrucao   text,                                  -- aparece abaixo do item
  tipo        text not null default 'feito' check (tipo in ('feito','numero','texto','contagem')),
  exige_foto  boolean not null default false,
  obrigatorio boolean not null default false,
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create index if not exists checklist_modelo_itens_modelo_idx on public.checklist_modelo_itens (modelo_id, ordem);

-- ---------- Execução (uma por modelo por dia) ----------
create table if not exists public.checklist_execucoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  modelo_id      uuid not null references public.checklist_modelos (id) on delete cascade,
  data           date not null,
  iniciado_em    timestamptz not null default now(),
  iniciado_por   uuid references public.colaboradores (id) on delete set null,
  iniciado_nome  text,
  concluido_em   timestamptz,
  concluido_por  uuid references public.colaboradores (id) on delete set null,
  concluido_nome text,
  unique (empresa_id, modelo_id, data)
);
create index if not exists checklist_execucoes_data_idx on public.checklist_execucoes (empresa_id, data desc);

create table if not exists public.checklist_respostas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.empresa_atual() references public.empresas (id),
  execucao_id uuid not null references public.checklist_execucoes (id) on delete cascade,
  item_id     uuid not null references public.checklist_modelo_itens (id) on delete cascade,
  feito       boolean not null default false,
  valor       numeric,                               -- tipo numero / contagem
  texto       text,                                  -- tipo texto
  foto_url    text,
  por_id      uuid references public.colaboradores (id) on delete set null,
  por_nome    text,
  em          timestamptz not null default now(),
  unique (execucao_id, item_id)
);

-- ---------- Apontamentos (revisão do dia → TV) ----------
create table if not exists public.checklist_apontamentos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.empresa_atual() references public.empresas (id),
  data_ref      date not null,                       -- o dia que foi revisado
  setor_id      uuid references public.checklist_setores (id) on delete set null,
  setor_nome    text,                                -- snapshot pra TV
  execucao_id   uuid references public.checklist_execucoes (id) on delete set null,
  item_id       uuid references public.checklist_modelo_itens (id) on delete set null,
  item_texto    text,                                -- snapshot do item de origem
  texto         text not null,
  na_tv         boolean not null default false,
  ate           date,                                -- some da TV depois desta data
  mostrar_nome  boolean not null default false,
  pessoa_nome   text,                                -- quem executou (só aparece se mostrar_nome)
  resolvido_em  timestamptz,
  resolvido_por text,
  publicado_em  timestamptz,
  publicado_por text,
  criado_em     timestamptz not null default now()
);
create index if not exists checklist_apontamentos_tv_idx on public.checklist_apontamentos (empresa_id, na_tv, ate);
create index if not exists checklist_apontamentos_data_idx on public.checklist_apontamentos (empresa_id, data_ref desc);

-- ---------- Setores que cada colaborador executa ----------
alter table public.colaboradores add column if not exists checklist_setores uuid[] not null default '{}';

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['checklist_setores','checklist_modelos','checklist_modelo_itens','checklist_execucoes','checklist_respostas','checklist_apontamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_empresa') then
      execute format(
        'create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())',
        t || '_empresa', t);
    end if;
  end loop;
end $$;

-- ---------- Fotos dos checklists (bucket público, upload só pelo servidor) ----------
insert into storage.buckets (id, name, public)
values ('checklists', 'checklists', true)
on conflict (id) do nothing;

-- ---------- Conteúdo inicial ----------
insert into public.checklist_setores (nome, cor, ordem) values
  ('Caixa', '#60a5fa', 1), ('Salão', '#C78340', 2), ('Cozinha', '#ffb84d', 3), ('Copa', '#4ade80', 4)
on conflict do nothing;


-- Modelos e itens iniciais (só na primeira vez; depois é tudo editável na tela).
do $$
begin
  if exists (select 1 from public.checklist_modelos) then return; end if;

  -- Modelos
  insert into public.checklist_modelos (setor_id, nome, momento, ordem)
  select s.id, m.nome, m.momento, m.ordem
    from (values
      ('Caixa',   'Abertura do caixa',     'abertura',   1),
      ('Caixa',   'Fechamento do caixa',   'fechamento', 2),
      ('Salão',   'Abertura do salão',     'abertura',   1),
      ('Salão',   'Fechamento do salão',   'fechamento', 2),
      ('Cozinha', 'Abertura da cozinha',   'abertura',   1),
      ('Cozinha', 'Fechamento da cozinha', 'fechamento', 2),
      ('Copa',    'Fechamento da copa',    'fechamento', 1)
    ) as m(setor, nome, momento, ordem)
    join public.checklist_setores s on s.nome = m.setor;

  -- Itens de cada modelo
  insert into public.checklist_modelo_itens (modelo_id, texto, tipo, exige_foto, obrigatorio, ordem)
  select mo.id, i.texto, i.tipo, i.foto, i.obrig, i.ordem
    from (values
      -- Caixa · abertura
      ('Abertura do caixa','Conferir valor de abertura','numero',false,true,1),
      ('Abertura do caixa','Abrir o caixa no sistema','feito',false,true,2),
      ('Abertura do caixa','Conferir maquininha ligada','feito',false,false,3),
      ('Abertura do caixa','Conferir impressora e papel','feito',false,false,4),
      ('Abertura do caixa','Conferir troco por cédula','feito',false,false,5),
      -- Caixa · fechamento
      ('Fechamento do caixa','Fechar o caixa no sistema','feito',false,true,1),
      ('Fechamento do caixa','Conferir valor em dinheiro','numero',false,true,2),
      ('Fechamento do caixa','Conferir dinheiro x sistema','numero',false,true,3),
      ('Fechamento do caixa','Separar o troco do dia seguinte','feito',false,false,4),
      ('Fechamento do caixa','Guardar valores no cofre','feito',false,false,5),
      ('Fechamento do caixa','Anotar diferenças','texto',false,false,6),
      -- Salão · abertura
      ('Abertura do salão','Varrer e passar pano no salão','feito',false,true,1),
      ('Abertura do salão','Conferir mesas postas','feito',false,false,2),
      ('Abertura do salão','Conferir pratos e talheres','contagem',false,false,3),
      ('Abertura do salão','Repor guardanapos e temperos','feito',false,false,4),
      ('Abertura do salão','Ligar ar-condicionado e luzes','feito',false,false,5),
      ('Abertura do salão','Conferir banheiros','feito',true,true,6),
      -- Salão · fechamento
      ('Fechamento do salão','Recolher e limpar mesas','feito',false,true,1),
      ('Fechamento do salão','Virar as cadeiras','feito',false,false,2),
      ('Fechamento do salão','Varrer e passar pano','feito',false,true,3),
      ('Fechamento do salão','Desligar ar-condicionado','feito',false,false,4),
      ('Fechamento do salão','Desligar luzes e TVs','feito',false,false,5),
      ('Fechamento do salão','Conferir portas e janelas fechadas','feito',false,true,6),
      ('Fechamento do salão','Salão pronto para o dia seguinte','feito',true,true,7),
      -- Cozinha · abertura
      ('Abertura da cozinha','Conferir limpeza geral','feito',false,true,1),
      ('Abertura da cozinha','Conferir temperatura das câmaras','numero',false,true,2),
      ('Abertura da cozinha','Conferir gás','feito',false,true,3),
      ('Abertura da cozinha','Organizar bancadas','feito',false,false,4),
      ('Abertura da cozinha','Conferir produtos para o dia','feito',false,false,5),
      -- Cozinha · fechamento
      ('Fechamento da cozinha','Limpar bancadas e balcão','feito',true,true,1),
      ('Fechamento da cozinha','Limpar o chão','feito',false,true,2),
      ('Fechamento da cozinha','Guardar e etiquetar sobras','feito',false,true,3),
      ('Fechamento da cozinha','Desligar equipamentos','feito',false,true,4),
      ('Fechamento da cozinha','Tirar o lixo','feito',false,false,5),
      ('Fechamento da cozinha','Fogão e chapa limpos','feito',true,true,6),
      -- Copa · fechamento
      ('Fechamento da copa','Varrer a copa','feito',false,true,1),
      ('Fechamento da copa','Repor bebidas','contagem',false,false,2),
      ('Fechamento da copa','Limpar geladeiras e balcão','feito',false,true,3),
      ('Fechamento da copa','Tirar o lixo','feito',false,false,4),
      ('Fechamento da copa','Conferir louça lavada e guardada','feito',false,false,5)
    ) as i(modelo, texto, tipo, foto, obrig, ordem)
    join public.checklist_modelos mo on mo.nome = i.modelo;
end $$;
