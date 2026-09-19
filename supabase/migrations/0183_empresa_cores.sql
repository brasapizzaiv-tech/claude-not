-- Etapa 3 do design: a cor é da empresa, não do código.
--
-- Até aqui o laranja #C78340 e o grafite #211915 da Brasa estavam escritos no
-- globals.css. Quando outro restaurante usar o sistema, ele tem que entrar com
-- a cara dele sem ninguém mexer em código.
--
-- Só três cores ficam guardadas. O resto do sistema (a escala inteira de
-- claro a escuro) é DERIVADO delas pelo CSS, então não há o que desencontrar.
alter table public.empresas
  add column if not exists cor_primaria      text,  -- a cor da marca
  add column if not exists cor_escuro        text,  -- o fundo escuro da marca
  add column if not exists cor_sobre_escuro  text,  -- texto por cima do escuro
  add column if not exists logo_url          text;

-- Os valores da Brasa, que antes moravam no código.
update public.empresas
   set cor_primaria     = coalesce(cor_primaria, '#c78340'),
       cor_escuro       = coalesce(cor_escuro, '#211915'),
       cor_sobre_escuro = coalesce(cor_sobre_escuro, '#e8ded5'),
       logo_url         = coalesce(logo_url, '/logo-brasa.png')
 where id = public.empresa_atual();

-- Cor tem que ser #rrggbb. Sem isto, um valor torto entra no CSS e a tela
-- inteira fica sem cor nenhuma, sem erro em lugar nenhum.
alter table public.empresas drop constraint if exists empresas_cores_check;
alter table public.empresas
  add constraint empresas_cores_check check (
    (cor_primaria     is null or cor_primaria     ~* '^#[0-9a-f]{6}$') and
    (cor_escuro       is null or cor_escuro       ~* '^#[0-9a-f]{6}$') and
    (cor_sobre_escuro is null or cor_sobre_escuro ~* '^#[0-9a-f]{6}$')
  );
