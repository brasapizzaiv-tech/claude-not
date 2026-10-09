import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site-url";
import { empresaAtualId } from "@/lib/empresa";
import { urlCameraOk } from "@/lib/tv-camera-regras";

export { cameraPausada, urlCameraOk } from "@/lib/tv-camera-regras";

// Câmera do buffet na TV da cozinha (migration 0217, projeto app-buffet).
//
// A TV não consegue mostrar a câmera dentro da página do sistema: a página está
// na internet (https) e a câmera só existe dentro da rede da Brasa (http), e o
// navegador proíbe misturar. Então a TV VAI pra página da câmera enquanto ela
// estiver no ar, e a página da câmera devolve a TV quando a transmissão acaba.

/** Sem aviso há mais que isso = computador da câmera desligou ou caiu. */
export const CAMERA_AVISO_VALE_MS = 150_000;

/** Endereço da página da câmera se ela está no ar agora; senão null. */
export async function cameraNoAr(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const empresaId = await empresaAtualId();
    let q = admin.from("tv_camera").select("url, ao_vivo, visto_em, ativo");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    const { data } = await q.limit(1).maybeSingle();
    const c = data as { url: string; ao_vivo: boolean; visto_em: string; ativo: boolean } | null;
    if (!c || !c.ativo || !c.ao_vivo) return null;
    if (Date.now() - new Date(c.visto_em).getTime() > CAMERA_AVISO_VALE_MS) return null;
    return urlCameraOk(c.url);
  } catch {
    return null; // sem banco a TV segue na tela de sempre
  }
}

/** Pra onde a TV vai: a página da câmera, levando o endereço de volta. */
export function destinoCamera(cameraUrl: string, chave: string, modo: string) {
  const voltar = `${SITE_URL}/tv?chave=${encodeURIComponent(chave)}${modo ? `&modo=${encodeURIComponent(modo)}` : ""}`;
  return `${cameraUrl}?voltar=${encodeURIComponent(voltar)}`;
}
