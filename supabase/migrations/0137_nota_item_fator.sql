-- Item da nota vem em CAIXA/FARDO e o produto é contado em UNIDADE: "fator" =
-- quantas unidades tem em cada unidade da nota (ex.: leite condensado, caixa
-- com 27 → fator 27). Quantidade real = qtd × fator; preço por unidade =
-- valor_total ÷ (qtd × fator). Usado no CMV, no preço de referência e na
-- conferência da contagem.
alter table public.nota_itens
  add column if not exists fator numeric not null default 1 check (fator > 0);
