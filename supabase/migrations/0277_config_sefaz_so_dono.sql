-- Certificado A1 da SEFAZ só do dono (auditoria SEC-03, 08/11/2026).
-- Antes: qualquer pessoa logada da empresa lia config_sefaz pela API, inclusive
-- cert_pfx (o arquivo do e-CNPJ) e cert_senha, e podia trocar o certificado.
-- Agora só o dono lê/grava pela sessão dele. O servidor (busca de notas,
-- manifestação, rotinas automáticas) usa a chave administrativa, sempre filtrando
-- pela empresa, depois de conferir a permissão "notas" de quem clicou.
-- O certificado em si NÃO é alterado: muda só quem pode ver.

drop policy if exists config_sefaz_empresa on public.config_sefaz;
drop policy if exists config_sefaz_dono on public.config_sefaz;

create policy config_sefaz_dono on public.config_sefaz for all to authenticated
  using (empresa_id = public.empresa_atual() and public.sou_dono())
  with check (empresa_id = public.empresa_atual() and public.sou_dono());
