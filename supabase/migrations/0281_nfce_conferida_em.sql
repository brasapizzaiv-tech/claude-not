-- Conferência das notas depois de emitidas (auditoria NFE-01, FIS-01, NFE-07).
--
-- A rotina /api/fiscal/conferir pergunta à Focus como estão as notas que saíram
-- num estado que não é o final (contingência offline, processando, "enviando",
-- cancelando) e grava a hora da última conferência aqui, pra rodar primeiro as
-- que esperam há mais tempo e não perguntar da mesma nota a cada rodada.
alter table public.nfce_emitidas add column if not exists conferida_em timestamptz;

create index if not exists nfce_emitidas_conferir_idx
  on public.nfce_emitidas (status, conferida_em)
  where status in ('enviando', 'processando_autorizacao', 'cancelando')
     or mensagem ilike '%contingência offline%';
