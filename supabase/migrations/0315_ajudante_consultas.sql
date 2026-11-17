-- Ajudante, etapa 2: quais consultas de dados cada pergunta usou (nome das
-- ferramentas), pra acompanhar o uso e melhorar as consultas.
alter table public.ajudante_uso add column if not exists consultas text[];
