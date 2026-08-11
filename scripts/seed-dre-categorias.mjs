// Semeia o plano de contas (dre_categorias) com a estrutura do DRE da Brasa.
// Idempotente: on conflict (tipo, nome) do nothing.
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const cats = [
  // tipo, grupo, [nomes...]
  ["receita", "Receita Bruta", ["Dinheiro","PIX/Transferência","Cartão de Débito","Cartão de Crédito","Marketplaces (online)","Vale Refeição","Vendas Externas (eventos)","Dark Kitchen","Vendas do Fiado","Couvert Artístico"]],
  ["deducao", "Deduções", ["Serviço 10%","Cortesias","Consumo dos sócios","Permuta"]],
  ["cmv", "CMV", ["Compras (Pedidos)","Carnes","Aves","Frutos do Mar","Hortifruti","Embutidos","Insumos","Laticínios e Frios","Padaria","Bebidas Alcoólicas","Águas e Refrigerantes","Vinhos","Embalagens"]],
  ["cmo", "CMO Variável", ["CMO Eventual / Diaristas","Couvert Artístico (custo)","Bandas Contratadas","Refeições das bandas","Royalties e taxas de franquia","Entregadores Delivery","Entregadores Dark Kitchen","Entregadores DP"]],
  ["tarifa", "Tarifas", ["Cartão de Crédito e Débito","Tickets","Marketplace iFood","Marketplace aiqfome"]],
  ["imposto", "Impostos", ["Simples Nacional"]],
  ["despesa_fixa", "Ocupação", ["Aluguel do estabelecimento","IPTU","Outros impostos e taxas"]],
  ["despesa_fixa", "Utilidades Públicas", ["Conta de Luz","Conta de Água","Telefone / Celular","Conta de Gás"]],
  ["despesa_fixa", "Administrativas", ["Material de Escritório / Informática","Sistema Gerencial / CRM","Internet","Seguro","Viagens / Estadias","Aluguel de Equipamentos","Locomoção / Fretes","Assinaturas / Aplicativos","Despesas com veículos","Materiais de Limpeza","Alvará / Taxas de funcionamento","Embalagens e Descartáveis (geral)","Outras administrativas"]],
  ["despesa_fixa", "Marketing", ["Agência / Anúncios / Eventos","Permutas por divulgação","ADS Meta e Google","Divulgação com retorno"]],
  ["despesa_fixa", "Manutenção", ["Predial / Corretiva","Máquinas / Equipamentos","Preventiva"]],
  ["despesa_fixa", "Serviços Terceirizados", ["Contabilidade","Segurança","Jardineiro","Faxineira","Dedetização","Advocacia","Consultoria / Mentoria","Assessoria Nutricional"]],
  ["despesa_fixa", "Pessoal (CMO)", ["Salários","Vale-Transporte","INSS","FGTS","Salário Família","Outras despesas com pessoal","Provisionamento 13º e Férias","Férias","13º salário","Admissão / Demissão","Medicina do Trabalho","Refeições internas","Retenção IRPF / Sindicato","Custeio Alimentação Diretores","Cursos / Treinamentos","Uniformes"]],
  ["despesa_fixa", "Pró-labore", ["Pró-Labore"]],
  ["financeira", "Financeiras", ["Despesas Bancárias","IOF","Custos Financeiros / Tarifas / Anuidade"]],
  ["nao_operacional", "Não Operacional", ["Consórcio","Investimento em outros negócios","Distribuição de lucro: Sócio 1","Distribuição de lucro: Sócio 2","Distribuição de lucro: Sócio 3","Mobiliário / Louças","Equipamentos eletrônicos","Ampliação / obras / melhorias","Equipamentos / Utensílios de cozinha","Empréstimos bancários","Parcelamento de impostos"]],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let ordem = 0, n = 0;
for (const [tipo, grupo, nomes] of cats) {
  for (const nome of nomes) {
    ordem += 1;
    const r = await c.query(
      "insert into dre_categorias (tipo, grupo, nome, ordem) values ($1,$2,$3,$4) on conflict (tipo, nome) do nothing",
      [tipo, grupo, nome, ordem],
    );
    n += r.rowCount;
  }
}
console.log(`✓ ${n} categorias inseridas (de ${ordem} no plano de contas).`);
await c.end();
