-- Permite mais de um lançamento por pessoa na mesma semana (complemento de
-- algo esquecido depois de já ter lançado).
alter table public.semana_pagamentos drop constraint if exists semana_pagamentos_segunda_colaborador_id_key;
create index if not exists semana_pagamentos_seg_colab_idx on public.semana_pagamentos (segunda, colaborador_id);
