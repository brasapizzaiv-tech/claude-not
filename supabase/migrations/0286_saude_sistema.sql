-- Saúde do sistema (auditoria, Onda 2: "falha calada").
--
-- Antes, quando uma peça de fora parava (agente de impressão, balança, relógio
-- de ponto, SEFAZ, uma rotina automática, o WhatsApp), o sistema seguia como se
-- nada fosse: o erro ficava no log do PC ou no JSON que a Vercel descarta.
-- Agora cada peça deixa o último sinal aqui, e a tela /saude (e um aviso na tela
-- inicial e no caixa) mostra o que está parado.

-- 1) Último sinal de cada rotina/peça. A chave diz quem é:
--    "rotina:contagem", "rotina:kern", "ponto:<empresa>", "sefaz:<empresa>"...
create table if not exists public.saude_sinais (
  chave        text primary key,
  empresa_id   uuid references public.empresas (id) on delete cascade,
  ok           boolean not null,
  detalhe      text,
  ultima_em    timestamptz not null default now(),
  ultima_ok_em timestamptz,
  falha_em     timestamptz
);
alter table public.saude_sinais enable row level security;
drop policy if exists saude_sinais_ler on public.saude_sinais;
-- Quem está logado lê os sinais da sua empresa e os gerais (empresa vazia).
-- Só o servidor grava (chave administrativa).
create policy saude_sinais_ler on public.saude_sinais for select to authenticated
  using (empresa_id is null or empresa_id = public.empresa_atual());

-- 2) Erros que o servidor engole de propósito (COD-004): fica o rastro.
--    Sem dado pessoal no contexto (quem chama cuida disso).
create table if not exists public.erros_sistema (
  id         bigint generated always as identity primary key,
  empresa_id uuid references public.empresas (id) on delete cascade,
  onde       text not null,
  mensagem   text not null,
  contexto   jsonb,
  criado_em  timestamptz not null default now()
);
create index if not exists erros_sistema_criado_idx on public.erros_sistema (criado_em desc);
alter table public.erros_sistema enable row level security;
-- Sem policy: só o servidor lê e grava.

-- 3) Fila de impressão: tentativas e último erro (AGT-05). O agente informa a
--    falha; depois de 5, o servidor para de entregar e a Central mostra.
alter table public.impressao_fila
  add column if not exists tentativas int not null default 0,
  add column if not exists ultimo_erro text,
  add column if not exists erro_em timestamptz,
  add column if not exists descartado_em timestamptz,
  -- Comanda de cozinha pedida há mais de 1 hora não sai sozinha (AGT-02): fica
  -- retida até alguém mandar imprimir (liberado_em) ou descartar.
  add column if not exists retido_em timestamptz,
  add column if not exists liberado_em timestamptz;

create index if not exists impressao_fila_pendentes_idx
  on public.impressao_fila (empresa_id, solicitado_em)
  where impresso_em is null and descartado_em is null;

-- 4) Agente de impressão: versão e hora da última rodada completa (AGT-03/07).
alter table public.impressao_config
  add column if not exists versao text,
  add column if not exists rodada_em timestamptz;

-- 5) Balança: pesagens recusadas que ficaram no PC (AGT-01).
alter table public.balanca_status
  add column if not exists erros int not null default 0,
  add column if not exists erros_lista jsonb;

-- 6) SEFAZ: última resposta e validade do certificado (NFE-03, NFE-06).
--    A validade é digitada pelo dono (não lemos o certificado).
alter table public.config_sefaz
  add column if not exists ultimo_cstat text,
  add column if not exists ultimo_motivo text,
  add column if not exists ultima_busca_em timestamptz,
  add column if not exists ultima_busca_ok_em timestamptz,
  add column if not exists cert_validade date,
  add column if not exists falha_nsu text,
  add column if not exists falha_vezes int not null default 0;

-- 7) Avisos no celular: uma linha por envio do resumo do dia (MSG-09, CRN-05).
--    A chave única impede mandar o resumo duas vezes no mesmo dia.
create table if not exists public.push_envios (
  tipo       text not null,
  dia        date not null,
  enviados   int not null default 0,
  falhas     int not null default 0,
  criado_em  timestamptz not null default now(),
  primary key (tipo, dia)
);
alter table public.push_envios enable row level security;
-- Sem policy: só o servidor.

-- 8) Contagens agendadas: marca o dia ANTES de gerar, e só gera quem conseguiu
--    marcar (CRN-05). Duas rodadas ao mesmo tempo não geram a contagem 2 vezes.
create or replace function public.contagem_rodar_agendamentos()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_brt timestamp := (now() at time zone 'America/Sao_Paulo');
  v_dow int := extract(dow from v_brt);
  v_min int := extract(hour from v_brt) * 60 + extract(minute from v_brt);
  v_today date := v_brt::date;
  r record; v_cont uuid; v_criadas jsonb := '[]'::jsonb; v_marcou uuid;
begin
  perform public.exigir_servidor();  -- só o servidor (cron), como na 0216
  for r in select * from contagem_agendamentos where ativo loop
    if r.ultima_exec = v_today then continue; end if;
    if v_min < (r.hora * 60 + r.minuto) then continue; end if;
    if r.frequencia = 'semanal' and r.dia_semana <> v_dow then continue; end if;
    if r.frequencia = 'quinzenal' then
      if r.dia_semana <> v_dow then continue; end if;
      if r.ultima_exec is not null and (v_today - r.ultima_exec) < 14 then continue; end if;
    end if;
    update contagem_agendamentos set ultima_exec = v_today
      where id = r.id and ultima_exec is not distinct from r.ultima_exec
      returning id into v_marcou;
    if v_marcou is null then continue; end if;  -- outra rodada já pegou
    v_cont := gerar_contagem_agendada(
      r.nome || ' — ' || to_char(v_brt, 'DD/MM'), r.modo, r.divisao, r.empresa_id
    );
    v_criadas := v_criadas || jsonb_build_object('agendamento', r.nome, 'contagem', v_cont);
  end loop;
  return jsonb_build_object('criadas', v_criadas);
end;
$function$;
