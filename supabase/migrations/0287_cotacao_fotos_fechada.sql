-- Fotos da cotação (auditoria SEC-07, Onda 3).
-- Antes: qualquer pessoa com a chave pública LISTAVA o bucket e via as pastas
-- {token}/ — o token de cada fornecedor, que abre /cotar/{token} e muda a
-- resposta. E subia arquivo de qualquer tipo e tamanho.
-- Agora: sem listagem e sem envio direto. O envio é por endereço assinado que o
-- servidor gera depois de conferir o link (urlParaFoto), com nome aleatório.
-- O endereço público de cada foto continua abrindo (bucket público não passa
-- pela policy no download), então as fotos antigas seguem aparecendo.
drop policy if exists "cotacao_fotos_insert" on storage.objects;
drop policy if exists "cotacao_fotos_select" on storage.objects;

update storage.buckets
set file_size_limit = 3145728, -- 3 MB (o celular reduz a foto antes de mandar)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'cotacao-fotos';
