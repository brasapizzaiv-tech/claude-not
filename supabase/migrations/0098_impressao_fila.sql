-- Fila de impressão GENÉRICA (serve para qualquer documento: etiqueta, comanda…).
-- O agente pega os pendentes, baixa o PDF de cada um e imprime na impressora.
create table if not exists public.impressao_fila (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('etiqueta', 'comanda')),
  ref_id        text not null,               -- id da etiqueta, ou lancamento_id da comanda
  impressora_id uuid references public.impressoras (id) on delete set null,
  solicitado_em timestamptz not null default now(),
  impresso_em   timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_impressao_fila_pendentes
  on public.impressao_fila (solicitado_em)
  where impresso_em is null;

-- Quais impressoras recebem as comandas (cozinha). Fase 3 (vias) refina isso.
alter table public.impressoras
  add column if not exists recebe_comandas boolean not null default false;

alter table public.impressao_fila enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='impressao_fila' and policyname='impressao_fila_all') then
    create policy impressao_fila_all on public.impressao_fila for all to authenticated using (true) with check (true);
  end if;
end $$;
