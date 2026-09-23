-- FERIADOS E DATAS ESPECIAIS
--
-- O sistema sabia de feriado só de dois jeitos torto: um "bloqueio" avulso na
-- configuração da marmita e o interruptor de abrir/fechar do delivery. Nenhum
-- dos dois responde a pergunta que a casa faz toda semana — "no dia 12 a gente
-- abre?" — e ninguém que trabalha aqui tinha onde ler a resposta.
--
-- Agora é uma data com nome e uma decisão: ABRE, FECHA, ou abre de um jeito
-- diferente. Enquanto a decisão não foi tomada, a data fica INDEFINIDA de
-- propósito: aparece nas telas como "a definir", que é justamente o lembrete
-- de decidir antes de a equipe perguntar.
create table if not exists public.feriados (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  data       date not null,
  nome       text not null,
  situacao   text not null default 'indefinido'
             check (situacao in ('indefinido', 'abre', 'fecha', 'especial')),
  -- "só o almoço", "fecha às 14h", "rodízio normal" — o que a decisão tem de
  -- particular. Vale sobretudo pro 'especial', que sem isto não diz nada.
  detalhe    text,
  criado_em  timestamptz not null default now()
);

-- Uma data, um registro por empresa: dois "Natal" na mesma casa é erro de
-- digitação, não dois feriados.
create unique index if not exists feriados_empresa_data on public.feriados (empresa_id, data);
create index if not exists feriados_data_idx on public.feriados (data);

alter table public.feriados enable row level security;
drop policy if exists feriados_empresa on public.feriados;
create policy feriados_empresa on public.feriados for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
