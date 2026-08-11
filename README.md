# Sistema de Cotação

Sistema próprio de **compras, cotação de fornecedores, conferência e financeiro**.
Feito com Next.js + Supabase, hospedado na nuvem (acesso de qualquer lugar).

## Módulos

1. **Compras & Cotação** — fornecedores, produtos, contagem de estoque, cotação, comparação e pedido *(em construção)*
2. **Conferência** — o conferente valida os pedidos recebidos
3. **Notas Fiscais / SEFAZ** — cruzamento de notas via certificado digital
4. **Financeiro / DRE** — contas a pagar, categorias, faturamento x contas, gráficos

---

## Rodar no seu computador

Primeira vez (instala as dependências):

```bash
npm install
```

Rodar em modo desenvolvimento:

```bash
npm run dev
```

Depois abra http://localhost:3000 no navegador.

---

## Trabalhar de outro PC (sincronização via Git)

**Ao começar** (pega o que foi feito na outra máquina):

```bash
.\atualizar.ps1
```

**Ao terminar** (salva e envia pro GitHub):

```bash
.\salvar.ps1 "descrição do que mudou"
```

Em um PC novo, clone uma vez e rode `npm install`:

```bash
git clone https://github.com/brasapizzaiv-tech/claude-not.git
```
