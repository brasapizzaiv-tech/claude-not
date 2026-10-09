// Regras da câmera do buffet na TV que não dependem do servidor (podem rodar
// na tela da TV). O resto mora em src/lib/tv-camera.ts.

/** ?semcamera=<milissegundos> na URL da TV: a página da câmera devolveu a TV
 *  porque ela não conseguiu mostrar a imagem. Até essa hora, não manda de novo
 *  (no máximo 2 h, pra um número errado não desligar a câmera pra sempre). */
export function cameraPausada(semcamera: string | null | undefined): boolean {
  const ate = Number(semcamera);
  if (!Number.isFinite(ate) || ate <= 0) return false;
  const agora = Date.now();
  return ate > agora && ate - agora <= 2 * 3600_000;
}

/** Só endereço da rede interna (192.168.x.x, 10.x.x.x, 172.16–31.x.x). Assim,
 *  mesmo quem souber a chave da TV não consegue mandar a TV pra um site de fora. */
export function urlCameraOk(url: string): string | null {
  const m = /^http:\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d{2,5})?\/?$/.exec(url.trim());
  if (!m) return null;
  const [a, b, c, d] = m.slice(1, 5).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return null;
  const interna = a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  if (!interna) return null;
  return `http://${a}.${b}.${c}.${d}${m[5] ?? ""}/`;
}
