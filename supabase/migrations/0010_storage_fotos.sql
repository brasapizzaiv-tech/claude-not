-- Armazenamento de fotos dos produtos na cotação (enviadas pelo fornecedor).

-- Bucket público (leitura livre pela URL).
insert into storage.buckets (id, name, public)
values ('cotacao-fotos', 'cotacao-fotos', true)
on conflict (id) do nothing;

-- Permite o fornecedor (anônimo, via link) enviar fotos para esse bucket.
drop policy if exists "cotacao_fotos_insert" on storage.objects;
create policy "cotacao_fotos_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'cotacao-fotos');

-- Leitura pública das fotos.
drop policy if exists "cotacao_fotos_select" on storage.objects;
create policy "cotacao_fotos_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'cotacao-fotos');
