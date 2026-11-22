"use server";

// Arquivo de Pix em lote da tela Semana (migration 0324). O sistema só MONTA o
// arquivo; o dono importa no Internet Banking e aprova lá.
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";
import { adminDaEmpresa } from "@/lib/supabase/admin-empresa";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { montarRemessaSicoob, normalizarChave, type ItemPix } from "@/lib/cnab240-pix";
import { lerComprovantesSicoob } from "@/lib/comprovante-pix-sicoob";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
/** Pix que o banco confirmou (comprovante lido): essa pessoa já recebeu nesta semana. */
export type PixPago = { colaborador_id: string; valor: number; pago_em: string };

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
export async function lerPixLote(segunda?: string): Promise<{ config: ConfigPixLote | null; pronta: boolean; podeEditar: boolean; ultimos: ArquivoGerado[]; pagos: PixPago[] }> {
  await exigirAcesso("/colaboradores");
  const db = adminDaEmpresa(await empresaOuErro());
  const semana = segunda && /^\d{4}-\d{2}-\d{2}$/.test(segunda) ? segunda : null;
  const [{ data: c }, { data: ult }, prof, { data: pg }] = await Promise.all([
    db.from("pagamento_lote_config").select("banco, convenio, cnpj, nome_empresa, agencia, agencia_dv, conta, conta_dv, nsa").maybeSingle(),
    db.from("pagamento_lote_arquivos").select("nsa, nome_arquivo, data_pagamento, qtd, total, criado_em").order("criado_em", { ascending: false }).limit(5),
    perfilDaSessao(),
    semana
      ? db.from("pagamento_lote_pagos").select("colaborador_id, valor, pago_em").eq("segunda", semana)
      : Promise.resolve({ data: [] as PixPago[] }),
  ]);
  const config = (c as ConfigPixLote | null) ?? null;
  return {
    config,
    pronta: completa(config),
    podeEditar: prof?.papel === "dono",
    ultimos: (ult as ArquivoGerado[] | null) ?? [],
    pagos: ((pg ?? []) as PixPago[]).map((p) => ({ ...p, valor: Number(p.valor) })),
  };
}

export type PagoConfirmado = { colaboradorId: string; nome: string; valor: number; data: string; nsa: number; jaLancado: boolean };

/**
 * Lê o PDF de comprovantes do Sicoob e acha cada Pix nos arquivos desta semana
 * (pedaço do CPF que o banco mostra + valor exato). Com gravar=true guarda quem
 * recebeu (não entra de novo no próximo arquivo) e, de quem já estava lançado na
 * semana, marca a conta como paga em Pix. Quem ainda não foi lançado volta pra
 * tela, que lança com a mesma conta do botão "Lançar".
 */
export async function lerComprovantesPix(formData: FormData): Promise<
  | { ok: true; encontrados: PagoConfirmado[]; problemas: string[]; jaRegistrados: number; contasPagas: number }
  | { ok: false; erro: string }
