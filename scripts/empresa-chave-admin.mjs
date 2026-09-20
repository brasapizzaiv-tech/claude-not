// VARREDURA DA CHAVE ADMINISTRATIVA
//
// A chave administrativa (`createAdminClient`) passa por cima de TODAS as
// regras do banco. É como os apps por link funcionam: o garçom, a equipe, o
// entregador e o cliente do cardápio não fazem login. Nesses lugares o filtro
// por empresa não é automático — tem que estar escrito à mão.
//
// O script olha só as consultas feitas COM ESSA CHAVE (não as do acesso
// normal, que o banco já filtra sozinho) e separa em:
//
//   ✅ presa     — diz a empresa, ou parte de um id/token que já pertence a
//                  uma empresa só (o token do link, o id de um pedido).
//   ⚠  conferir  — não achei nada prendendo; precisa de olho humano.
//   ◈ depende    — está num núcleo compartilhado que recebe o acesso de fora
//                  (`db: Db`): às vezes é o normal, às vezes o administrativo.
//
// Uso: node scripts/empresa-chave-admin.mjs [--tudo]
import fs from "node:fs";
import path from "node:path";

const base = "C:/Users/NeoTech/claude not/";
const tudo = process.argv.includes("--tudo");

const arqs = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) anda(p);
    else if (/\.tsx?$/.test(e.name)) arqs.push(p);
  }
})(base + "src");

// Não têm dono: são do sistema, não de um restaurante.
const semDono = new Set(["empresas", "profiles", "_migrations"]);

// O que conta como "presa".
const prendem = [
  /\.eq\("empresa_id"/, /empresa_id:/, /\.in\("empresa_id"/,
  /\.eq\("token"/, /\.eq\("id",/, /\.in\("id",/,
  /\.eq\("comanda_id"/, /\.in\("comanda_id"/, /\.eq\("pedido_id"/,
  /\.eq\("contagem_id"/, /\.eq\("cotacao_id"/, /\.eq\("colaborador_id"/,
  /\.eq\("entregador_id"/, /\.eq\("nota_id"/, /\.eq\("ref_id"/,
  /\.eq\("execucao_id"/, /\.eq\("modelo_id"/, /\.eq\("item_id"/,
];

const presas = [], conferir = [], depende = [];
let arquivos = 0;

for (const p of arqs) {
  const s = fs.readFileSync(p, "utf8");
  const rel = p.split(path.sep).join("/").replace(base, "");

  // Quais variáveis guardam a chave administrativa neste arquivo.
  const vars = new Set(
    [...s.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*createAdminClient\(\)/g)].map((m) => m[1]),
  );
  // Núcleo compartilhado: recebe o acesso de fora, pode ser qualquer um.
  const ehNucleo = /\bdb\s*:\s*Db\b/.test(s);
  if (ehNucleo) vars.add("db");
  if (!vars.size) continue;
  arquivos++;

  for (const v of vars) {
    // `v.from("tabela")` — e nunca `v.storage.from(...)`, que é arquivo.
    const re = new RegExp(`(?<!storage)\\b${v}\\s*\\.\\s*from\\(\\s*"([a-z_]+)"\\s*\\)`, "g");
    let m;
    while ((m = re.exec(s))) {
      const tabela = m[1];
      if (semDono.has(tabela)) continue;
      const antes = s.slice(Math.max(0, m.index - 60), m.index);
      if (/storage\s*$|storage\s*\.\s*$/.test(antes)) continue;

      const resto = s.slice(m.index, m.index + 700);
      const fim = resto.search(/;\s*\n|\n\s*\n/);
      const trecho = fim > 0 ? resto.slice(0, fim) : resto;
      const linha = s.slice(0, m.index).split("\n").length;
      const item = { rel, linha, tabela, trecho: trecho.replace(/\s+/g, " ").slice(0, 100) };

      if (prendem.some((r) => r.test(trecho))) presas.push(item);
      else if (v === "db" && ehNucleo) depende.push(item);
      else conferir.push(item);
    }
  }
}

const mostra = (titulo, lista) => {
  if (!lista.length) return;
  console.log(`\n${titulo}`);
  const porArq = new Map();
  for (const c of lista) {
    const l = porArq.get(c.rel) ?? [];
    l.push(c);
    porArq.set(c.rel, l);
  }
  for (const [rel, l] of [...porArq.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rel}`);
    for (const c of l) console.log(`    :${String(c.linha).padEnd(4)} ${c.tabela.padEnd(22)} ${c.trecho}`);
  }
};

console.log(`arquivos com a chave administrativa (ou núcleo compartilhado): ${arquivos}`);
console.log(`consultas: ${presas.length + conferir.length + depende.length}`);
console.log(`  ✅ presas a uma empresa: ${presas.length}`);
console.log(`  ⚠  por conferir:        ${conferir.length}`);
console.log(`  ◈ dependem de quem chama: ${depende.length}`);

mostra("⚠  POR CONFERIR", conferir);
if (tudo) {
  mostra("◈ DEPENDEM DE QUEM CHAMA", depende);
  mostra("✅ PRESAS", presas);
}
