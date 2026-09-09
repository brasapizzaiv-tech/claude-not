-- Cupom do fechamento de caixa (Z) impresso pela Central de Impressões, na
-- mesma impressora da NFC-e — sem abrir a janela de impressão do navegador.
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta', 'marmita', 'nfce', 'fechamento'));
