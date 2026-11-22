"use server";

// Arquivo de Pix em lote da tela Semana (migration 0324). O sistema só MONTA o
// arquivo; o dono importa no Internet Banking e aprova lá.
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";
import { adminDaEmpresa } from "@/lib/supabase/admin-empresa";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { montarRemessaSicoob, normalizarChave, type ItemPix } from "@/lib/cnab240-pix";

export type ConfigPixLote = {
  banco: string;
  convenio: string;
  cnpj: string;
  nome_empresa: string;
  agencia: string;
  agencia_dv: string;
  conta: string;
  conta_dv: string;
  nsa: number;
};

export type ArquivoGerado = { nsa: number; nome_arquivo: string; data_pagamento: string; qtd: number; total: number; criado_em: string };

const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function completa(c: Partial<ConfigPixLote> | null): c is ConfigPixLote {
  return !!(c && c.convenio && so(c.cnpj).length === 14 && so(c.agencia) && so(c.conta) && so(c.conta_dv).length === 1 && c.nome_empresa);
}

async function empresaOuErro() {
  const id = await empresaAtualId();
  if (!id) throw new Error("Não identifiquei a empresa deste acesso.");
  return id;
}

/** Dados do banco (pra janela) + os últimos arquivos gerados. */
export async function lerPixLote(): Promise<{ config: ConfigPixLote | null; pronta: boolean; podeEditar: boolean; ultimos: ArquivoGerado[] }> {
  await exigirAcesso("/colaboradores");
  const db = adminDaEmpresa(await empresaOuErro());
  const [{ data: c }, { data: ult }, prof] = await Promise.all([
    db.from("pagamento_lote_config").select("banco, convenio, cnpj, nome_empresa, agencia, agencia_dv, conta, conta_dv, nsa").maybeSingle(),
    db.from("pagamento_lote_arquivos").select("nsa, nome_arquivo, data_pagamento, qtd, total, criado_em").order("criado_em", { ascending: false }).limit(5),
    perfilDaSessao(),
  ]);
  const config = (c as ConfigPixLote | null) ?? null;
  return { config, pronta: completa(config), podeEditar: prof?.papel === "dono", ultimos: (ult as ArquivoGerado[] | null) ?? [] };
}

