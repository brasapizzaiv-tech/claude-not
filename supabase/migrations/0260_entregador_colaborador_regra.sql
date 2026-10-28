-- ENTREGADORES x COLABORADORES e REGRA DO ALMOÇO (Rafael, 28/10/2026).
-- Os boys fixos já estão em Colaboradores (aniversário etc.): o entregador
-- pode ser puxado de lá (colaborador_id). Os eventuais continuam cadastrados
-- direto no delivery, sem colaborador.
-- Pagamento: almoço = fixo que já cobre as primeiras N teles GRÁTIS (pro
-- cliente); da N+1ª em diante, um valor por tele grátis. Tele cobrada (fora
-- da entrega grátis) paga o valor da área. Noite = fixo + valor da área de
-- todas. Sem regra (nulos) = toda tele paga o valor da área, como antes.
alter table public.entregadores
  add column if not exists colaborador_id uuid references public.colaboradores(id) on delete set null,
  add column if not exists gratis_incluidas_dia integer,
  add column if not exists valor_gratis_extra_dia numeric(10,2);

create unique index if not exists entregadores_colaborador_unico
  on public.entregadores(colaborador_id) where colaborador_id is not null;
