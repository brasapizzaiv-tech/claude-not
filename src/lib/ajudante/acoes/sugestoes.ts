import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { perfilDaSessao } from "@/lib/sessao";
import { texto, type Acao } from "./tipos";

// Sugestão para o sistema (migration 0317). Quando alguém quer fazer algo que o
// sistema ainda não tem, o Ajudante prepara o cartão "mandar a sugestão pro
// desenvolvedor"; a pessoa confirma e cai em Configurações → Sugestões do
// sistema, que só o dono vê. Vale pra QUALQUER login (é só um recado: não
// muda nada no sistema).

const sugerirMelhoria: Acao = {
  nome: "acao_sugerir_melhoria",
  descricao:
    "Manda uma SUGESTÃO DE MELHORIA para o desenvolvedor do sistema. Use quando a pessoa quiser fazer algo que o sistema ainda não tem " +
    "(segundo o manual e as ferramentas) e a ideia fizer sentido para o restaurante. Escreva o pedido do ponto de vista de quem usa " +
    "('Poder ... na tela X, porque ...'), claro e curto, e no contexto o que a pessoa estava tentando fazer. Não use para dúvidas que o " +
    "sistema já resolve nem para problemas de uso (aí explique como fazer). A pessoa confirma no cartão antes de mandar.",
  telas: ["/dashboard"],
  todos: true,
  parametros: {
    type: "object",
    properties: {
      pedido: { type: "string", description: "O que o sistema deveria passar a fazer (1 a 3 frases)." },
      contexto: { type: "string", description: "O que a pessoa estava tentando fazer e por quê (opcional)." },
      tela: { type: "string", description: "Tela do painel relacionada, se houver (ex.: /financeiro/contas)." },
    },
    required: ["pedido"],
    additionalProperties: false,
  },
  async preparar(_db, args) {
    const pedido = texto(args, "pedido", 3);
    if (pedido.length > 1000) throw new Error("O pedido ficou comprido demais: resuma em até 1.000 letras.");
    const contexto = typeof args.contexto === "string" ? args.contexto.trim().slice(0, 2000) : "";
    const tela = typeof args.tela === "string" && /^\/[\w\-/[\]]{0,120}$/.test(args.tela.trim()) ? args.tela.trim() : "";
    const perfil = await perfilDaSessao();
    const nome = perfil?.nome?.trim() || "Alguém da equipe";
    const detalhes = [`Sugestão: ${pedido}`];
    if (contexto) detalhes.push(`Contexto: ${contexto.slice(0, 180)}${contexto.length > 180 ? "…" : ""}`);
    if (tela) detalhes.push(`Tela: ${tela}`);
    detalhes.push(`Enviado por: ${nome}`);
    detalhes.push("Vai para a lista de sugestões do desenvolvedor. Não muda nada no sistema agora.");
    return { resumo: "Mandar esta sugestão para o desenvolvedor do sistema", detalhes, dados: { pedido, contexto: contexto || null, tela: tela || null, nome } };
  },
  async executar(dados) {
    const db = await createClient();
    const { error } = await db.from("sistema_sugestoes").insert({
      nome: String(dados.nome ?? "Alguém da equipe").slice(0, 120),
      pedido: String(dados.pedido ?? "").slice(0, 1000),
      contexto: dados.contexto ? String(dados.contexto).slice(0, 2000) : null,
      tela: dados.tela ? String(dados.tela) : null,
    });
    if (error) throw new Error("Não consegui mandar a sugestão agora. Tente de novo.");
    revalidatePath("/sugestoes");
    return "Sugestão enviada para o desenvolvedor. Obrigado!";
  },
};

export const ACOES_SUGESTOES: Acao[] = [sugerirMelhoria];
