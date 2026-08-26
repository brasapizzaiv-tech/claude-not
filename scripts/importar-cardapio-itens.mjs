// Carrega o catálogo de pratos do buffet (cardapio_itens) a partir da lista de
// adicionais da "Marmita Tradicional" do sistema de pedidos.
//
// Uso: node scripts/importar-cardapio-itens.mjs
//
// Os nomes vêm em Caixa Alta Mista lá; aqui viram frase (primeira maiúscula),
// que é como o quadro do restaurante escreve. Roda quantas vezes quiser: item
// repetido é ignorado e nada do que já existe é apagado.
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const PROTEINAS = [
  "Alcatra grelhada", "Almôndegas ao forno", "Almôndegas ao molho", "Assado de tiras",
  "Bife de frango acebolado", "Bife de frango alho e óleo", "Bife de frango ao molho de laranja",
  "Bife de frango ao molho de maracujá", "Bife de frango ao molho de nata",
  "Bife de frango ao molho de requeijão", "Bife de frango com creme de milho",
  "Bife de frango com queijo", "Bife de frango empanado",
  "Bife de gado", "Bife de gado à cavalo (com ovo frito)", "Bife de gado acebolado",
  "Bife de gado à milanesa", "Bife de gado ao alho e óleo", "Bife de gado ao molho madeira",
  "Bife de gado ao molho pesto", "Bife de gado ao molho sugo", "Bife de gado à patrão",
  "Bife de gado à rolê", "Bife de gado com queijo", "Bife de gado suíço (cebola caramelizada)",
  "Bife de porco", "Bisteca acebolada",
  "Bolinho de bacon", "Bolinho de carne com requeijão", "Bolinho de carne suína",
  "Bolinho de costela", "Bolinho de salmão",
  "Carne de panela", "Carne grelhada", "Casquinha de peixe", "Chuleta bovina",
  "Coração de frango", "Costela de gado assada", "Costela suína com farofa",
  "Costelinha suína assada", "Costelinha suína barbecue",
  "Coxinha à milanesa", "Coxinha assada", "Coxinha da asa à milanesa",
  "Cubos de frango ao molho branco", "Entrecote grelhado", "Entreveiro",
  "Feijoada", "Fígado acebolado", "Fígado à milanesa",
  "Frango acebolado", "Frango à romana", "Frango assado", "Frango escabelado",
  "Frango grelhado", "Fricassê", "Galinha escabelada", "Iscas de gado",
  "Lentilhada", "Linguiça cozida",
  "Molho bolonhesa", "Molho de calabresa", "Molho de carne", "Molho de frango",
  "Moqueca de peixe", "Omelete ao forno", "Ovo frito", "Ovos rancheiros",
  "Panqueca de carne desfiada",
  "Parmegiana de frango", "Parmegiana de gado",
  "Peixe à milanesa", "Peixe ao molho branco", "Peixe à portuguesa", "Peixe empanado",
  "Picanha grelhada", "Queijo coalho", "Queijo coalho empanado", "Salsichão",
  "Schnitzel de porco", "Strogonoffe", "Suflê de salmão",
  "Suíno à califórnia", "Suíno alho e óleo", "Suíno à milanesa", "Suíno à pururuca",
  "Suíno assado", "Suíno com barbecue", "Suíno com farofa", "Suíno com geleia de abacaxi",
  "Suíno com mostarda e mel", "Suíno na chapa",
];