/** Grava a conta da empresa no banco. Só o dono: muda pra onde o dinheiro sai. */
export async function salvarPixLoteConfig(campos: Record<string, string>): Promise<{ ok: true } | { ok: false; erro: string }> {
  await exigirAcesso("/colaboradores");
  if ((await perfilDaSessao())?.papel !== "dono") return { ok: false, erro: "Só o dono muda os dados do banco." };
  const convenio = String(campos.convenio ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cnpj = so(campos.cnpj);
  const agencia = so(campos.agencia);
  const agenciaDv = String(campos.agencia_dv ?? "").trim().toUpperCase().slice(0, 1);
  const conta = so(campos.conta);
  const contaDv = so(campos.conta_dv);
  const nome = String(campos.nome_empresa ?? "").trim().slice(0, 60);
  if (!convenio || convenio.length > 20) return { ok: false, erro: "Informe o código do convênio (até 20 letras/números)." };
  if (cnpj.length !== 14) return { ok: false, erro: "O CNPJ precisa ter 14 números." };
  if (!agencia || agencia.length > 5) return { ok: false, erro: "A agência tem até 5 números." };
  if (!conta || conta.length > 12) return { ok: false, erro: "A conta tem até 12 números (sem o dígito)." };
  if (contaDv.length !== 1) return { ok: false, erro: "O dígito da conta é um número só." };
  if (!nome) return { ok: false, erro: "Informe o nome da empresa (como está no banco)." };
  const db = adminDaEmpresa(await empresaOuErro());
  const { error } = await db.from("pagamento_lote_config").upsert(
    { banco: "756", convenio, cnpj, agencia, agencia_dv: agenciaDv || null, conta, conta_dv: contaDv, nome_empresa: nome, atualizado_em: new Date().toISOString() },
    { onConflict: "empresa_id" },
  );
  if (error) return { ok: false, erro: "Não deu pra salvar. Confira a internet e tente de novo." };
  return { ok: true };
}

/** Monta o arquivo de remessa. Os valores vêm da tela; as chaves, do cadastro. */
export async function gerarArquivoPix(entrada: {
  segunda: string;
  dataPagamento: string;
  itens: { colaboradorId: string; valor: number }[];
}): Promise<
  | { ok: true; nome: string; conteudo: string; qtd: number; total: number; fora: string[] }
  | { ok: false; erro: string }
> {
  await exigirAcesso("/colaboradores");
  const empresaId = await empresaOuErro();
  const db = adminDaEmpresa(empresaId);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.dataPagamento)) return { ok: false, erro: "Escolha a data do pagamento." };
  if (entrada.dataPagamento < hojeSP()) return { ok: false, erro: "A data do pagamento não pode ser antes de hoje." };
  const pedidos = entrada.itens.filter((i) => i.colaboradorId && Number(i.valor) > 0.005);
  if (!pedidos.length) return { ok: false, erro: "Marque pelo menos uma pessoa com valor." };
  if (pedidos.length > 500) return { ok: false, erro: "Muitas pessoas num arquivo só." };

  const { data: c } = await db.from("pagamento_lote_config").select("banco, convenio, cnpj, nome_empresa, agencia, agencia_dv, conta, conta_dv, nsa").maybeSingle();
  const config = c as ConfigPixLote | null;
  if (!completa(config)) return { ok: false, erro: "Preencha os dados do banco (convênio, CNPJ, agência e conta) antes." };

  const { data: cs } = await db.from("colaboradores").select("id, nome, cpf, pix_tipo, pix_chave").in("id", pedidos.map((p) => p.colaboradorId));
  const porId = new Map(((cs ?? []) as { id: string; nome: string; cpf: string | null; pix_tipo: string | null; pix_chave: string | null }[]).map((x) => [x.id, x]));

  const fora: string[] = [];
  const itens: (ItemPix & { colaboradorId: string })[] = [];
  const dia = entrada.dataPagamento.slice(2).replace(/-/g, "");
  for (const p of pedidos) {
    const col = porId.get(p.colaboradorId);
    if (!col) continue;
    const chave = normalizarChave(col.pix_tipo, col.pix_chave);
    if (!chave) {
      fora.push(`${col.nome}: ${col.pix_chave ? "chave Pix não confere com o tipo" : "sem chave Pix"}`);
      continue;
    }
    itens.push({
      colaboradorId: col.id,
      nome: col.nome,
      valorCentavos: Math.round(Number(p.valor) * 100),
      tipo: chave.tipo,
      chave: chave.chave,
      cpf: col.cpf,
      seuNumero: `EQ${dia}-${String(itens.length + 1).padStart(3, "0")}`,
    });
  }
  if (!itens.length) return { ok: false, erro: `Ninguém pôde entrar no arquivo. ${fora.join("; ")}` };

  // Número sequencial do arquivo: cresce a cada arquivo (o banco exige).
  // Grava só se ninguém gerou outro no meio (compara o número antigo).
  let nsa = 0;
  for (let tentativa = 0; tentativa < 3 && !nsa; tentativa++) {
    const { data: atual } = await db.from("pagamento_lote_config").select("nsa").maybeSingle();
    const velho = Number((atual as { nsa: number } | null)?.nsa ?? 0);
    const { data: gravou } = await db.from("pagamento_lote_config").update({ nsa: velho + 1 }).eq("nsa", velho).select("nsa");
    if (gravou?.length) nsa = velho + 1;
  }
  if (!nsa) return { ok: false, erro: "Não deu pra numerar o arquivo. Tente de novo." };

  let conteudo: string;
  try {
    conteudo = montarRemessaSicoob(
      { cnpj: config.cnpj, nome: config.nome_empresa, convenio: config.convenio, agencia: config.agencia, agenciaDv: config.agencia_dv, conta: config.conta, contaDv: config.conta_dv },
      itens,
      { nsa, dataPagamento: entrada.dataPagamento },
    );
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu pra montar o arquivo." };
  }

  const total = Math.round(itens.reduce((s, i) => s + i.valorCentavos, 0)) / 100;
  const nome = `PIX-SICOOB-${entrada.dataPagamento.split("-").reverse().join("")}-${String(nsa).padStart(4, "0")}.REM`;
  const { user } = await usuarioDaSessao();
  await db.from("pagamento_lote_arquivos").insert({
    banco: "756",
    nsa,
    nome_arquivo: nome,
    segunda: /^\d{4}-\d{2}-\d{2}$/.test(entrada.segunda) ? entrada.segunda : null,
    data_pagamento: entrada.dataPagamento,
    qtd: itens.length,
    total,
    // Guarda o que foi no arquivo (sem a chave inteira: só o tipo e o fim dela).
    itens: itens.map((i) => ({ colaborador_id: i.colaboradorId, nome: i.nome, valor: i.valorCentavos / 100, tipo: i.tipo, chave_fim: i.chave.slice(-4), seu_numero: i.seuNumero })),
    criado_por: user?.id ?? null,
  });

  return { ok: true, nome, conteudo, qtd: itens.length, total, fora };
}
