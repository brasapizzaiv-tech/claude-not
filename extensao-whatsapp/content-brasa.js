// Roda nas páginas do sistema da Brasa. Faz duas coisas:
//  1) quando a extensão pede, lista os botões "Envio manual" da tela de
//     fornecedores da cotação (links do WhatsApp com a mensagem pronta);
//  2) quando a extensão avisa que enviou, repassa pra página marcar "✓ Enviado".
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "coletarLinks") {
    const links = [...document.querySelectorAll('a[data-whatsapp="1"]')].map((a) => ({
      id: a.getAttribute("data-fornecedor-id") || "",
      nome: a.getAttribute("data-fornecedor-nome") || "",
      telefone: a.getAttribute("data-telefone") || "",
      href: a.href,
      enviado: a.getAttribute("data-enviado") === "1",
    }));
    sendResponse({ ok: true, links, titulo: document.title });
    return true;
  }
  if (msg?.action === "marcarEnviado") {
    window.postMessage({ type: "BRASA_WHATS_ENVIADO", id: msg.id }, "*");
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
