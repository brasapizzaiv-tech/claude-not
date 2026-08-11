-- Configuração do SEFAZ automático (NFeDistribuicaoDFe).
-- Guarda o certificado A1 (arquivo .pfx em base64) e a senha para o servidor
-- se autenticar na SEFAZ. Dado sensível — acesso só a usuário logado (RLS).
create table if not exists public.config_sefaz (
  id           uuid primary key default gen_random_uuid(),
  cnpj         text,
  cuf          int not null default 43,     -- 43 = RS
  ambiente     int not null default 1,       -- 1 = produção
  cert_nome    text,
  cert_pfx     text,                         -- base64 do arquivo .pfx
  cert_senha   text,
  ult_nsu      text not null default '000000000000000',
  atualizado_em timestamptz not null default now()
);

alter table public.config_sefaz enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='config_sefaz' and policyname='sefaz_all') then
    create policy "sefaz_all" on public.config_sefaz for all to authenticated using (true) with check (true);
  end if;
end $$;
