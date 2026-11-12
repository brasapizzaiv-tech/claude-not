-- SEC-08 / DEL-13 (Onda 5, delivery próprio): o app do cliente (/pedir)
-- confiava no telefone digitado. Quem soubesse (ou varresse) um telefone via
-- nome, último endereço e os pedidos da pessoa, gastava o cashback dela e
-- trocava o endereço e o aceite de promoções no cadastro.
--
-- Sem o WhatsApp da API pra mandar código, a confirmação é o APARELHO: o
-- celular que já fez pedido com aquele telefone ganha um cookie (só o servidor
-- lê) e fica ligado ao telefone aqui. Só esse aparelho vê os dados, o
-- histórico e usa o cashback. Guarda o hash do cookie, nunca o valor.
create table if not exists public.pedir_aparelhos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  token_hash text not null,
  telefone_digitos text not null,
  -- Só vale depois que o pedido feito deste aparelho foi ENTREGUE: um pedido
  -- falso com o telefone de outra pessoa não libera os dados dela.
  pedido_id uuid references public.delivery_pedidos(id) on delete set null,
  confirmado boolean not null default false,
  criado_em timestamptz not null default now(),
  usado_em timestamptz not null default now(),
  unique (empresa_id, token_hash, telefone_digitos)
);

alter table public.pedir_aparelhos enable row level security;
-- Nenhuma policy: só a chave administrativa do servidor (app sem login) usa.
revoke all on public.pedir_aparelhos from anon;

-- CRN-02: o cálculo da taxa é público e cada clique era uma chamada paga ao
-- Google. Agora o resultado fica guardado por endereço (geo_cache) e cada IP
-- pode calcular no máximo 30 vezes em 10 min (geo_consultas, limpa sozinha).
create table if not exists public.geo_cache (
  endereco text primary key,
  lat double precision not null,
  lng double precision not null,
  criado_em timestamptz not null default now()
);
create table if not exists public.geo_consultas (
  id bigserial primary key,
  ip text not null,
  em timestamptz not null default now()
);
create index if not exists geo_consultas_ip_em_idx on public.geo_consultas (ip, em);
alter table public.geo_cache enable row level security;
alter table public.geo_consultas enable row level security;
revoke all on public.geo_cache, public.geo_consultas from anon;

notify pgrst, 'reload schema';
