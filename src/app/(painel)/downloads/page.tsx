import { exigirAcesso } from "@/lib/permissoes-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Icone } from "@/components/icone";
import extensao from "../../../../extensao-whatsapp/manifest.json";
import { AGENTES, type IndiceAgentes } from "./agentes";

export const metadata = { title: "Downloads" };
export const dynamic = "force-dynamic";

// Tudo que se instala no PC, num lugar só, pra baixar de qualquer computador
// (pedido do Rafael, 19/11/2026). A extensão do WhatsApp vale pra toda empresa
// com Cotações; os agentes, só pra quem tem a Central de Impressões.
// O zip da extensão é gerado por scripts/empacotar-extensao.ps1 e fica em
// public/arquivos/ (fora das rotas sem login: só quem entrou baixa).
async function pode(rota: string) {
  try { await exigirAcesso(rota); return true; } catch { return false; }
}

export default async function DownloadsPage() {
  await exigirAcesso(["/cotacoes", "/impressao"]);
  const [comCotacao, comAgentes] = await Promise.all([pode("/cotacoes"), pode("/impressao")]);

  let indice: IndiceAgentes = {};
  if (comAgentes) {
    const { data } = await createAdminClient().storage.from("instaladores").download("versoes.json");
    if (data) {
      try { indice = JSON.parse(await data.text()) as IndiceAgentes; } catch { /* índice vazio */ }
    }
  }

  return (
    <div className="pagina">
      <h1 className="titulo-pagina">Downloads</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        Abra esta página no computador onde vai instalar e clique em Baixar.
      </p>

      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {comCotacao && (
          <li className="cartao flex flex-col p-5">
            <p className="rotulo">PC que fica com o WhatsApp Web aberto</p>
            <h2 className="mt-1 font-numero text-lg font-bold text-texto">{extensao.name}</h2>
            <p className="mt-1 text-sm text-texto-suave">
              Extensão do Chrome que manda sozinha o link da cotação pra cada fornecedor e marca Enviado na tela Cotação → Fornecedores.
            </p>
            <ol className="mt-3 flex-1 list-decimal space-y-1 pl-5 text-sm text-texto-suave">
              <li>Descompacte o arquivo numa pasta fixa, por exemplo <b className="text-texto">C:\motelli-whatsapp</b>.</li>
              <li>No Chrome, abra <b className="text-texto">chrome://extensions</b> e ligue o Modo do desenvolvedor.</li>
              <li>Clique em Carregar sem compactação e escolha a pasta.</li>
              <li>Pra atualizar: descompacte por cima da mesma pasta e clique em recarregar na extensão.</li>
            </ol>
            <p className="mt-3 text-xs text-texto-fraco">
              Versão <b className="font-numero text-texto">{extensao.version}</b>
            </p>
            <a href="/arquivos/motelli-whatsapp.zip" download className="btn-principal mt-3 inline-flex items-center justify-center gap-2 text-sm">
              <Icone nome="baixar" tamanho={16} /> Baixar
            </a>
          </li>
        )}

        {comAgentes &&
          AGENTES.map((a) => {
            const i = indice[a.arquivo];
            return (
              <li key={a.arquivo} className="cartao flex flex-col p-5">
                <p className="rotulo">{a.onde}</p>
                <h2 className="mt-1 font-numero text-lg font-bold text-texto">{a.nome}</h2>
                <p className="mt-1 flex-1 text-sm text-texto-suave">
                  {a.texto} Pra atualizar, é só instalar por cima: o instalador pede o token, que está na Central de Impressões em &quot;ver dados do agente&quot;.
                </p>
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
