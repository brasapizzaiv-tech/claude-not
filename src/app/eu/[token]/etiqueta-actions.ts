"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { tipoValido } from "@/lib/etiqueta-tipos";

async function colabDoToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_etiquetas")
    .eq("token", token)
    .maybeSingle();
  return data && data.ativo && data.faz_etiquetas ? data : null;
}

// Cria uma etiqueta pelo app do colaborador (entra na fila da impressora,
// uma vez por cópia).
export async function criarEtiquetaColab(token: string, dados: {
  tipo?: string;
  item_id: string;
  titulo?: string;
  texto?: string;
  conservacao: string;
  quantidade: string;
  unidade: string;
  validade: string;
  marca?: string;
  lote?: string;
  validade_original?: string;
  sif?: string;
  copias?: number;
}) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  const tipo = tipoValido(dados.tipo);
  const livre = tipo === "livre";

  let nome = "";
  let produtoId: string | null = null;
  let categoriaNome: string | null = null;
  if (livre) {
    nome = (dados.titulo || "").trim();
    if (!nome) return { ok: false as const, mensagem: "Informe o título." };
  } else {
    if (!dados.item_id) return { ok: false as const, mensagem: "Escolha o item." };
    if (!(Number((dados.quantidade || "").replace(",", ".")) > 0)) return { ok: false as const, mensagem: "Informe a quantidade (ex.: 1,5)." };
    if (!dados.validade) return { ok: false as const, mensagem: "Informe a validade." };
    const { data: item } = await admin
      .from("etiqueta_itens")
      .select("nome, produto_id, etiqueta_categorias(nome)")
      .eq("id", dados.item_id)
      .maybeSingle();
    if (!item) return { ok: false as const, mensagem: "Item não encontrado." };
    nome = item.nome as string;
    produtoId = (item.produto_id as string | null) ?? null;
    const cat = item.etiqueta_categorias as { nome?: string } | { nome?: string }[] | null;
    categoriaNome = (Array.isArray(cat) ? cat[0]?.nome : cat?.nome) ?? null;
  }

  // impressora: a única ativa (ou nenhuma se houver várias — cai na primeira).
  const { data: imps } = await admin.from("impressoras").select("id").eq("ativo", true).order("criado_em").limit(1);
  const impressoraId = imps?.[0]?.id ?? null;

  const { data, error } = await admin
    .from("etiquetas")
    .insert({
      tipo,
      item_id: livre ? null : dados.item_id,
      produto_id: produtoId,
      produto_nome: nome,
      categoria_nome: categoriaNome,
      colaborador_nome: colab.nome,
      validade: dados.validade || null,
      conservacao: livre ? null : dados.conservacao || null,
      quantidade: !livre && dados.quantidade ? Number(dados.quantidade.replace(",", ".")) || null : null,
      unidade: livre ? null : dados.unidade || null,
      marca: (dados.marca || "").trim() || null,
      lote: (dados.lote || "").trim() || null,
      validade_original: dados.validade_original || null,
      sif: (dados.sif || "").trim() || null,
      texto: livre ? (dados.texto || "").trim().slice(0, 200) || null : null,
      impressora_id: impressoraId,
    })
    .select("id, numero")
    .single();

  if (error || !data) return { ok: false as const, mensagem: error?.message || "Não foi possível gerar." };
  const copias = Math.min(Math.max(Math.floor(dados.copias ?? 1), 1), 10);
  await admin.from("impressao_fila").insert(
    Array.from({ length: copias }, () => ({ tipo: "etiqueta", ref_id: data.id, impressora_id: impressoraId })),
  );
  return { ok: true as const, id: data.id as string, numero: data.numero as number };
}

// Cadastro rápido de item de etiqueta pelo app (o "＋" da categoria).
export async function criarItemEtiquetaColab(token: string, d: {
  nome: string;
  categoria_id: string | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
}) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return null;
  const nome = (d.nome || "").trim();
  if (!nome) return null;
  const dias = (v: number | null) => (v == null ? null : Math.max(0, Math.floor(Number(v))) || null);
  const { data } = await admin
    .from("etiqueta_itens")
    .insert({
      nome,
      categoria_id: d.categoria_id || null,
      validade_congelado: dias(d.validade_congelado),
      validade_resfriado: dias(d.validade_resfriado),
      validade_ambiente: dias(d.validade_ambiente),
    })
    .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente")
    .single();
  return data ?? null;
}

// Consulta uma etiqueta lida pelo QR (para montar a lista antes da baixa).
export async function consultarEtiquetaColab(token: string, etiquetaId: string) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  const { data } = await admin
    .from("etiquetas")
    .select("id, numero, produto_nome, status")
    .eq("id", etiquetaId)
    .maybeSingle();
  if (!data) return { ok: false as const, mensagem: "Etiqueta não encontrada." };
  return {
    ok: true as const,
    id: data.id as string,
    numero: data.numero as number,
    produto: data.produto_nome as string,
    status: data.status as string,
  };
}

// Consulta pelo NÚMERO impresso na etiqueta (quando o QR não lê).
export async function consultarEtiquetaPorNumeroColab(token: string, numero: number) {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  if (!Number.isFinite(numero) || numero <= 0) return { ok: false as const, mensagem: "Número inválido." };
  const { data } = await admin
    .from("etiquetas")
    .select("id, numero, produto_nome, status")
    .eq("numero", numero)
    .maybeSingle();
  if (!data) return { ok: false as const, mensagem: `Etiqueta nº ${numero} não encontrada.` };
  return {
    ok: true as const,
    id: data.id as string,
    numero: data.numero as number,
    produto: data.produto_nome as string,
    status: data.status as string,
  };
}

// Dá baixa em várias etiquetas de uma vez (só as que ainda estão ativas).
export async function darBaixaLoteColab(token: string, ids: string[], status: "usada" | "descartada") {
  const admin = createAdminClient();
  const colab = await colabDoToken(token);
  if (!colab) return { ok: false as const, mensagem: "Sem acesso." };
  if (!ids?.length) return { ok: false as const, mensagem: "Nada para dar baixa." };
  const { data } = await admin
    .from("etiquetas")
    .update({ status, baixa_em: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "ativa")
    .select("id");
  return { ok: true as const, quantidade: data?.length ?? 0 };
}
