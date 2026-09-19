import { lerMarca, cssDaMarca } from "@/lib/marca";

// Põe as cores da empresa na página (Etapa 3 do design).
//
// Entra no começo do layout, antes do conteúdo, então a cor já vale na
// primeira pintura: ninguém vê a tela trocar de cor depois de carregada.
//
// São quatro variáveis só. A escala inteira de claro a escuro é derivada
// delas pelo próprio CSS, em globals.css.
export async function CoresDaEmpresa() {
  const marca = await lerMarca();
  return <style>{cssDaMarca(marca)}</style>;
}
