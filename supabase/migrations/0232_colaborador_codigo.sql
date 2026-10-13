-- APP MOTELLI EQUIPE: CÓDIGO DE ENTRADA DO COLABORADOR (pedido do Rafael, 12/10/2026)
-- Igual ao app do entregador (0227): o app da loja é um só; a pessoa digita o
-- código de 6 números (ou lê o QR do painel) e motelli.com.br/api/equipe/ativar
-- devolve o link pessoal dela (/eu/{token}). Depois só o PIN, como hoje.

create or replace function public.gerar_codigo_colaborador() returns text
language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.colaboradores where codigo = c);
  end loop;
  return c;
end $$;

alter table public.colaboradores add column if not exists codigo text;
update public.colaboradores set codigo = public.gerar_codigo_colaborador() where codigo is null;
alter table public.colaboradores alter column codigo set default public.gerar_codigo_colaborador();
create unique index if not exists colaboradores_codigo_uk on public.colaboradores (codigo);

-- As tentativas erradas (trava contra chute) usam a mesma tabela do entregador.
comment on table public.entrega_ativacao_tentativas is
  'Tentativas de entrada por código nos apps Motelli (Entregador e Equipe): trava quem fica chutando.';
