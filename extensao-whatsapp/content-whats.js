// Injetado na aba do WhatsApp Web depois que ela carrega com a mensagem
// pronta. Procura o botão Enviar, clica e confirma que a mensagem saiu.
// Devolve: "enviado" (com ✓) | "invalido" (número não tem WhatsApp) | "timeout" | texto do problema.
(async () => {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const SELETORES = [
    'footer button[aria-label="Enviar"]',
    'footer button[aria-label="Send"]',
    'button[aria-label="Enviar"][data-icon="wds-ic-send-filled"]',
    'span[data-icon="wds-ic-send-filled"]',
    'span[data-icon="send"]',
    '#main footer button[data-tab]',
  ];
  const INVALIDO = /inválido|invalid|não é válido|não está no WhatsApp|isn't on WhatsApp/i;

  // A caixa esvaziar NÃO quer dizer que a mensagem saiu: ela fica com o
  // reloginho até o WhatsApp entregar ao servidor. Fechar a aba nessa hora
  // deixava a mensagem com o ícone vermelho de erro (aconteceu com vários
  // fornecedores em 12/10/2026). Então espera o ✓ na última mensagem enviada.
  async function confirmarSaida() {
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const enviadas = document.querySelectorAll("#main .message-out");
      const ultima = enviadas[enviadas.length - 1];
      if (ultima) {
        const icones = [...ultima.querySelectorAll("[data-icon]")].map((e) => e.getAttribute("data-icon") || "");
        if (icones.some((i) => /^msg-(check|dblcheck)/.test(i))) return "enviado";
        if (icones.some((i) => /error|alert|failed/i.test(i))) return "erro no WhatsApp (ícone vermelho)";
      } else if (Date.now() - t0 > 10000 && !document.querySelector('#main [data-icon="msg-time"]')) {
        // Não achou a mensagem no chat (WhatsApp mudou o desenho) e não tem
        // nenhum reloginho na tela: considera enviada, como antes.
        return "enviado";
      }
      await esperar(800);
    }
    return "não confirmou (ficou no reloginho)";
  }

  const inicio = Date.now();
  const LIMITE = 60000;
  while (Date.now() - inicio < LIMITE) {
    // Número sem WhatsApp: aparece um aviso em vez do chat.
    const modal = document.querySelector('[data-animate-modal-popup="true"], [role="dialog"]');
    if (modal && INVALIDO.test(modal.textContent || "")) return "invalido";

    // Caixa de texto com a mensagem já dentro?
    const caixa = document.querySelector('#main footer [contenteditable="true"]');
    if (caixa && (caixa.textContent || "").trim().length > 0) {
      for (const sel of SELETORES) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const btn = el.tagName === "BUTTON" ? el : el.closest("button") || el;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("voz") || label.includes("voice")) continue;
        // Clique "completo" (o botão do WhatsApp ignora click() seco às vezes).
        for (const tipo of ["mouseenter", "mouseover", "mousedown", "mouseup", "click"]) {
          btn.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0 }));
        }
        await esperar(1500);
        // Enviou: caixa esvaziou (ou o ícone do microfone voltou).
        const depois = document.querySelector('#main footer [contenteditable="true"]');
        const vazia = !depois || (depois.textContent || "").trim().length === 0;
        if (vazia || document.querySelector('[data-icon="mic-outlined"], [data-icon="ptt"]')) {
          return await confirmarSaida();
        }
      }
      // Sem botão achado: tenta Enter na caixa.
      caixa.focus();
      caixa.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      await esperar(1500);
      const dep2 = document.querySelector('#main footer [contenteditable="true"]');
      if (!dep2 || (dep2.textContent || "").trim().length === 0) return await confirmarSaida();
    }
    await esperar(700);
  }
  return "timeout";
})();
