-- Câmera do buffet na TV da cozinha.
--
-- O computador que recebe a câmera (projeto app-buffet) avisa a cada minuto
-- "estou no ar, a página é http://192.168.x.x:8080/". Enquanto o aviso estiver
-- fresco, a TV da cozinha (/tv) troca pra página da câmera; quando a
-- transmissão desliga (fim do buffet), a página da câmera devolve a TV.
--
-- Uma linha por empresa. Só o servidor lê e grava (rota /api/tv/camera, com a
-- chave da TV); RLS ligado e sem política = ninguém de fora enxerga.
create table if not exists public.tv_camera (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id),
  url        text not null,
  ao_vivo    boolean not null default false,
  visto_em   timestamptz not null default now(),
  ativo      boolean not null default true   -- desligar sem mexer no computador
);
alter table public.tv_camera enable row level security;
grant select, insert, update, delete on public.tv_camera to service_role;
