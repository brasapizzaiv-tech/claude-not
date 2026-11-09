import Link from "next/link";
import { exigirAcesso } from "@/lib/permissoes-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Icone } from "@/components/icone";

export const metadata = { title: "Downloads · Central de Impressões" };
export const dynamic = "force-dynamic";

// Instaladores dos agentes, pra baixar direto no PC do restaurante (pedido do
// Rafael, 09/11/2026). Ficam no bucket privado "instaladores" (migration 0285);
// quem sobe é o scripts/publicar-instaladores.mjs. O link vale 10 minutos.
const AGENTES = [
  {
    arquivo: "AgenteImpressao-Setup.exe",
    nome: "Agente de impressão",
    onde: "PC central (o do escritório)",
    texto: "Imprime etiquetas, comandas da cozinha, cupom da NFC-e e marmitas. Também lê o relógio de ponto.",
  },
  {
    arquivo: "AgenteBalanca-Setup.exe",
    nome: "Agente da balança",
    onde: "PC da balança do buffet",
    texto: "Lê o peso da balança e imprime o cupom do buffet.",
  },
  {
    arquivo: "AgenteTEF-Setup.exe",
    nome: "Agente do pinpad (TEF)",
    onde: "Cada PC de caixa com pinpad",
    texto: "Liga o caixa e o PDV ao pinpad pelo gerenciador da Elgin.",
  },
];

type Indice = Record<string, { versao: string; mb: number; em: string }>;

export default async function DownloadsPage() {
  await exigirAcesso("/impressao");
  const admin = createAdminClient();
  let indice: Indice = {};
  const { data } = await admin.storage.from("instaladores").download("versoes.json");
  if (data) {
    try { indice = JSON.parse(await data.text()) as Indice; } catch { /* índice vazio */ }
  }

  return (
    <div className="w-full p-4 sm:p-8">
      <Link href="/impressao" className="text-sm text-texto-suave hover:text-texto-marca">← Central de Impressões</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Downloads</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        Abra esta página no PC onde vai instalar e clique em Baixar. Pra atualizar, é só instalar por cima: o
        instalador pede o token, que está na Central de Impressões em &quot;ver dados do agente&quot;.
      </p>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {AGENTES.map((a) => {
          const i = indice[a.arquivo];
          return (
            <li key={a.arquivo} className="cartao flex flex-col p-5">
              <p className="rotulo">{a.onde}</p>
              <h2 className="mt-1 font-numero text-lg font-bold text-texto">{a.nome}</h2>
              <p className="mt-1 flex-1 text-sm text-texto-suave">{a.texto}</p>
              {i ? (
                <>
                  <p className="mt-3 text-xs text-texto-fraco">
                    Versão <b className="font-numero text-texto">{i.versao}</b> · {i.mb.toLocaleString("pt-BR")} MB · de{" "}
                    {new Date(i.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  <a href={`/impressao/downloads/baixar?arquivo=${encodeURIComponent(a.arquivo)}`} className="btn-principal mt-3 inline-flex items-center justify-center gap-2 text-sm">
                    <Icone nome="baixar" tamanho={16} /> Baixar
                  </a>
                </>
              ) : (
                <p className="mt-3 text-xs text-texto-fraco">Ainda não tem instalador publicado.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
