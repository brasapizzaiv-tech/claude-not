-- WhatsApp oficial (Meta Cloud API): registro de tudo que sai e entra.
create table if not exists public.whatsapp_mensagens (
  id           uuid primary key default gen_random_uuid(),
  direcao      text not null check (direcao in ('saida','entrada')),
  telefone     text not null,                 -- 55DDDNÚMERO
  template     text,                          -- nome do modelo (saída)
  texto        text,                          -- texto (entrada) ou resumo (saída)
  pedido_id    uuid references public.delivery_pedidos (id) on delete set null,
  wa_id        text,                          -- id da mensagem na Meta
  status       text,                          -- accepted / sent / delivered / read / failed
  erro         text,
  payload      jsonb,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_wpp_msg_wa on public.whatsapp_mensagens (wa_id);
create index if not exists idx_wpp_msg_tel on public.whatsapp_mensagens (telefone, criado_em desc);
alter table public.whatsapp_mensagens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_mensagens' and policyname='whatsapp_mensagens_auth') then
    create policy whatsapp_mensagens_auth on public.whatsapp_mensagens for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Marca no pedido quais avisos já foram (pra não mandar duas vezes).
alter table public.delivery_pedidos add column if not exists wpp_avisos jsonb not null default '{}';
