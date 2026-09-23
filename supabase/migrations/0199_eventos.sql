-- EVENTOS MARCADOS
--
-- Aniversário, batizado, confraternização, formatura: a casa fecha um combinado
-- com alguém pra um dia. Isso não é reserva de mesa — reserva tem mesa, turno e
-- chegada, e some quando a pessoa senta. Um evento tem um acerto: quantos vão,
-- onde, a que horas, e o que foi combinado de comida e bebida.
--
-- É esse último que faltava em todo lugar. Hoje a cozinha descobre o que
-- preparar pra um evento perguntando pro Rafael na véspera.
create table if not exists public.eventos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  data       date not null,
  -- Texto livre e não `time`: o que se combina é "20h", "a partir das 19h30",
  -- "almoço" — e um campo de hora obrigaria a inventar precisão que não existe.
  hora       text,
  titulo     text not null,
  pessoas    int  not null default 0,
  lugar      text,              -- Salão, Deck, Área kids, casa toda
  contato    text,              -- de quem é o evento
  telefone   text,
  -- O que foi combinado de comida e bebida, escrito como se combinou.
  cardapio   text,
  observacao text,
  status     text not null default 'marcado'
             check (status in ('marcado', 'confirmado', 'cancelado')),
  criado_em  timestamptz not null default now()
);

create index if not exists eventos_data_idx on public.eventos (data);
create index if not exists eventos_empresa_idx on public.eventos (empresa_id);

alter table public.eventos enable row level security;
drop policy if exists eventos_empresa on public.eventos;
create policy eventos_empresa on public.eventos for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
