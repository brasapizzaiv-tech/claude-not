-- Cobranças Pix geradas na hora (QR na tela) pelo caixa do salão e pelo PDV
-- de balcão, via API Pix do banco (Sicoob/Sicredi). Serve de registro/conferência:
-- o caixa gera o QR, o sistema consulta o banco até cair e marca como pago.
create table if not exists public.pix_cobrancas (
  id uuid primary key default gen_random_uuid(),
  txid text not null unique,
  valor numeric(12,2) not null,
  descricao text,
  origem text not null default 'caixa',          -- caixa | pdv | delivery
  status text not null default 'aguardando',     -- aguardando | pago | cancelado | expirado
  copia_cola text,
  banco text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  pago_em timestamptz
);
create index if not exists pix_cobrancas_status_idx on public.pix_cobrancas (status, criado_em desc);
alter table public.pix_cobrancas enable row level security;
drop policy if exists "pix_cobrancas_auth" on public.pix_cobrancas;
create policy "pix_cobrancas_auth" on public.pix_cobrancas for all to authenticated using (true) with check (true);
