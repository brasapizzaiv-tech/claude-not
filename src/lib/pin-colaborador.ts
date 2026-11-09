import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confere o PIN do app da equipe (/eu) contando os erros: 5 erros seguidos
 * travam a pessoa por 15 minutos, mesmo com o PIN certo (migration 0278,
 * auditoria SEC-05). Toda tela/ação que compara o PIN do cookie passa por aqui,
 * no lugar de `colab.pin !== pin`, senão vira porta pra testar os 10 mil PINs.
 * Quem chama continua tratando "pessoa sem PIN" do jeito de cada tela.
 */
export async function pinConfere(token: string, pin: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("colab_pin_ok", { p_token: token, p_pin: pin });
  return !error && data === true;
}

/** A pessoa está travada agora por erro de PIN? (pra tela dizer "espere"). */
export async function pinTravado(token: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("colab_pin_travado", { p_token: token });
  return data === true;
}