> {
  await exigirAcesso("/colaboradores");
  const segunda = String(formData.get("segunda") ?? "");
  const gravar = formData.get("gravar") === "1";
  const arquivo = formData.get("arquivo") as File | null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda)) return { ok: false, erro: "Semana inválida. Atualize a tela e tente de novo." };
  if (!arquivo || arquivo.size === 0) return { ok: false, erro: "Escolha o PDF dos comprovantes." };
  if (arquivo.size > 15 * 1024 * 1024) return { ok: false, erro: "Arquivo muito grande (máx. 15 MB)." };

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return { ok: false, erro: "Esse arquivo não é PDF. No Sicoob: CNAB → Comprovantes → salvar em PDF." };
  }
  let texto = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const r = await extractText(await getDocumentProxy(bytes), { mergePages: true });
    texto = Array.isArray(r.text) ? r.text.join("\n") : String(r.text ?? "");
  } catch {
    return { ok: false, erro: "Não consegui ler esse PDF. Baixe de novo no Sicoob e tente outra vez." };
  }
  const comprovantes = lerComprovantesSicoob(texto);
  if (!comprovantes.length) return { ok: false, erro: "Não achei comprovante de Pix nesse PDF. Use o PDF dos comprovantes do Sicoob (CNAB → Comprovantes)." };

  const empresaId = await empresaOuErro();
  const db = adminDaEmpresa(empresaId);

  // O que foi mandado pro banco nesta semana: pessoa → valores e de qual arquivo.
  const { data: arqs } = await db.from("pagamento_lote_arquivos").select("id, nsa, itens").eq("segunda", segunda).order("nsa");
  type ItemArq = { colaborador_id: string; nome: string; valor: number };
  const noArquivo = new Map<string, { arquivoId: string; nsa: number; centavos: number; nome: string }[]>();
  for (const a of (arqs ?? []) as { id: string; nsa: number; itens: ItemArq[] | null }[]) {
    for (const it of a.itens ?? []) {
      const l = noArquivo.get(it.colaborador_id) ?? [];
      l.push({ arquivoId: a.id, nsa: a.nsa, centavos: Math.round(Number(it.valor) * 100), nome: it.nome });
      noArquivo.set(it.colaborador_id, l);
    }
  }
  if (!noArquivo.size) return { ok: false, erro: "Nenhum arquivo Pix foi gerado pra esta semana. Abra a semana certa (a do arquivo pago)." };

  const ids = [...noArquivo.keys()];
  const { data: cs } = await db.from("colaboradores").select("id, nome, cpf, pix_tipo, pix_chave").in("id", ids);
  const meioDe = new Map<string, string>();
  for (const c of (cs ?? []) as { id: string; cpf: string | null; pix_tipo: string | null; pix_chave: string | null }[]) {
    const d = so(c.cpf).length === 11 ? so(c.cpf) : c.pix_tipo === "CPF" ? so(c.pix_chave) : "";
    if (d.length === 11) meioDe.set(c.id, d.slice(3, 9));
  }

  const [{ data: jaRows }, { data: pagosSemana }] = await Promise.all([
    db.from("pagamento_lote_pagos").select("id_transacao").in("id_transacao", comprovantes.map((c) => c.idTransacao)),
    db.from("pagamento_lote_pagos").select("colaborador_id, id_transacao").eq("segunda", segunda),
  ]);
  const jaGuardados = new Set(((jaRows ?? []) as { id_transacao: string }[]).map((r) => r.id_transacao));
  const pagoAntes = new Map(((pagosSemana ?? []) as { colaborador_id: string; id_transacao: string }[]).map((r) => [r.colaborador_id, r.id_transacao]));

  const problemas: string[] = [];
  const novos: { colaboradorId: string; nome: string; centavos: number; arquivoId: string; nsa: number; quando: string; idTransacao: string }[] = [];
  let jaRegistrados = 0;
  for (const c of comprovantes) {
    const brl = (c.valorCentavos / 100).toFixed(2).replace(".", ",");
    if (!c.ok) { problemas.push(`${c.nome}, R$ ${brl}: o banco diz "${c.situacao || "sem situação"}" — não conta como pago.`); continue; }
    if (jaGuardados.has(c.idTransacao)) { jaRegistrados++; continue; }
    const quem = c.cpfMeio ? ids.filter((id) => meioDe.get(id) === c.cpfMeio) : [];
    if (!quem.length) { problemas.push(`${c.nome}, R$ ${brl}: não achei essa pessoa nos arquivos desta semana.`); continue; }
    const achado = quem.flatMap((id) => (noArquivo.get(id) ?? []).filter((x) => x.centavos === c.valorCentavos).map((x) => ({ id, ...x })));
    // Mais de um arquivo com o mesmo valor (gerou de novo): fica o mais recente.
    const a = achado.sort((x, y) => y.nsa - x.nsa)[0];
    if (!a) { problemas.push(`${c.nome}, R$ ${brl}: o valor não bate com o que foi no arquivo. Confira e lance à mão.`); continue; }
    if (novos.some((n) => n.colaboradorId === a.id)) { problemas.push(`${a.nome} aparece duas vezes nesse PDF (R$ ${brl}). Confira no banco se foi pago em dobro.`); continue; }
    if (pagoAntes.has(a.id)) problemas.push(`Atenção: ${a.nome} já tinha um Pix confirmado nesta semana. Confira no banco se foi pago em dobro.`);
    novos.push({ colaboradorId: a.id, nome: a.nome, centavos: c.valorCentavos, arquivoId: a.arquivoId, nsa: a.nsa, quando: c.quando ?? `${hojeSP()}T12:00:00`, idTransacao: c.idTransacao });
  }

  // Quem já está lançado na semana (a conta existe): só falta marcar como paga.
  const supabase = await createClient();
  const { data: sps } = novos.length
    ? await supabase.from("semana_pagamentos").select("colaborador_id, lancamento_id").eq("segunda", segunda).in("colaborador_id", novos.map((n) => n.colaboradorId))
    : { data: [] as { colaborador_id: string; lancamento_id: string | null }[] };
  const lancado = new Map<string, string | null>();
  for (const s of (sps ?? []) as { colaborador_id: string; lancamento_id: string | null }[]) lancado.set(s.colaborador_id, s.lancamento_id);

  const encontrados: PagoConfirmado[] = novos.map((n) => ({
    colaboradorId: n.colaboradorId,
    nome: n.nome,
    valor: n.centavos / 100,
    data: n.quando.slice(0, 10),
    nsa: n.nsa,
    jaLancado: lancado.has(n.colaboradorId),
  }));
  if (!gravar || !novos.length) return { ok: true, encontrados, problemas, jaRegistrados, contasPagas: 0 };

  const { user } = await usuarioDaSessao();
  const { error } = await db.from("pagamento_lote_pagos").upsert(
    novos.map((n) => ({
      segunda,
      colaborador_id: n.colaboradorId,
      arquivo_id: n.arquivoId,
      valor: n.centavos / 100,
      id_transacao: n.idTransacao,
      pago_em: `${n.quando}-03:00`,
      criado_por: user?.id ?? null,
    })),
    { onConflict: "empresa_id,id_transacao", ignoreDuplicates: true },
  );
  if (error) return { ok: false, erro: "Não deu pra guardar os comprovantes. Confira a internet e tente de novo." };

  // Conta já lançada e ainda em aberto: vira paga, em Pix, na data do comprovante.
  let contasPagas = 0;
  for (const n of novos) {
    const lid = lancado.get(n.colaboradorId);
    if (!lid) continue;
    const dia = n.quando.slice(0, 10);
    const { data: up } = await supabase.from("lancamentos").update({ pago: true, pago_em: dia, forma_pagamento: "Pix" }).eq("id", lid).eq("pago", false).select("id");
    if (up?.length) contasPagas++;
  }
  revalidatePath("/colaboradores/semana");
  revalidatePath("/financeiro/contas");
  return { ok: true, encontrados, problemas, jaRegistrados, contasPagas };
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

  // Quem o banco já confirmou que recebeu nesta semana não entra de novo.
  const { data: pagosRows } = /^\d{4}-\d{2}-\d{2}$/.test(entrada.segunda)
    ? await db.from("pagamento_lote_pagos").select("colaborador_id").eq("segunda", entrada.segunda)
    : { data: [] as { colaborador_id: string }[] };
  const jaRecebeu = new Set(((pagosRows ?? []) as { colaborador_id: string }[]).map((r) => r.colaborador_id));

  const fora: string[] = [];
  const itens: (ItemPix & { colaboradorId: string })[] = [];
  const dia = entrada.dataPagamento.slice(2).replace(/-/g, "");
  for (const p of pedidos) {
    const col = porId.get(p.colaboradorId);
    if (!col) continue;
    if (jaRecebeu.has(col.id)) {
      fora.push(`${col.nome}: já recebeu por Pix nesta semana (comprovante do banco)`);
      continue;
    }
    const chave = normalizarChave(col.pix_tipo, col.pix_chave);
    if (!chave) {
      fora.push(`${col.nome}: ${col.pix_chave ? "chave Pix não confere com o tipo" : "sem chave Pix"}`);
      continue;
    }
    // O Sicoob exige o CPF/CNPJ de quem recebe (segmento B, posição 18–32),
    // mesmo quando a chave é celular ou e-mail.
    const doc = chave.tipo === "cpf" || chave.tipo === "cnpj" ? chave.chave : String(col.cpf ?? "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      fora.push(`${col.nome}: sem CPF no cadastro (o banco exige)`);
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
