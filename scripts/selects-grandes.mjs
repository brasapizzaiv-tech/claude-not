// Quais campos de escolha do sistema têm lista GRANDE e ainda não deixam
// digitar pra procurar.
//
// O `<select>` do navegador não tem busca: com 117 categorias ou 67
// fornecedores, achar um item vira rolar a lista inteira. Onde a lista vem de
// dados (`.map(...)`), ela cresce sozinha com o uso — é aí que o campo com
// busca compensa. Lista curta e fixa (Todos / Pix / Boleto) fica como está:
// trocar por busca só atrapalharia.
import fs from "node:fs";
import path from "node:path";

const base = "C:/Users/NeoTech/claude not/";
const arqs = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) anda(p);
    else if (/\.tsx$/.test(e.name)) arqs.push(p);
  }
})(base + "src");

const achados = [];
for (const p of arqs) {
  const s = fs.readFileSync(p, "utf8");
  const rel = p.split(path.sep).join("/").replace(base, "");
  if (rel.includes("components/combobox") || rel.includes("escolha-com-busca")) continue;

  // Cada <select ...> até o </select>.
  let i = 0;
  while ((i = s.indexOf("<select", i)) >= 0) {
    const fim = s.indexOf("</select>", i);
    if (fim < 0) break;
    const bloco = s.slice(i, fim);
    const linha = s.slice(0, i).split("\n").length;
    // Lista que vem de dados: tem um .map() gerando <option>.
    const deDados = /\.map\(/.test(bloco) && /<option/.test(bloco);
    if (deDados) {
      const fonte = (bloco.match(/\{\s*([A-Za-z0-9_.]+)\s*\.map\(/) || [])[1] ?? "?";
      const nome = (bloco.match(/name="([^"]+)"/) || [])[1] ?? "(sem nome)";
      achados.push({ rel, linha, fonte, nome });
    }
    i = fim + 1;
  }
}

console.log(`campos de escolha com lista vinda de dados: ${achados.length}\n`);
const porArq = new Map();
for (const a of achados) {
  const l = porArq.get(a.rel) ?? [];
  l.push(a);
  porArq.set(a.rel, l);
}
for (const [rel, l] of [...porArq.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rel}`);
  for (const a of l) console.log(`    :${String(a.linha).padEnd(4)} lista de \`${a.fonte}\`  name="${a.nome}"`);
}
