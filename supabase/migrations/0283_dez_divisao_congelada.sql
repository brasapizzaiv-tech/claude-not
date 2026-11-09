-- Divisão do 10% congelada no pagamento (auditoria EQP-02).
--
-- Cada noite de 10% é dividida entre quem trabalhou e recebe 10%, pelo peso de
-- cada um. A tela calculava isso com a configuração de HOJE: mexer depois em
-- "recebe 10%" ou no peso de alguém mudava o 10% de semana já paga, e a tela
-- oferecia "Lançar diferença" a todos (dava pra pagar duas vezes).
--
-- Agora, no primeiro lançamento da semana, as noites dela guardam quem entrava
-- na divisão e com que peso: { colaborador_id: peso }. A presença continua
-- valendo (esqueceu de marcar alguém → a diferença aparece certa); só a
-- configuração fica congelada.
alter table public.dez_por_cento_noites add column if not exists divisao jsonb;

-- Semanas JÁ pagas congelam com a configuração de agora: não cria diferença
-- nenhuma (a tela já calculava com ela), só impede que mude daqui pra frente.
update public.dez_por_cento_noites d
   set divisao = (
     select coalesce(jsonb_object_agg(c.id::text, coalesce(c.peso_10, 1)), '{}'::jsonb)
       from public.colaboradores c
      where c.recebe_10 and c.empresa_id = d.empresa_id
   )
 where d.divisao is null
   and exists (
     select 1 from public.semana_pagamentos sp
      where sp.segunda = d.pagar_em and sp.empresa_id = d.empresa_id
   );