const CARBOIDRATOS = [
  "Abobrinha à dorê", "Abobrinha à milanesa", "Abobrinha ao forno", "Abobrinha à pizzaiola",
  "Abobrinha empanada", "Abobrinha recheada", "Abobrinha refogada",
  "Aipim ao alho e óleo", "Aipim com alho", "Aipim com bacon e cebola", "Aipim com cebola",
  "Aipim com farofa", "Aipim cozido", "Aipim cozido com alho frito", "Aipim frito",
  "Aipim frito com queijo",
  "Anéis de cebola",
  "Arroz à baiana", "Arroz à grega", "Arroz alemão", "Arroz ao forno",
  "Arroz ao forno com carne", "Arroz ao forno com frango", "Arroz à pizzaiola",
  "Arroz biro biro", "Arroz branco", "Arroz colorido", "Arroz com alho poró",
  "Arroz com atum e ovo", "Arroz com brócolis", "Arroz com brócolis e bacon",
  "Arroz integral", "Arroz tropeiro",
  "Banana à milanesa",
  "Batata alemã", "Batata ao forno", "Batata doce ao forno", "Batata doce cozida",
  "Batata doce frita", "Batata doce gratinada", "Batata fatiada ao forno", "Batata frita",
  "Batata recheada com frango", "Batata rústica", "Batata sauté",
  "Berinjela à pizzaiola", "Bolinho de arroz", "Bolinho de espinafre", "Bolo salgado",
  "Brócolis gratinado", "Capelete ao alho e óleo",
  "Carreteiro", "Carreteiro de linguiça", "Cebola gratinada",
  "Cestinha de frango", "Cestinha de strogonoff",
  "Chips de batata", "Chips de batata doce", "Choripan", "Chucrute",
  "Couve com carne suína desfiada", "Couve flor à dorê", "Couve flor ao forno",
  "Couve flor gratinada", "Couve flor mostarda e mel", "Couve refogada",
  "Dadinho de tapioca",
  "Empadão com bolonhesa", "Empadão de carne", "Empadão de frango",
  "Empadinha", "Empadinha de frango", "Empadinha de legumes", "Enroladinho",
  "Escondidinho de aipim com frango", "Escondidinho de batata com calabresa",
  "Escondidinho de batata com carne", "Escondidinho de batata com frango",
  "Escondidinho de batata doce com carne suína desfiada", "Escondidinho de calabresa",
  "Espaguete na manteiga com ervas", "Farofa de bacon e banana",
  "Feijão", "Feijão mexido", "Galinhada",
  "Lasanha 4 queijos", "Lasanha bolonhesa", "Lasanha caprese", "Lasanha chilena",
  "Lasanha de brócolis", "Lasanha de calabresa", "Lasanha de carne de panela",
  "Lasanha de frango", "Lasanha de milho", "Lasanha de presunto e queijo",
  "Lasanha portuguesa",
  "Legumes na manteiga", "Lentilha", "Mandiocada",
  "Massa caseira", "Massa parafuso ao alho e óleo",
  "Moranga caramelizada", "Moranga gratinada com frango", "Nhoque alho e óleo",
  "Panqueca de milho", "Panqueca de presunto e queijo", "Pão de alho",
  "Pastel de pizza",
  "Penne 4 queijos", "Penne à bolonhesa", "Penne à carbonara", "Penne alho e óleo",
  "Penne ao molho branco", "Penne ao molho cheddar", "Penne ao molho de queijo",
  "Penne ao pesto", "Penne com brócolis e bacon", "Penne com molho de nata e carne",
  "Penne com strogonoff",
  "Polenta cremosa", "Polenta frita", "Polenta gratinada", "Purê de batata",
  "Quiche de salmão", "Ratatouille", "Raviólli ao molho branco", "Raviólli ao molho sugo",
  "Risoto 4 queijos", "Risoto de alho poró", "Risoto de cebola caramelizada e bacon",
  "Risoto de frango", "Risoto de pêra e gorgonzola",
  "Risoto de provolone com tomate seco e parmesão", "Risoto de tomate seco e parmesão",
  "Rondelli ao molho branco", "Seleta de legumes",
  "Tomate recheado com calabresa", "Tortei ao molho sugo", "Vagem ao molho branco",
];

const ESPECIAL = [
  "Abacaxi assado", "Bolinho de chuva", "Cestinha de coco",
  "Creme branco", "Creme de chocolate",
  "Lasanha de chocolate", "Lasanha de chocolate branco com abacaxi",
  "Lasanha de chocolate com morango", "Lasanha de negresco",
  "Mini churros",
  "Panqueca chocolate branco e nozes", "Panqueca de banoffee", "Panqueca de charge",
  "Panqueca de doce de leite", "Panqueca de negresco", "Panqueca de prestígio",
  "Panqueca romeu e julieta",
  "Pastel de chocolate", "Pastel de doce de leite",
  "Pudim", "Rabanada", "Sagu com creme", "Torta de bolacha",
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  let novos = 0;
  let repetidos = 0;

  for (const [grupo, lista] of [
    ["proteinas", PROTEINAS],
    ["carboidratos", CARBOIDRATOS],
    ["especial", ESPECIAL],
  ]) {
    for (const nome of [...new Set(lista)]) {
      const r = await client.query(
        `insert into cardapio_itens (grupo, nome) values ($1, $2)
         on conflict (grupo, nome) do nothing`,
        [grupo, nome],
      );
      if (r.rowCount > 0) novos++;
      else repetidos++;
    }
  }

  const total = await client.query(
    "select grupo, count(*)::int n from cardapio_itens group by grupo order by grupo",
  );
  console.log(`\n✓ ${novos} item(ns) novo(s) · ${repetidos} já existia(m).`);
  console.log("Catálogo agora:", total.rows.map((r) => `${r.grupo}: ${r.n}`).join(" · "), "\n");
  await client.end();
}

main().catch(async (e) => {
  console.error("\n❌", e.message, "\n");
  try { await client.end(); } catch {}
  process.exit(1);
});
