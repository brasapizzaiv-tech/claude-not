import { redirect } from "next/navigation";

// Os downloads foram pra Configurações → Downloads (19/11/2026), junto com a
// extensão do WhatsApp. Este endereço fica pra quem tinha guardado o link.
export default function DownloadsAntigo() {
  redirect("/downloads");
}
