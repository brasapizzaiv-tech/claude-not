-- Impressora que imprime o cupom da NFC-e (DANFE) pela Central de Impressões.
alter table public.impressoras add column if not exists recebe_nfce boolean not null default false;
