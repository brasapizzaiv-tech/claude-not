// Quais telas do painel merecem a largura do monitor, e quais não.
//
// A regra: tabela e lista densa querem largura — a leitura é em coluna, e
// espaço sobrando vira quebra de linha desnecessária. Formulário NÃO quer: um
// campo esticado em 1920px faz o olho viajar da etiqueta até o valor, e linha
// de texto longa demais cansa (a tipografia clássica fala em ~65 caracteres).
//
// Duas correções que a primeira versão deste script me ensinou:
//
//  • a tabela quase nunca está no `page.tsx` — mora num componente vizinho
//    (`client.tsx`, `*-tabela.tsx`). Olhar só o arquivo do container deixava
//    metade das telas de lista de fora;
//  • largura pequena (até `max-w-xl`) é ESCOLHA, não sobra: quiosque da
//    balança, telas de celular, cupom de comanda. Essas não se mexe.
//
// Uso: node scripts/largura-telas.mjs [--aplicar]
import fs from "node:fs";
import path from "node:path";

const base = "C:/Users/NeoTech/claude not/";
const aplicar = process.argv.includes("--aplicar");

const arqs = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) anda(p);
    else if (/\.tsx$/.test(e.name)) arqs.push(p);
  }
})(base + "src/app/(painel)");

/** Largura pequena é decisão de desenho: não mexer. */
const ESTREITA_DE_PROPOSITO = /^max-w-(xs|sm|md|lg|xl|2xl)$/;
/** Já é larga o bastante. */
const JA_LARGA = /max-w-\[1[0-9]{3}px\]|max-w-\[2[0-9]{3}px\]|max-w-full|max-w-none/;

/** Telas que NUNCA ficam fluidas, com o motivo. */
const NUNCA = {
  "salao/balanca/quiosque/quiosque.tsx": "quiosque de autoatendimento: desenho centrado, de propósito",
  "reservas/hoje/mobile.tsx": "tela de celular",
  "etiquetas/scanner/scanner.tsx": "leitor no celular",
  "salao/comandas/[id]/page.tsx": "cupom da comanda: largura de papel",
  // Estas duas o detector chamou de tabela/grade, mas são FORMULÁRIO: grade de
  // campos pequenos. Esticados em 1920px, três campinhos ficariam espalhados
  // de ponta a ponta — pior do que estão.
  "fiscal/page.tsx": "formulário de ajustes fiscais",
  "financeiro/caixa/fechamento-form.tsx": "formulário de fechamento do caixa",
};

/** O conteúdo do arquivo MAIS o dos componentes vizinhos que ele importa. */
function conteudoComVizinhos(p) {
  let s = fs.readFileSync(p, "utf8");
  const dir = path.dirname(p);
  for (const m of s.matchAll(/from "\.\/([A-Za-z0-9_-]+)"/g)) {
    const viz = path.join(dir, m[1] + ".tsx");
    if (fs.existsSync(viz)) s += "\n" + fs.readFileSync(viz, "utf8");
  }
  return s;
}

const larga = [], estreita = [], pulou = [], jaLarga = [];

for (const p of arqs) {
  const bruto = fs.readFileSync(p, "utf8");
  const rel = p.split(path.sep).join("/").replace(base, "");
  const curto = rel.replace("src/app/(painel)/", "");

  const m = bruto.match(/className="mx-auto (max-w-[a-z0-9[\]-]+)([^"]*)"/);
  if (!m) continue;
  const w = m[1];

  if (NUNCA[curto]) { pulou.push([curto, w, NUNCA[curto]]); continue; }
  if (JA_LARGA.test(w)) { jaLarga.push([curto, w]); continue; }
  if (ESTREITA_DE_PROPOSITO.test(w)) { pulou.push([curto, w, "largura pequena: escolha de desenho"]); continue; }

  const s = conteudoComVizinhos(p);
  const temTabela = /<table/.test(s);
  const temGrade = /(md:|lg:|xl:)?grid-cols-(3|4|5|6|7|8)/.test(s);

  if (temTabela || temGrade) larga.push([curto, w, temTabela ? "tabela" : "grade"]);
  else estreita.push([curto, w]);
}

console.log(`=== FICAM FLUIDAS (${larga.length}) ===`);
for (const [rel, w, tipo] of larga) console.log(`  ${w.padEnd(10)} ${tipo.padEnd(8)} ${rel}`);
console.log(`\n=== MANTÊM A COLUNA ESTREITA (${estreita.length}) ===`);
for (const [rel, w] of estreita) console.log(`  ${w.padEnd(10)} ${rel}`);
console.log(`\n=== NÃO MEXER (${pulou.length}) ===`);
for (const [rel, w, motivo] of pulou) console.log(`  ${w.padEnd(10)} ${rel}  — ${motivo}`);
console.log(`\n=== JÁ ERAM LARGAS (${jaLarga.length}) ===`);
for (const [rel, w] of jaLarga) console.log(`  ${w.padEnd(14)} ${rel}`);

if (!aplicar) {
  console.log("\n(só mostrei. Rode com --aplicar.)");
  process.exit(0);
}

let n = 0;
for (const [rel, w] of larga) {
  const p = base + "src/app/(painel)/" + rel;
  let s = fs.readFileSync(p, "utf8");
  const antes = s;
  s = s.replace(`className="mx-auto ${w}`, `className="w-full`);
  if (s !== antes) { fs.writeFileSync(p, s); n++; }
}
console.log(`\ntelas que passaram a acompanhar o monitor: ${n}`);
