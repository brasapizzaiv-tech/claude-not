-- WHATSAPP NO MESMO NÚMERO DO CELULAR (Rafael, 29/10/2026). O número da Brasa
-- (51 8022-9859) caiu da API em 14/10 ao reconectar a Caixa de Entrada da Meta
-- no WhatsApp Business do celular. A volta é pela "coexistência": o botão
-- Conectar WhatsApp (Delivery → Config, cadastro incorporado da Meta) liga o
-- número do app à plataforma sem tirar do celular. Aqui fica o número
-- conectado de cada empresa; o envio usa esta linha e, sem ela, as variáveis
-- WHATSAPP_* da Vercel. O token nunca sai do servidor: RLS ligado e nenhuma
-- política (só o service_role lê).
create table if not exists public.whatsapp_conta (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  waba_id text not null,
  phone_id text not null,
  telefone text,
  nome text,
  token text,
  modo text not null default 'coexistencia' check (modo in ('coexistencia', 'api')),
  conectado_em timestamptz not null default now(),
  conectado_por uuid references auth.users(id) on delete set null
);
alter table public.whatsapp_conta enable row level security;
revoke all on public.whatsapp_conta from anon, authenticated;
grant all on public.whatsapp_conta to service_role;
