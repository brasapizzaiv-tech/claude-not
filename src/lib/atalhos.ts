// Teclas rápidas do painel (pedido do Rafael, 27/11/2026, como no sistema
// antigo: F7 delivery, F8 frente de caixa). Fora as que o navegador usa
// (F1 ajuda, F3 busca, F5 recarregar, F6 endereço, F11 tela cheia, F12).
export const ATALHOS: { tecla: string; href: string; nome: string }[] = [
  { tecla: "F2", href: "/salao", nome: "Mesas e comandas" },
  { tecla: "F4", href: "/pdv", nome: "PDV balcão" },
  { tecla: "F7", href: "/delivery", nome: "Delivery" },
  { tecla: "F8", href: "/salao/caixa", nome: "Caixa" },
  { tecla: "F9", href: "/delivery/novo", nome: "Novo pedido do delivery" },
  { tecla: "F10", href: "/reservas", nome: "Reservas" },
];

export const teclaDe = (href: string) => ATALHOS.find((a) => a.href === href)?.tecla ?? null;
