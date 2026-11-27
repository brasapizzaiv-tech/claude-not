import { NovoPedido } from "./novo-client";
import { dadosDoPedido } from "./dados";

export const metadata = { title: "Novo pedido · Delivery" };

export default async function NovoPedidoPage() {
  return <NovoPedido {...await dadosDoPedido()} />;
}
