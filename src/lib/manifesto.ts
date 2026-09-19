import { lerMarca } from "@/lib/marca";

// Os manifests dos apps ("Adicionar à tela de início").
//
// Antes eram arquivos parados em public/, com a cor escrita na mão — e já
// estavam errados: o do sistema usava o laranja padrão do Tailwind e o do
// garçom estava AZUL. Agora saem do cadastro da empresa, igual ao resto.
//
// O nome vem da empresa, a cor de barra vem da cor da marca e o ícone vem do
// logo cadastrado. Um restaurante novo troca isso na tela de Aparência.

export type OpcoesManifesto = {
  /** Sufixo do nome, ex.: "Garçom" → "Brasa · Garçom". Vazio = só o nome. */
  sufixo?: string;
  descricao: string;
  startUrl: string;
  scope?: string;
  /** App escuro (garçom, entregador) abre com fundo escuro. */
  escuro?: boolean;
  /** Ícones próprios, quando existirem; senão usa o logo da empresa. */
  icones?: { src: string; sizes: string; type: string; purpose: string }[];
};

export async function manifestoDaEmpresa(o: OpcoesManifesto) {
  const marca = await lerMarca();
  const nomeCurto = "Brasa"; // TODO: virá de empresas.nome quando houver mais de uma

  return {
    name: o.sufixo ? `${nomeCurto} · ${o.sufixo}` : nomeCurto,
    short_name: o.sufixo || nomeCurto,
    description: o.descricao,
    start_url: o.startUrl,
    ...(o.scope ? { scope: o.scope } : {}),
    display: "standalone",
    orientation: "portrait",
    background_color: o.escuro ? marca.escuro : "#ffffff",
    theme_color: o.escuro ? marca.escuro : marca.primaria,
    icons: o.icones ?? [
      { src: marca.logoUrl, sizes: "any", type: "image/png", purpose: "any" },
    ],
  };
}

/** Resposta pronta, com o cabeçalho certo. */
export async function respostaManifesto(o: OpcoesManifesto) {
  const m = await manifestoDaEmpresa(o);
  return new Response(JSON.stringify(m, null, 2), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      // Muda quando a empresa troca de cor: não pode ficar preso no navegador.
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
