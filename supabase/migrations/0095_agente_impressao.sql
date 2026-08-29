-- Agente de impressão (programa no PC central que imprime tudo).
-- Cada impressora guarda o NOME dela no Windows, e há um token para o agente
-- autenticar na API.
alter table public.impressoras
  add column if not exists impressora_windows text;

create table if not exists public.impressao_config (
  id    int primary key default 1,
  token text not null,
  constraint impressao_config_one check (id = 1)
);

insert into public.impressao_config (id, token)
select 1, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.impressao_config);

-- Só o agente (via service role no servidor) lê o token. RLS liga sem política.
alter table public.impressao_config enable row level security;
