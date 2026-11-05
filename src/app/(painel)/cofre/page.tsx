import { CofreTela } from "./cofre-tela";
import {
  buscarContasAbertas, cancelarEncomenda, conferirCofre, dadosDoCofre, desfazerMovimento, marcarEncomenda, pagarConta, registrarMovimento, salvarFaixas,
} from "./actions";

export const metadata = { title: "Cofre" };
export const dynamic = "force-dynamic";

export default async function CofrePage() {
  const dados = await dadosDoCofre();
  return (
    <CofreTela
      d={dados}
      acoes={{ registrarMovimento, pagarConta, buscarContasAbertas, conferirCofre, salvarFaixas, marcarEncomenda, cancelarEncomenda, desfazerMovimento }}
    />
  );
}
