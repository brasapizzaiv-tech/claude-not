// Reduz a foto no navegador antes de mandar pro servidor: o envio de uma ação
// do servidor tem limite de 1MB e foto de celular passa fácil disso (deu erro
// ao pôr a foto do combo de minis, 28/10/2026). Lado maior até `max` px, JPEG.
// Se o navegador não conseguir ler a imagem, devolve o arquivo como veio.
export async function comprimirFoto(file: File, max = 1200, qualidade = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size < 700 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // PNG transparente não fica preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", qualidade));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
