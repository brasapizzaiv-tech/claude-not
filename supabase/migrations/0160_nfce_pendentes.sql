-- Nota automática com janela de espera: ao receber em Pix/cartão/vale, a conta
-- entra nesta fila em vez de emitir na hora. O caixa tem alguns minutos pra
-- digitar o CPF (se o cliente pedir) ou mandar emitir na hora; passado o prazo,
-- o sistema emite sozinho sem CPF e manda o cupom pra impressora.
create table if not exists public.nfce_pendentes (
  id           uuid primary key default gen_random_uuid(),
  comanda_ids  uuid[] not null,
  numeros      text,                       -- "#12, #13" só pra mostrar na tela
  cliente_id   uuid references public.clientes (id) on delete set null,
  cpf_cnpj     text,
  valor        numeric(12,2),
  formas       text,                       -- formas usadas (só informativo)
  caixa_id     uuid references public.pdv_caixas (id) on delete set null,
  status       text not null default 'aguardando'
               check (status in ('aguardando', 'emitindo', 'emitida', 'cancelada', 'erro')),
  nfce_id      uuid references public.nfce_emitidas (id) on delete set null,
  erro         text,
  tentativas   integer not null default 0,
  criado_em    timestamptz not null default now(),
  emitir_em    timestamptz not null,
  resolvido_em timestamptz
);
create index if not exists nfce_pendentes_fila on public.nfce_pendentes (status, emitir_em);

alter table public.nfce_pendentes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='nfce_pendentes' and policyname='nfce_pendentes_all') then
    create policy nfce_pendentes_all on public.nfce_pendentes for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Minutos de espera antes de emitir sozinho (0 = emite na hora).
insert into public.config_fiscal (chave, valor)
select 'nfce_auto_minutos', '5'
where not exists (select 1 from public.config_fiscal where chave = 'nfce_auto_minutos');
