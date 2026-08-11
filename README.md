# Sistema de Cotação — Brasa Pizza

Sistema próprio de **compras, cotação de fornecedores, conferência e financeiro**.
Feito com Next.js + Supabase, hospedado na nuvem (acesso de qualquer lugar).

## 🌐 No ar (produção)

- **Site:** https://claude-not-indol.vercel.app
- **Login (dono):** rafael.loctelli@gmail.com
- Publica sozinho a cada `git push` na branch `main` (Vercel).

Para **só usar** o sistema em qualquer PC/celular, é só abrir o link acima —
não precisa instalar nada.

---

## Estado do projeto (atualizado em 10/08/2026)

**Concluído:**
- ✅ Estrutura (Next.js + Supabase) e deploy na Vercel
- ✅ Login com papéis (dono / comprador / conferente)
- ✅ Cadastros com dados reais importados do vmarket:
  - 335 produtos (com categoria, marca, preço de referência e **estoque ideal**)
  - 15 categorias · 60 fornecedores · 2.554 vínculos produto↔fornecedor
- ✅ Contagem de estoque (individual e **colaborativa**: dividir por categoria,
  link público por WhatsApp para colaboradores preencherem sem login)

**Próximo:**
- ⏳ **Etapa 3 — Cotação:** a partir de uma contagem, mostrar sugestão de compra
  (`estoque ideal − contado`), definir quanto cotar, agrupar por fornecedor e enviar.
- ⏳ Etapa 4 — Comparação de preços e pedido.

---

## Retomar o desenvolvimento em outro PC

1. Instalar o **Node.js** (LTS) e clonar o repositório:
   ```bash
   git clone https://github.com/brasapizzaiv-tech/claude-not.git
   cd "claude not"
   npm install
   ```
2. Criar o arquivo **`.env.local`** na raiz (ele NÃO vai para o Git, por segurança).
   A URL e a chave anon já estão no código (`src/lib/supabase/config.ts`), então
   só faltam **duas** linhas, pegas no painel do Supabase:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API → service_role>
   DATABASE_URL=<Connect → Session pooler, com a senha do banco>
   ```
   > Sem esse arquivo o site ainda roda, mas os scripts (migrações e importações)
   > não funcionam.
3. Rodar:
   ```bash
   npm run dev
   ```
   e abrir http://localhost:3000

### Comandos úteis
- `npm run dev` — rodar localmente
- `npm run migrate` — aplicar migrações do banco (`supabase/migrations/`)
- `.\salvar.ps1 "mensagem"` — commit + push (publica na nuvem)
- `.\atualizar.ps1` — puxar as últimas alterações
