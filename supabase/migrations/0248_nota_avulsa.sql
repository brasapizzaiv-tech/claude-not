-- Nota fiscal AVULSA (Rafael, 23/10/2026): NF-e (modelo 55, empresa com CNPJ —
-- Kern e outras) e NFC-e (modelo 65) montadas à mão numa tela própria, fora do
-- caixa. Fica na mesma tabela das notas do caixa (nfce_emitidas, que já tem
-- `modelo`), com quem recebeu, os itens cobrados e o texto da nota.
alter table public.nfce_emitidas
  add column if not exists avulsa       boolean not null default false,
  add column if not exists cliente_id   uuid references public.clientes (id) on delete set null,
  add column if not exists destinatario text,
  add column if not exists itens        jsonb,
  add column if not exists observacao   text;

create index if not exists nfce_emitidas_cliente_idx on public.nfce_emitidas (cliente_id) where cliente_id is not null;

-- Contribuinte de ICMS? '1' = tem IE, '2' = isento, '9' = não contribuinte.
alter table public.clientes
  add column if not exists indicador_ie text check (indicador_ie is null or indicador_ie in ('1', '2', '9'));
