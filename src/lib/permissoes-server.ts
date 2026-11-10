// Checagem de permissão DENTRO das server actions. O middleware só bloqueia a
// navegação entre páginas; uma action pode ser chamada direto por quem está
// logado em outra tela, então cada action sensível confere aqui também.
import { podeAcessar } from "@/lib/permissoes";
import { colaboradorGarcom } from "@/lib/garcom-auth";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";

// rota: uma rota ou uma lista (basta ter acesso a UMA delas).
export async function exigirAcesso(rota: string | string[]) {
  // Login e perfil da requisição (DES-001): a tela já buscou, aqui só reaproveita.
  const { user } = await usuarioDaSessao();
  const rotasPedidas = Array.isArray(rota) ? rota : [rota];
  if (!user) {
    // Garçom pelo app pessoal (sem login do sistema): só o que é do garçom.
    if (rotasPedidas.includes("/garcom") && (await colaboradorGarcom())) return;
    throw new Error("Faça login de novo.");
  }
  const prof = await perfilDaSessao();
  const admin = prof?.papel === "dono";
  const permissoes = (prof?.permissoes as string[] | null) ?? [];
  const rotas = Array.isArray(rota) ? rota : [rota];
  if (!rotas.some((r) => podeAcessar(r, admin, permissoes))) throw new Error("Sem permissão para esta ação.");
}
